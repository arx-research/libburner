// Manual ix builders for the burner_wallet program.
//
// We hand-roll the Anchor wire format (8-byte discriminator + Borsh args)
// rather than depending on `@coral-xyz/anchor` so libburner stays slim and
// usable from anywhere (no IDL JSON shipped, no Anchor runtime).

import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

import {
  BURNER_PROGRAM_ID,
} from "./constants.js";
import { DISC } from "./discriminators.js";
import { serializeExecuteK1 } from "./canonical.js";
import {
  ExecuteK1,
  Operation,
  packAccountFlags,
} from "./types.js";

// ----------------------------------------------------------------------------
// Wire serialization of Operation (differs from canonical for Invoke)
// ----------------------------------------------------------------------------

/**
 * Borsh wire bytes for one Operation, as deserialized by the on-chain program.
 *
 * For `Invoke`, the wire form carries only `flags: Vec<u8>` and `data: Vec<u8>`;
 * the on-chain code reconstructs the account list from `remaining_accounts`
 * (the canonical-form pubkeys come from those). That's why `canonical.ts` and
 * this file diverge for the Invoke variant.
 */
export function serializeOperationWire(op: Operation): Uint8Array {
  switch (op.kind) {
    case "transferSpl": {
      const out = new Uint8Array(1 + 32 + 32 + 8 + 1);
      let o = 0;
      out[o++] = 0;
      out.set(op.mint.toBytes(), o); o += 32;
      out.set(op.to.toBytes(), o); o += 32;
      writeU64LE(out, o, op.amount); o += 8;
      out[o++] = op.decimals & 0xff;
      return out;
    }
    case "transferSol": {
      const out = new Uint8Array(1 + 32 + 8);
      let o = 0;
      out[o++] = 1;
      out.set(op.to.toBytes(), o); o += 32;
      writeU64LE(out, o, op.lamports); o += 8;
      return out;
    }
    case "invoke": {
      const flags = op.accounts.map(packAccountFlags);
      const out = new Uint8Array(1 + 32 + 4 + flags.length + 4 + op.data.length);
      let o = 0;
      out[o++] = 2;
      out.set(op.programId.toBytes(), o); o += 32;
      writeU32LE(out, o, flags.length); o += 4;
      out.set(new Uint8Array(flags), o); o += flags.length;
      writeU32LE(out, o, op.data.length); o += 4;
      out.set(op.data, o);
      return out;
    }
  }
}

// ----------------------------------------------------------------------------
// initialize
// ----------------------------------------------------------------------------

export interface InitializeAccounts {
  wallet: PublicKey;
  vault: PublicKey;
  payer: PublicKey;
  programId?: PublicKey;
}

export function buildInitializeIx(
  k1Addr: Uint8Array,
  accounts: InitializeAccounts
): TransactionInstruction {
  if (k1Addr.length !== 20) throw new Error("k1Addr must be 20 bytes");
  const data = concat(DISC.initialize, k1Addr);
  const keys: AccountMeta[] = [
    { pubkey: accounts.wallet, isSigner: false, isWritable: true },
    { pubkey: accounts.vault, isSigner: false, isWritable: false },
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    keys,
    programId: accounts.programId ?? BURNER_PROGRAM_ID,
    data: Buffer.from(data),
  });
}

// ----------------------------------------------------------------------------
// Vault ATA creation (SPL Associated Token Account program, not burner_wallet)
// ----------------------------------------------------------------------------

export interface CreateTokenAccountAccounts {
  vault: PublicKey;
  mint: PublicKey;
  /** Pass undefined to derive the canonical ATA from (vault, mint, tokenProgram). */
  tokenAccount?: PublicKey;
  payer: PublicKey;
  tokenProgram?: PublicKey; // defaults to SPL Token
}

/**
 * Create the vault's ATA for `mint`, idempotently.
 *
 * This targets the SPL Associated Token Account program directly — burner_wallet
 * has no `create_token_account` instruction. It never needed one: the ATA
 * program derives the address from (owner, token_program, mint) and does not
 * require the owner to sign, so it happily creates an account for an off-curve
 * PDA like the vault. Wrapping it on-chain only added an unauthenticated entry
 * point that took three unchecked accounts.
 */
