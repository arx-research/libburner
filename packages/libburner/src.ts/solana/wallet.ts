import {
  AccountMeta,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Finality,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3";

import {
  BURNER_PROGRAM_ID,
  Cluster,
  DANGEROUS_INVOKE_DELAY_SLOTS,
  DOMAIN_BYTES,
  EXECUTE_MSG_VERSION,
  MAX_OPS,
  MIN_VAULT_BALANCE,
  SECP256K1_PROGRAM_ID,
  clusterBytes,
} from "./constants.js";
import {
  computeOpsHash,
  executeK1Digest,
} from "./canonical.js";
import {
  buildAddSuccessorIx,
  buildArmDangerousInvokeIx,
  buildCreateTokenAccountIx,
  buildDisarmDangerousInvokeIx,
  buildExecuteIx,
  buildInitSuccessorsIx,
  buildInitUserAllowlistIx,
  buildInitializeIx,
  buildRemoveSuccessorIx,
  buildUserAllowlistAddIx,
  buildUserAllowlistRemoveIx,
} from "./builders.js";
import { buildSecp256k1Ix, patchSecpIxSelfReference } from "./secp.js";
import {
  deriveMigrationDestination,
  deriveSuccessorsPDA,
  deriveWalletPDAs,
  WalletPDAs,
} from "./pdas.js";
import { ChipSigner, FeePayerSigner } from "./signers.js";
import {
  ExecuteK1,
  MigrateAssetKind,
  Operation,
} from "./types.js";

// Default lifetime (in slots) for a signed payload before it expires. 150
// slots ≈ 1 minute at ~400ms/slot.
const DEFAULT_EXPIRY_OFFSET = 150n;

export interface SolanaBurnerWalletOpts {
  connection: Connection;
  /** Chip identity (must have `address` + `sign`). */
  chip: ChipSigner;
  /** Fee payer for execute / init txs. Pays Solana fees + ed25519-signs the tx. */
  feePayer: FeePayerSigner;
  /** Defaults to the canonical burner_wallet program ID (v5). */
  programId?: PublicKey;
  /** Cluster string baked into ExecuteK1. Defaults to "devnet". */
  cluster?: Cluster;
  /** Override expiry-slot offset (default: 150 slots). */
  defaultExpiryOffset?: bigint;
  /** RPC commitment level for confirmation polling. */
  finality?: Finality;
  /**
   * Optional: callback returning the priority fee (micro-lamports per CU) to
   * attach to each `send()`. Invoked once per send with the instruction set
   * about to be submitted, so callers can size the fee against the work
   * (Helius `getPriorityFeeEstimate` accepts a tx; pass through if available).
   *
   * Return 0 to skip the priority-fee ix.
   */
  getPriorityFeeMicroLamports?: (
    ixs: TransactionInstruction[]
  ) => Promise<number> | number;
  /**
   * Optional: compute-unit limit to request. ComputeBudgetProgram default is
   * 200K CU per ix * number-of-ixs, capped at 1.4M; explicit limits land more
   * reliably and let the priority-fee math be predictable. Common settings:
   *   • 200_000   — simple transfers (SOL or single SPL)
   *   • 400_000   — execute with multiple inner ix's (default if undefined)
   *   • 1_400_000 — Jupiter swaps / large CPI chains (max)
   */
  computeUnitLimit?: number;
}

export interface TokenBalance {
  mint: PublicKey;
  amount: bigint;
  decimals: number;
  tokenProgram: PublicKey;
  ata: PublicKey;
}

/** Decoded per-wallet dangerous-invoke timelock state. */
export interface DangerConfigState {
  /** Slot at which the account exists and was armed (0 = disarmed). */
  armedSlot: bigint;
  /** True once armed (armedSlot != 0), whether or not the delay has elapsed. */
  armed: boolean;
  /** True once armed AND the timelock has fully elapsed — the filter is lifted. */
  active: boolean;
  /** Slot at which an armed config becomes active (null if disarmed). */
  activatesAtSlot: bigint | null;
  /** Slots remaining until active (0 if active or disarmed). */
  slotsUntilActive: bigint;
  /** Slot observed when this snapshot was taken. */
  currentSlot: bigint;
}

/** Aggregate on-chain state for one burner wallet — for diagnostics/dev pages. */
export interface ProgramState {
  programId: PublicKey;
  cluster: Cluster;
  wallet: PublicKey;
  vault: PublicKey;
  /** True once the wallet PDA exists (nonce readable). */
  initialized: boolean;
  nonce: bigint | null;
  vaultLamports: bigint;
  userAllowlist: PublicKey;
  /** null if the allowlist account has not been created. */
  allowlistPrograms: PublicKey[] | null;
  dangerConfig: PublicKey;
  /** null if the danger config account has not been created (never armed). */
  danger: DangerConfigState | null;
}

/**
 * High-level entry point for a single chip-controlled Solana wallet.
 *
 * The class is signer-agnostic — pass an in-memory ChipSigner for tests, or
 * a HaLo Gateway-backed one in the app. Same for the fee payer (local Keypair
 * vs hosted relayer endpoint).
 */
export class SolanaBurnerWallet {
  readonly connection: Connection;
  readonly chip: ChipSigner;
  readonly feePayer: FeePayerSigner;
  readonly programId: PublicKey;
  readonly cluster: Cluster;
  readonly defaultExpiryOffset: bigint;
  readonly finality: Finality;
  readonly addresses: WalletPDAs;
  readonly getPriorityFeeMicroLamports?: SolanaBurnerWalletOpts["getPriorityFeeMicroLamports"];
  readonly computeUnitLimit?: number;

  constructor(opts: SolanaBurnerWalletOpts) {
    this.connection = opts.connection;
    this.chip = opts.chip;
    this.feePayer = opts.feePayer;
    this.programId = opts.programId ?? BURNER_PROGRAM_ID;
    this.cluster = opts.cluster ?? "devnet";
    this.defaultExpiryOffset = opts.defaultExpiryOffset ?? DEFAULT_EXPIRY_OFFSET;
    this.finality = opts.finality ?? "confirmed";
    this.addresses = deriveWalletPDAs(opts.chip.address, this.programId);
    this.getPriorityFeeMicroLamports = opts.getPriorityFeeMicroLamports;
    this.computeUnitLimit = opts.computeUnitLimit;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Returns wallet nonce, or null if the wallet PDA has not been initialized. */
  async fetchNonce(): Promise<bigint | null> {
    const info = await this.connection.getAccountInfo(this.addresses.wallet);
    if (!info) return null;
    // Layout: 8 discriminator | 20 k1 | 8 nonce LE | 1 bump | 1 vault_bump
    if (info.data.length < 8 + 20 + 8 + 1 + 1) return null;
    const nonceBytes = info.data.slice(28, 36);
    let n = 0n;
    for (let i = 7; i >= 0; i--) n = (n << 8n) | BigInt(nonceBytes[i]);
    return n;
  }

  async getVaultBalance(): Promise<bigint> {
    const lamports = await this.connection.getBalance(this.addresses.vault, this.finality);
    return BigInt(lamports);
  }

  /** Token balances held by the vault, across both SPL Token + Token-2022. */
  async getTokenBalances(): Promise<TokenBalance[]> {
    const out: TokenBalance[] = [];
    for (const tp of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      const { value } = await this.connection.getParsedTokenAccountsByOwner(
        this.addresses.vault,
        { programId: tp }
      );
      for (const acct of value) {
        const info: any = acct.account.data.parsed?.info;
        if (!info) continue;
        out.push({
          ata: acct.pubkey,
          mint: new PublicKey(info.mint),
          amount: BigInt(info.tokenAmount.amount),
          decimals: info.tokenAmount.decimals,
          tokenProgram: tp,
        });
      }
    }
    return out;
  }

  /** Fetch the user's allowlist, or null if not initialized. */
  async fetchAllowlist(): Promise<PublicKey[] | null> {
    const info = await this.connection.getAccountInfo(this.addresses.userAllowlist);
    if (!info) return null;
    // Layout: 8 discriminator | 32 wallet | 4 vec_len | N*32 pubkeys | 1 bump
    if (info.data.length < 8 + 32 + 4 + 1) return null;
    const data = info.data;
    const vecLen = data.readUInt32LE(40);
    const out: PublicKey[] = [];
    for (let i = 0; i < vecLen; i++) {
      const start = 44 + i * 32;
      if (start + 32 > data.length - 1) break;
      out.push(new PublicKey(data.slice(start, start + 32)));
    }
    return out;
  }

  /**
   * Fetch the wallet's dangerous-invoke timelock state, or null if it has
   * never been armed (account doesn't exist).
   */
  async fetchDangerConfig(): Promise<DangerConfigState | null> {
    const info = await this.connection.getAccountInfo(this.addresses.dangerConfig);
    if (!info) return null;
    // Layout: 8 discriminator | 32 wallet | 8 armed_slot LE | 1 bump
    if (info.data.length < 8 + 32 + 8 + 1) return null;
    const armedSlot = readU64LE(info.data, 40);
    const currentSlot = BigInt(await this.connection.getSlot(this.finality));
    const armed = armedSlot !== 0n;
    const activatesAtSlot = armed ? armedSlot + DANGEROUS_INVOKE_DELAY_SLOTS : null;
    const active = activatesAtSlot !== null && currentSlot >= activatesAtSlot;
    const slotsUntilActive =
      activatesAtSlot !== null && currentSlot < activatesAtSlot
        ? activatesAtSlot - currentSlot
        : 0n;
    return { armedSlot, armed, active, activatesAtSlot, slotsUntilActive, currentSlot };
  }

  /**
   * One-shot aggregate of the on-chain state for this wallet — wallet PDA,
   * vault balance, allowlist, and dangerous-mode timelock. Intended for
   * diagnostic / developer UIs.
   */
  async fetchProgramState(): Promise<ProgramState> {
    const [nonce, vaultLamports, allowlistPrograms, danger] = await Promise.all([
      this.fetchNonce(),
      this.getVaultBalance(),
      this.fetchAllowlist(),
      this.fetchDangerConfig(),
    ]);
    return {
      programId: this.programId,
      cluster: this.cluster,
      wallet: this.addresses.wallet,
      vault: this.addresses.vault,
      initialized: nonce !== null,
      nonce,
      vaultLamports,
      userAllowlist: this.addresses.userAllowlist,
      allowlistPrograms,
      dangerConfig: this.addresses.dangerConfig,
      danger,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle (fee-payer-only, no chip)
  // -------------------------------------------------------------------------

  async initialize(): Promise<string> {
    const ix = buildInitializeIx(this.chip.address, {
      wallet: this.addresses.wallet,
      vault: this.addresses.vault,
      payer: this.feePayer.publicKey,
      programId: this.programId,
    });
    return this.sendFeePayerOnly([ix]);
  }

  /** Idempotent: returns the existing ATA address if already created. */
  async createTokenAccount(
    mint: PublicKey,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): Promise<{ ata: PublicKey; signature: string | null }> {
    const ata = getAssociatedTokenAddressSync(mint, this.addresses.vault, true, tokenProgram);
    const existing = await this.connection.getAccountInfo(ata);
    if (existing) return { ata, signature: null };

    const ix = buildCreateTokenAccountIx({
      wallet: this.addresses.wallet,
      vault: this.addresses.vault,
      mint,
      tokenAccount: ata,
      payer: this.feePayer.publicKey,
      tokenProgram,
      programId: this.programId,
    });
    const signature = await this.sendFeePayerOnly([ix]);
    return { ata, signature };
  }

  // -------------------------------------------------------------------------
  // Chip-signed: typed ops
  // -------------------------------------------------------------------------

  async transferSol(
    to: PublicKey,
    lamports: bigint,
    opts: { expirySlotOffset?: bigint } = {}
  ): Promise<string> {
    if (lamports <= 0n) throw new Error("lamports must be positive");
    return this.executeOps([
      { kind: "transferSol", to, lamports }
    ], [
      [{ pubkey: to, isSigner: false, isWritable: true }],
    ], opts);
  }

  async transferSpl(
    mint: PublicKey,
    to: PublicKey,
    amount: bigint,
    decimals: number,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
    opts: { expirySlotOffset?: bigint } = {}
  ): Promise<string> {
    const source = getAssociatedTokenAddressSync(mint, this.addresses.vault, true, tokenProgram);
    const dest = getAssociatedTokenAddressSync(mint, to, true, tokenProgram);
    return this.executeOps(
      [{ kind: "transferSpl", mint, to, amount, decimals }],
      [[
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: dest, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ]],
      opts
    );
  }

  /**
   * Generic Op::Invoke. Caller supplies the inner instruction.
   * `programId` must be in the implicit-infra set or the user's allowlist.
   */
  async invoke(
    inner: TransactionInstruction,
    opts: { expirySlotOffset?: bigint } = {}
  ): Promise<string> {
    return this.invokeMany([inner], opts);
  }

  /**
   * Multi-ix Op::Invoke — runs all `inners` atomically inside ONE
   * burner_wallet::execute call (single chip signature). Use for flows like
   * Jupiter swap where setupInstructions[], swapInstruction, and
   * cleanupInstruction all need to execute as one unit.
   *
   * Limits:
   *   • inners.length ≤ MAX_OPS (8)
   *   • each inner ix's account count ≤ MAX_ACCOUNTS_PER_INVOKE (32)
   *   • each inner ix's data length ≤ MAX_INVOKE_DATA_LEN (512)
   *
   * Caller must ensure every inner's `programId` is in the implicit-infra set
   * OR has been added to the user's allowlist (passed via `userAllowlist`).
   */
  async invokeMany(
    inners: TransactionInstruction[],
    opts: {
      expirySlotOffset?: bigint
      userAllowlist?: PublicKey
      successors?: PublicKey
      /**
       * Supply the wallet's DangerConfig PDA to run inner ix's that the default
       * Op::Invoke safety filter blocks (e.g. SPL-Token Approve/SetAuthority,
       * System Assign). Only takes effect once dangerous-mode has been armed
       * AND its timelock has elapsed; otherwise the program still blocks the
       * filtered instruction. Pass `wallet.addresses.dangerConfig`.
       */
      dangerConfig?: PublicKey
      /**
       * Optional Address Lookup Table addresses to use for v0 transaction
       * compression. Required for large CPI chains (e.g. Jupiter swaps)
       * where the inline accounts would exceed the legacy 1232-byte tx
       * size cap. libburner fetches the ALT accounts from RPC; pass the
       * addresses Jupiter returns in `addressLookupTableAddresses`.
       */
      addressLookupTableAddresses?: PublicKey[]
    } = {}
  ): Promise<string> {
    if (inners.length === 0) throw new Error("inners must be non-empty");
    if (inners.length > MAX_OPS) {
      throw new Error(`too many ops: ${inners.length} > MAX_OPS (${MAX_OPS})`);
    }
    const ops: Operation[] = inners.map((ix) => ({
      kind: "invoke",
      programId: ix.programId,
      accounts: ix.keys.map((k) => ({
        pubkey: k.pubkey,
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: new Uint8Array(ix.data),
    }));
    // OUTER-tx remaining_accounts: force is_signer=false. The on-chain CPI
    // builder uses the OP-DATA flags (above) for is_signer; remaining_accounts
    // is just the pubkey list. Marking everything is_signer=false here lets
    // the program sign for PDAs via invoke_signed without requiring tx-level
    // signatures for accounts that can't actually sign (PDAs).
    const perOpRemaining: AccountMeta[][] = inners.map((ix) => [
      ...ix.keys.map((k) => ({
        pubkey: k.pubkey,
        isSigner: false,
        isWritable: k.isWritable,
      })),
      { pubkey: ix.programId, isSigner: false, isWritable: false },
    ]);
    return this.executeOps(
      ops,
      perOpRemaining,
      {
        expirySlotOffset: opts.expirySlotOffset,
        addressLookupTableAddresses: opts.addressLookupTableAddresses,
      },
      { userAllowlist: opts.userAllowlist, successors: opts.successors, dangerConfig: opts.dangerConfig }
    );
  }

  /**
   * Heterogeneous batch — mix native Op::TransferSol with Op::Invoke entries
   * inside a single chip-signed execute. Required for swap flows that need
   * to move native SOL into a WSOL ATA before invoking the DEX: wrapping the
   * System.transfer as an Op::Invoke costs ~96 bytes more wire-size than
   * using the native op (which omits the system program from
   * remaining_accounts and uses a compact op-data encoding).
   */
  async executeMixed(
    specs: Array<
      | { kind: "transferSol"; to: PublicKey; lamports: bigint }
      | { kind: "invoke"; ix: TransactionInstruction }
    >,
    opts: {
      expirySlotOffset?: bigint
      userAllowlist?: PublicKey
      successors?: PublicKey
      /** See `invokeMany` — supply to run filter-blocked ix's under armed dangerous-mode. */
      dangerConfig?: PublicKey
      addressLookupTableAddresses?: PublicKey[]
    } = {}
  ): Promise<string> {
    if (specs.length === 0) throw new Error("specs must be non-empty");
    if (specs.length > MAX_OPS) {
      throw new Error(`too many ops: ${specs.length} > MAX_OPS (${MAX_OPS})`);
    }
    const ops: Operation[] = [];
    const perOpRemaining: AccountMeta[][] = [];
    for (const spec of specs) {
      if (spec.kind === "transferSol") {
        ops.push({ kind: "transferSol", to: spec.to, lamports: spec.lamports });
        perOpRemaining.push([
          { pubkey: spec.to, isSigner: false, isWritable: true },
        ]);
      } else {
        const { ix } = spec;
        // CRITICAL: op-data flags (committed to ops_hash + read by on-chain
        // CPI builder) keep is_signer AS PROVIDED — Jupiter's downstream CPI
        // checks need the vault PDA marked is_signer=true so invoke_signed's
        // signer propagation works. But the OUTER v0 tx's remaining_accounts
        // must NOT mark vault as is_signer (vault is a PDA; no ed25519
        // signature exists). Solana's CPI rules let the inner ix have
        // is_signer=true even if the outer tx's AccountMeta says false,
        // because the parent program supplies signer_seeds via invoke_signed.
        ops.push({
          kind: "invoke",
          programId: ix.programId,
          accounts: ix.keys.map((k) => ({
            pubkey: k.pubkey,
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: new Uint8Array(ix.data),
        });
        perOpRemaining.push([
          // Force is_signer=false in the OUTER tx so we don't request a
          // tx-level signature for accounts that the program signs for via
          // invoke_signed (the vault PDA, mainly).
          ...ix.keys.map((k) => ({
            pubkey: k.pubkey,
            isSigner: false,
            isWritable: k.isWritable,
          })),
          { pubkey: ix.programId, isSigner: false, isWritable: false },
        ]);
      }
    }
    return this.executeOps(
      ops,
      perOpRemaining,
      {
        expirySlotOffset: opts.expirySlotOffset,
        addressLookupTableAddresses: opts.addressLookupTableAddresses,
      },
      { userAllowlist: opts.userAllowlist, successors: opts.successors, dangerConfig: opts.dangerConfig }
    );
  }

  // -------------------------------------------------------------------------
  // Chip-signed: allowlist management
  // -------------------------------------------------------------------------

  async initUserAllowlist(opts: { expirySlotOffset?: bigint } = {}): Promise<string> {
    const expirySlot = await this.computeExpiry(opts.expirySlotOffset);
    const nonce = await this.requireNonce();
    const digest = chipDigestForAllowlist("burner-allowlist-init", this.addresses.wallet, nonce, expirySlot);
    const sig = await this.chip.sign(digest);
    const messageBytes = chipMessageForAllowlist("burner-allowlist-init", this.addresses.wallet, nonce, expirySlot);
    const secp = buildSecp256k1Ix(this.chip.address, messageBytes, sig).ix;
    const ix = buildInitUserAllowlistIx(expirySlot, {
      wallet: this.addresses.wallet,
      allowlist: this.addresses.userAllowlist,
      payer: this.feePayer.publicKey,
      programId: this.programId,
    });
    return this.send([secp, ix]);
  }

  async userAllowlistAdd(
    program: PublicKey,
    opts: { expirySlotOffset?: bigint } = {}
  ): Promise<string> {
    return this.allowlistMutate("burner-allowlist-add", program, opts, (expirySlot) =>
      buildUserAllowlistAddIx(program, expirySlot, {
        wallet: this.addresses.wallet,
        allowlist: this.addresses.userAllowlist,
        payer: this.feePayer.publicKey,
        programId: this.programId,
      })
    );
  }

  async userAllowlistRemove(
    program: PublicKey,
    opts: { expirySlotOffset?: bigint } = {}
  ): Promise<string> {
    return this.allowlistMutate("burner-allowlist-rm", program, opts, (expirySlot) =>
      buildUserAllowlistRemoveIx(program, expirySlot, {
        wallet: this.addresses.wallet,
        allowlist: this.addresses.userAllowlist,
        payer: this.feePayer.publicKey,
        programId: this.programId,
      })
    );
  }

  // -------------------------------------------------------------------------
  // Chip-signed: dangerous-invoke timelock
  // -------------------------------------------------------------------------

  /**
   * Arm the dangerous-invoke escape hatch (step 1 of the timelock). After this
   * lands, mode becomes active only once `DANGEROUS_INVOKE_DELAY_SLOTS` have
   * elapsed — poll `fetchDangerConfig()` for `active` / `slotsUntilActive`.
   */
  async armDangerousInvoke(opts: { expirySlotOffset?: bigint } = {}): Promise<string> {
    const expirySlot = await this.computeExpiry(opts.expirySlotOffset);
    const nonce = await this.requireNonce();
    const messageBytes = chipMessageForAllowlist("burner-danger-arm", this.addresses.wallet, nonce, expirySlot);
    const digest = chipDigestForAllowlist("burner-danger-arm", this.addresses.wallet, nonce, expirySlot);
    const sig = await this.chip.sign(digest);
    const secp = buildSecp256k1Ix(this.chip.address, messageBytes, sig).ix;
    const ix = buildArmDangerousInvokeIx(expirySlot, {
      wallet: this.addresses.wallet,
      dangerConfig: this.addresses.dangerConfig,
      payer: this.feePayer.publicKey,
      programId: this.programId,
    });
    return this.send([secp, ix]);
  }

  /** Disarm dangerous-invoke mode immediately (valid even during the delay). */
  async disarmDangerousInvoke(opts: { expirySlotOffset?: bigint } = {}): Promise<string> {
    const expirySlot = await this.computeExpiry(opts.expirySlotOffset);
    const nonce = await this.requireNonce();
    const messageBytes = chipMessageForAllowlist("burner-danger-disarm", this.addresses.wallet, nonce, expirySlot);
    const digest = chipDigestForAllowlist("burner-danger-disarm", this.addresses.wallet, nonce, expirySlot);
    const sig = await this.chip.sign(digest);
    const secp = buildSecp256k1Ix(this.chip.address, messageBytes, sig).ix;
    const ix = buildDisarmDangerousInvokeIx(expirySlot, {
      wallet: this.addresses.wallet,
      dangerConfig: this.addresses.dangerConfig,
      programId: this.programId,
    });
    return this.send([secp, ix]);
  }

  // -------------------------------------------------------------------------
  // Chip-signed: migration
  // -------------------------------------------------------------------------

  async migrateSol(
    successorProgram: PublicKey,
    opts: { expirySlotOffset?: bigint } = {}
  ): Promise<string> {
    const { destVault } = deriveMigrationDestination(this.chip.address, successorProgram);
    const op: Operation = {
      kind: "migrateAsset",
      successorProgram,
      asset: { kind: "sol" },
    };
    const { successors } = deriveSuccessorsPDA(this.programId);
    return this.executeOps(
      [op],
      [[{ pubkey: destVault, isSigner: false, isWritable: true }]],
      opts,
      { successors }
    );
  }

  async migrateToken(
    successorProgram: PublicKey,
    mint: PublicKey,
    decimals: number,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
    opts: { expirySlotOffset?: bigint } = {}
  ): Promise<string> {
    const { destVault } = deriveMigrationDestination(this.chip.address, successorProgram);
    const source = getAssociatedTokenAddressSync(mint, this.addresses.vault, true, tokenProgram);
    const dest = getAssociatedTokenAddressSync(mint, destVault, true, tokenProgram);
    const op: Operation = {
      kind: "migrateAsset",
      successorProgram,
      asset: { kind: "token", mint, decimals },
    };
    const { successors } = deriveSuccessorsPDA(this.programId);
    return this.executeOps(
      [op],
      [[
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: dest, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ]],
      opts,
      { successors }
    );
  }

  // -------------------------------------------------------------------------
  // Internal: shared execute path
  // -------------------------------------------------------------------------

  /**
   * Build + chip-sign + send an `execute` tx covering `ops`. Caller supplies
   * the per-op remaining_accounts slices (in cursor order) — see
   * ExecuteAccounts.remainingAccounts for the per-op convention.
   */
  private async executeOps(
    ops: Operation[],
    perOpRemaining: AccountMeta[][],
    opts: { expirySlotOffset?: bigint; addressLookupTableAddresses?: PublicKey[] },
    extra: { userAllowlist?: PublicKey; successors?: PublicKey; dangerConfig?: PublicKey } = {}
  ): Promise<string> {
    if (ops.length !== perOpRemaining.length) {
      throw new Error("ops.length must equal perOpRemaining.length");
    }
    const nonce = await this.requireNonce();
    const expirySlot = await this.computeExpiry(opts.expirySlotOffset);

    const opsHash = computeOpsHash(ops);
    const msg: ExecuteK1 = {
      version: EXECUTE_MSG_VERSION,
      domain: DOMAIN_BYTES,
      cluster: clusterBytes(this.cluster),
      walletPda: this.addresses.wallet,
      nonce,
      expirySlot,
      opsHash,
    };

    const digest = executeK1Digest(msg);
    const sig = await this.chip.sign(digest);

    const { ix: secp } = buildSecp256k1Ix(this.chip.address, serializeExecuteK1Wire(msg), sig);
    const execute = buildExecuteIx(msg, ops, {
      wallet: this.addresses.wallet,
      vault: this.addresses.vault,
      userAllowlist: extra.userAllowlist,
      successors: extra.successors,
      dangerConfig: extra.dangerConfig,
      remainingAccounts: perOpRemaining.flat(),
      programId: this.programId,
    });
    return this.send([secp, execute], opts.addressLookupTableAddresses);
  }

  private async allowlistMutate(
    tag: string,
    program: PublicKey,
    opts: { expirySlotOffset?: bigint },
    mkIx: (expirySlot: bigint) => TransactionInstruction
  ): Promise<string> {
    const expirySlot = await this.computeExpiry(opts.expirySlotOffset);
    const nonce = await this.requireNonce();
    const messageBytes = chipMessageForAllowlist(tag, this.addresses.wallet, nonce, expirySlot, program);
    const digest = chipDigestForAllowlist(tag, this.addresses.wallet, nonce, expirySlot, program);
    const sig = await this.chip.sign(digest);
    const secp = buildSecp256k1Ix(this.chip.address, messageBytes, sig).ix;
    return this.send([secp, mkIx(expirySlot)]);
  }

  private async send(
    ixs: TransactionInstruction[],
    addressLookupTableAddresses?: PublicKey[]
  ): Promise<string> {
    // ComputeBudget ix's MUST come first in the tx if present. Setting both
    // a unit limit and a unit price improves landed-tx rate substantially on
    // mainnet (the scheduler picks higher fee/CU first under contention).
    const prepended: TransactionInstruction[] = [];
    if (this.computeUnitLimit && this.computeUnitLimit > 0) {
      prepended.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: this.computeUnitLimit })
      );
    }
    if (this.getPriorityFeeMicroLamports) {
      try {
        const micro = await this.getPriorityFeeMicroLamports(ixs);
        if (typeof micro === "number" && micro > 0 && isFinite(micro)) {
          prepended.push(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Math.floor(micro) })
          );
        }
      } catch {
        // Soft-fail: priority fee estimation is non-essential. The tx still
        // lands at base fee; caller can observe via getSignatureStatus.
      }
    }

    const allIxs = [...prepended, ...ixs];

    // Patch any secp256k1-verify ix's so their internal `_ix_index` fields
    // point at their actual position in the final tx. Without this, the
    // precompile reads sig/addr/msg from the wrong ix (default-0) and fails
    // with PrecompileError::InvalidSignature (0x2) or InvalidDataOffsets (0x3).
    for (let i = 0; i < allIxs.length; i++) {
      if (allIxs[i].programId.equals(SECP256K1_PROGRAM_ID)) {
        patchSecpIxSelfReference(allIxs[i], i);
      }
    }

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.finality);

    // ---- v0 / Address Lookup Table path -----------------------------------
    // Used for large CPI chains (Jupiter swaps) where inline accounts would
    // exceed the legacy 1232-byte tx wire size. The ALT references compress
    // each cached account from 32 bytes to 1 byte.
    if (addressLookupTableAddresses && addressLookupTableAddresses.length > 0) {
      const lutAccounts = await this.fetchLookupTables(addressLookupTableAddresses);
      const message = new TransactionMessage({
        payerKey: this.feePayer.publicKey,
        recentBlockhash: blockhash,
        instructions: allIxs,
      }).compileToV0Message(lutAccounts);
      const vtx = new VersionedTransaction(message);
      const sigBytes = await this.feePayer.signMessage(message.serialize());
      vtx.addSignature(this.feePayer.publicKey, sigBytes);
      const signature = await this.connection.sendRawTransaction(vtx.serialize());
      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        this.finality
      );
      return signature;
    }

    // ---- Legacy path (default) --------------------------------------------
    const tx = new Transaction().add(...allIxs);
    tx.feePayer = this.feePayer.publicKey;
    tx.recentBlockhash = blockhash;
    const sigBytes = await this.feePayer.signMessage(tx.serializeMessage());
    tx.addSignature(this.feePayer.publicKey, Buffer.from(sigBytes));
    const signature = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      this.finality
    );
    return signature;
  }

  private async fetchLookupTables(
    addresses: PublicKey[]
  ): Promise<AddressLookupTableAccount[]> {
    const out: AddressLookupTableAccount[] = [];
    for (const addr of addresses) {
      const res = await this.connection.getAddressLookupTable(addr, {
        commitment: this.finality,
      });
      if (res.value) out.push(res.value);
    }
    return out;
  }

  private async sendFeePayerOnly(ixs: TransactionInstruction[]): Promise<string> {
    return this.send(ixs);
  }

  private async computeExpiry(offset?: bigint): Promise<bigint> {
    const cur = BigInt(await this.connection.getSlot(this.finality));
    return cur + (offset ?? this.defaultExpiryOffset);
  }

  private async requireNonce(): Promise<bigint> {
    const n = await this.fetchNonce();
    if (n === null) {
      throw new Error("Wallet not initialized; call initialize() first.");
    }
    return n;
  }
}

// ----------------------------------------------------------------------------
// Allowlist canonical message helpers (separate from execute's ExecuteK1).
// ----------------------------------------------------------------------------

function chipMessageForAllowlist(
  tag: string,
  walletPda: PublicKey,
  nonce: bigint,
  expirySlot: bigint,
  program?: PublicKey
): Uint8Array {
  const tagBytes = new TextEncoder().encode(tag);
  const len = tagBytes.length + 32 + 8 + 8 + (program ? 32 : 0);
  const out = new Uint8Array(len);
  let o = 0;
  out.set(tagBytes, o); o += tagBytes.length;
  out.set(walletPda.toBytes(), o); o += 32;
  writeU64LE(out, o, nonce); o += 8;
  writeU64LE(out, o, expirySlot); o += 8;
  if (program) { out.set(program.toBytes(), o); o += 32; }
  return out;
}

function chipDigestForAllowlist(
  tag: string,
  walletPda: PublicKey,
  nonce: bigint,
  expirySlot: bigint,
  program?: PublicKey
): Uint8Array {
  return keccak_256(chipMessageForAllowlist(tag, walletPda, nonce, expirySlot, program));
}

function writeU64LE(buf: Uint8Array, offset: number, value: bigint): void {
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

function readU64LE(buf: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(buf[offset + i]);
  return v;
}

// Avoids re-importing serializeExecuteK1 in this file's small footprint.
function serializeExecuteK1Wire(msg: ExecuteK1): Uint8Array {
  // The chip signs digest, the secp ix needs the raw bytes.
  // Local re-implementation to skip an import cycle.
  // (Mirrors canonical.ts:serializeExecuteK1 exactly — see that file for docs.)
  const out = new Uint8Array(101);
  let o = 0;
  out[o++] = msg.version;
  out.set(msg.domain, o); o += 12;
  out.set(msg.cluster, o); o += 8;
  out.set(msg.walletPda.toBytes(), o); o += 32;
  writeU64LE(out, o, msg.nonce); o += 8;
  writeU64LE(out, o, msg.expirySlot); o += 8;
  out.set(msg.opsHash, o); o += 32;
  return out;
}

// Silence "unused" for these (consumers may want to mention the enum kind).
export { MigrateAssetKind };
export { Operation };