export function buildCreateTokenAccountIx(
  accounts: CreateTokenAccountAccounts
): TransactionInstruction {
  const tokenProgram = accounts.tokenProgram ?? TOKEN_PROGRAM_ID;
  const tokenAccount =
    accounts.tokenAccount ??
    getAssociatedTokenAddressSync(accounts.mint, accounts.vault, true, tokenProgram);
  return createAssociatedTokenAccountIdempotentInstruction(
    accounts.payer,
    tokenAccount,
    accounts.vault,
    accounts.mint,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

// ----------------------------------------------------------------------------
// execute
// ----------------------------------------------------------------------------

export interface ExecuteAccounts {
  wallet: PublicKey;
  vault: PublicKey;
  /** Pass undefined for None (using program-id sentinel under the hood). */
  userAllowlist?: PublicKey;
  /**
   * Per-wallet dangerous-invoke timelock config. Pass undefined for None (the
   * Op::Invoke safety filter then applies). Only needs to be supplied when a
   * caller relies on an armed+elapsed dangerous-mode to run a filtered CPI.
   */
  dangerConfig?: PublicKey;
  /**
   * Per-op remaining accounts, in cursor order:
   *   - TransferSol:        [recipient]
   *   - TransferSpl:        [source, dest, mint, token_program]
   *   - Invoke:             [...inner_accounts, target_program]
   *
   * The order across ops must match `ops`. Each entry's flags reflect what the
   * on-chain CPI needs (vault is typically writable + signer-via-seeds; etc.).
   */
  remainingAccounts: AccountMeta[];
  programId?: PublicKey;
}

export function buildExecuteIx(
  executeMsg: ExecuteK1,
  ops: Operation[],
  accounts: ExecuteAccounts
): TransactionInstruction {
  const programId = accounts.programId ?? BURNER_PROGRAM_ID;

  // Data: discriminator | ExecuteK1 (101) | Vec<Operation>
  const msgBytes = serializeExecuteK1(executeMsg);
  const opWires = ops.map(serializeOperationWire);
  const opsTotal = opWires.reduce((n, w) => n + w.length, 0);

  const data = new Uint8Array(8 + msgBytes.length + 4 + opsTotal);
  let o = 0;
  data.set(DISC.execute, o); o += 8;
  data.set(msgBytes, o); o += msgBytes.length;
  writeU32LE(data, o, ops.length); o += 4;
  for (const w of opWires) { data.set(w, o); o += w.length; }

  // Anchor uses the program-id pubkey as the "None" sentinel for Option<Account>.
  const noneSentinel: PublicKey = programId;
  const keys: AccountMeta[] = [
    { pubkey: accounts.wallet, isSigner: false, isWritable: true },
    { pubkey: accounts.vault, isSigner: false, isWritable: true },
    { pubkey: accounts.userAllowlist ?? noneSentinel, isSigner: false, isWritable: false },
    { pubkey: accounts.dangerConfig ?? noneSentinel, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ...accounts.remainingAccounts,
  ];

  return new TransactionInstruction({ keys, programId, data: Buffer.from(data) });
}

// ----------------------------------------------------------------------------
// Per-wallet allowlist instructions (chip-signed)
// ----------------------------------------------------------------------------

export interface UserAllowlistInitAccounts {
  wallet: PublicKey;
  allowlist: PublicKey;
  payer: PublicKey;
  programId?: PublicKey;
}

export function buildInitUserAllowlistIx(
  expirySlot: bigint,
  accounts: UserAllowlistInitAccounts
): TransactionInstruction {
  const data = new Uint8Array(8 + 8);
  data.set(DISC.init_user_allowlist, 0);
  writeU64LE(data, 8, expirySlot);
  return new TransactionInstruction({
    keys: [
      { pubkey: accounts.wallet, isSigner: false, isWritable: true },
      { pubkey: accounts.allowlist, isSigner: false, isWritable: true },
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: accounts.programId ?? BURNER_PROGRAM_ID,
    data: Buffer.from(data),
  });
}

export interface UserAllowlistAddAccounts {
  wallet: PublicKey;
  allowlist: PublicKey;
  payer: PublicKey;
  programId?: PublicKey;
}

export function buildUserAllowlistAddIx(
  program: PublicKey,
  expirySlot: bigint,
  accounts: UserAllowlistAddAccounts
): TransactionInstruction {
  const data = new Uint8Array(8 + 32 + 8);
  let o = 0;
  data.set(DISC.user_allowlist_add, o); o += 8;
  data.set(program.toBytes(), o); o += 32;
  writeU64LE(data, o, expirySlot);
  return new TransactionInstruction({
    keys: [
      { pubkey: accounts.wallet, isSigner: false, isWritable: true },
      { pubkey: accounts.allowlist, isSigner: false, isWritable: true },
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: accounts.programId ?? BURNER_PROGRAM_ID,
    data: Buffer.from(data),
  });
}

export function buildUserAllowlistRemoveIx(
  program: PublicKey,
  expirySlot: bigint,
  accounts: UserAllowlistAddAccounts
): TransactionInstruction {
  const data = new Uint8Array(8 + 32 + 8);
  let o = 0;
  data.set(DISC.user_allowlist_remove, o); o += 8;
  data.set(program.toBytes(), o); o += 32;
  writeU64LE(data, o, expirySlot);
  return new TransactionInstruction({
    keys: [
      { pubkey: accounts.wallet, isSigner: false, isWritable: true },
      { pubkey: accounts.allowlist, isSigner: false, isWritable: true },
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: accounts.programId ?? BURNER_PROGRAM_ID,
    data: Buffer.from(data),
  });
}

// ----------------------------------------------------------------------------
// Dangerous-invoke timelock (chip-signed)
// ----------------------------------------------------------------------------

export interface SetDangerousInvokeAccounts {
  wallet: PublicKey;
  dangerConfig: PublicKey;
  payer: PublicKey;
  programId?: PublicKey;
}

/**
 * Arm (`armed = true`) or disarm (`armed = false`) dangerous-invoke mode.
 *
 * One instruction for both directions. The direction is NOT interchangeable on
 * the wire — the chip message carries a distinct tag per direction, which the
 * program rebuilds from this `armed` argument, so a signature obtained for one
 * cannot be submitted as the other. See `dangerMessageBytes`.
 */
export function buildSetDangerousInvokeIx(
  armed: boolean,
  expirySlot: bigint,
  accounts: SetDangerousInvokeAccounts
): TransactionInstruction {
  const data = new Uint8Array(8 + 1 + 8);
  data.set(DISC.set_dangerous_invoke, 0);
  data[8] = armed ? 1 : 0;
  writeU64LE(data, 9, expirySlot);
  return new TransactionInstruction({
    keys: [
      { pubkey: accounts.wallet, isSigner: false, isWritable: true },
      { pubkey: accounts.dangerConfig, isSigner: false, isWritable: true },
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: accounts.programId ?? BURNER_PROGRAM_ID,
    data: Buffer.from(data),
  });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function writeU64LE(buf: Uint8Array, offset: number, value: bigint): void {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new Error(`u64 out of range: ${value}`);
  }
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  if (value < 0 || value > 0xffffffff) throw new Error(`u32 out of range: ${value}`);
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
