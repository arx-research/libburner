// Client <-> program parity for the wire formats that carry money.
//
// Everything here is drift-detection: the on-chain program re-derives these
// bytes itself and compares, so a one-byte disagreement between libburner and
// `programs/halo-wallet/src` means signature verification or ops-hash checks
// fail on-chain — and tsc cannot see any of it, because both sides are just
// Uint8Arrays.
//
// Reference encoders below are written independently from the implementation
// (straight from the Rust, not from lib.esm) so a copied bug does not cancel
// out. Runs against the built ESM: `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import {
  serializeExecuteK1,
  serializeOperation,
  computeOpsHash,
  serializeOperationWire,
  patchSecpIxSelfReference,
  buildSecp256k1Ix,
  deriveWalletPDAs,
  DISC,
  ACCOUNT_DISC,
  BURNER_PROGRAM_ID,
  DOMAIN_BYTES,
  EXECUTE_MSG_VERSION,
  EXECUTE_MSG_SIZE,
  MAX_OPS,
  MAX_ACCOUNTS_PER_INVOKE,
  MAX_INVOKE_DATA_LEN,
  MAX_USER_ALLOWLIST_PROGRAMS,
  MIN_VAULT_BALANCE,
  DANGEROUS_INVOKE_DELAY_SLOTS,
  clusterBytes,
} from "../lib.esm/solana/index.js";

// --- reference encoders (transcribed from the Rust, not from the client) -----

function refU64LE(v) {
  const out = new Uint8Array(8);
  let x = BigInt(v);
  for (let i = 0; i < 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}

function refU32LE(v) {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

const MINT = new PublicKey(new Uint8Array(32).fill(11));
const TO = new PublicKey(new Uint8Array(32).fill(22));
const WALLET = new PublicKey(new Uint8Array(32).fill(33));
const ACCT_A = new PublicKey(new Uint8Array(32).fill(44));
const ACCT_B = new PublicKey(new Uint8Array(32).fill(55));

// ============================================================================
// ExecuteK1 — the bytes the chip signs (state.rs ExecuteK1::to_bytes)
// ============================================================================

test("serializeExecuteK1 matches the 101-byte on-chain layout", () => {
  const msg = {
    version: EXECUTE_MSG_VERSION,
    domain: DOMAIN_BYTES,
    cluster: clusterBytes("devnet"),
    walletPda: WALLET,
    nonce: 7n,
    expirySlot: 999n,
    opsHash: new Uint8Array(32).fill(9),
  };
  const got = serializeExecuteK1(msg);

  // version(1) | domain(12) | cluster(8) | wallet(32) | nonce(8) | expiry(8) | ops_hash(32)
  const want = new Uint8Array([
    2,
    ...new TextEncoder().encode("burner-v1-k1"),
    ...new TextEncoder().encode("devnet  "),
    ...WALLET.toBytes(),
    ...refU64LE(7n),
    ...refU64LE(999n),
    ...new Uint8Array(32).fill(9),
  ]);

  assert.equal(got.length, 101, "ExecuteK1 must be exactly 101 bytes");
  assert.equal(got.length, EXECUTE_MSG_SIZE);
  assert.deepEqual(got, want);
});

test("serializeExecuteK1 rejects a wrong version rather than emitting bad bytes", () => {
  const base = {
    version: 1,
    domain: DOMAIN_BYTES,
    cluster: clusterBytes("devnet"),
    walletPda: WALLET,
    nonce: 0n,
    expirySlot: 0n,
    opsHash: new Uint8Array(32),
  };
  assert.throws(() => serializeExecuteK1(base), /version/);
});

// ============================================================================
// Canonical op bytes — the ops_hash preimage (utils.rs compute_ops_hash)
// ============================================================================

test("canonical TransferSpl bytes match compute_ops_hash", () => {
  const got = serializeOperation({
    kind: "transferSpl", mint: MINT, to: TO, amount: 1234n, decimals: 6,
  });
  // 0 | mint(32) | to(32) | amount(8 LE) | decimals(1)
  const want = new Uint8Array([
    0, ...MINT.toBytes(), ...TO.toBytes(), ...refU64LE(1234n), 6,
  ]);
  assert.deepEqual(got, want);
  assert.equal(got.length, 1 + 32 + 32 + 8 + 1);
});

test("canonical TransferSol bytes match compute_ops_hash", () => {
  const got = serializeOperation({ kind: "transferSol", to: TO, lamports: 5n });
  // 1 | to(32) | lamports(8 LE)
  assert.deepEqual(got, new Uint8Array([1, ...TO.toBytes(), ...refU64LE(5n)]));
  assert.equal(got.length, 1 + 32 + 8);
});

test("canonical Invoke bytes splice pubkeys and use a u8 account count", () => {
  const data = new Uint8Array([9, 8, 7]);
  const got = serializeOperation({
    kind: "invoke",
    programId: SystemProgram.programId,
    accounts: [
      { pubkey: ACCT_A, isSigner: true, isWritable: true },
      { pubkey: ACCT_B, isSigner: false, isWritable: true },
    ],
    data,
  });
  // 2 | program(32) | n(1 byte!) | n*(pubkey(32) | flags(1)) | data_len(4 LE) | data
  const want = new Uint8Array([
    2,
    ...SystemProgram.programId.toBytes(),
    2,                                  // u8 count — NOT a u32
    ...ACCT_A.toBytes(), 0b11,          // signer + writable
    ...ACCT_B.toBytes(), 0b10,          // writable only
    ...refU32LE(3),
    ...data,
  ]);
  assert.deepEqual(got, want);
});

test("flag byte packs bit0=is_signer, bit1=is_writable", () => {
  const cases = [
    [{ isSigner: false, isWritable: false }, 0b00],
    [{ isSigner: true, isWritable: false }, 0b01],
    [{ isSigner: false, isWritable: true }, 0b10],
    [{ isSigner: true, isWritable: true }, 0b11],
  ];
  for (const [meta, expected] of cases) {
    const bytes = serializeOperation({
      kind: "invoke", programId: SystemProgram.programId,
      accounts: [{ pubkey: ACCT_A, ...meta }], data: new Uint8Array(0),
    });
    // flag byte sits right after 1 + 32 (program) + 1 (count) + 32 (pubkey)
    assert.equal(bytes[1 + 32 + 1 + 32], expected, JSON.stringify(meta));
  }
});

test("computeOpsHash is keccak256 over the concatenated canonical forms", async () => {
  const { keccak_256 } = await import("@noble/hashes/sha3");
  const ops = [
    { kind: "transferSol", to: TO, lamports: 1n },
    { kind: "transferSpl", mint: MINT, to: TO, amount: 2n, decimals: 9 },
  ];
  const concat = new Uint8Array([
    ...serializeOperation(ops[0]),
    ...serializeOperation(ops[1]),
  ]);
  assert.deepEqual(computeOpsHash(ops), keccak_256(concat));
});

test("computeOpsHash refuses to exceed MAX_OPS", () => {
  const ops = Array.from({ length: MAX_OPS + 1 }, () => ({
    kind: "transferSol", to: TO, lamports: 1n,
  }));
  assert.throws(() => computeOpsHash(ops), /MAX_OPS/);
});

test("Invoke enforces the on-chain account and data caps", () => {
  assert.throws(() => serializeOperation({
    kind: "invoke", programId: SystemProgram.programId,
    accounts: Array.from({ length: MAX_ACCOUNTS_PER_INVOKE + 1 }, () => ({
      pubkey: ACCT_A, isSigner: false, isWritable: false,
    })),
    data: new Uint8Array(0),
  }), /MAX_ACCOUNTS_PER_INVOKE/);

  assert.throws(() => serializeOperation({
    kind: "invoke", programId: SystemProgram.programId, accounts: [],
    data: new Uint8Array(MAX_INVOKE_DATA_LEN + 1),
  }), /MAX_INVOKE_DATA_LEN/);
});

// ============================================================================
// Borsh wire form — what the program deserializes (differs for Invoke!)
// ============================================================================

test("wire Invoke omits pubkeys and length-prefixes flags as u32", () => {
  const data = new Uint8Array([1, 2]);
  const got = serializeOperationWire({
    kind: "invoke",
    programId: SystemProgram.programId,
    accounts: [
      { pubkey: ACCT_A, isSigner: true, isWritable: true },
      { pubkey: ACCT_B, isSigner: false, isWritable: true },
    ],
    data,
  });
  // 2 | program(32) | flags_len(4 LE!) | flags | data_len(4 LE) | data
  const want = new Uint8Array([
    2, ...SystemProgram.programId.toBytes(),
    ...refU32LE(2), 0b11, 0b10,
    ...refU32LE(2), ...data,
  ]);
  assert.deepEqual(got, want);
});

test("canonical and wire forms diverge exactly where they should", () => {
  // This is the trap: canonical writes the account count as u8 and includes
  // every pubkey; wire writes a u32 Borsh Vec length and no pubkeys at all.
  const op = {
    kind: "invoke", programId: SystemProgram.programId,
    accounts: [{ pubkey: ACCT_A, isSigner: true, isWritable: false }],
    data: new Uint8Array([7]),
  };
  const canonical = serializeOperation(op);
  const wire = serializeOperationWire(op);

  assert.equal(canonical[33], 1, "canonical account count is a single byte");
  assert.deepEqual(wire.subarray(33, 37), refU32LE(1), "wire flags length is u32 LE");
  assert.ok(canonical.length > wire.length, "canonical carries pubkeys, wire does not");
});

test("wire TransferSol / TransferSpl match the canonical forms byte-for-byte", () => {
  // Only Invoke diverges — pin that so a future edit cannot quietly split them.
  for (const op of [
    { kind: "transferSol", to: TO, lamports: 42n },
    { kind: "transferSpl", mint: MINT, to: TO, amount: 42n, decimals: 3 },
  ]) {
    assert.deepEqual(serializeOperationWire(op), serializeOperation(op), op.kind);
  }
});

// ============================================================================
// secp256k1 instruction-index self-reference
// ============================================================================
//
// The program requires data[3] == data[6] == data[11] == the secp ix's own
// position (utils.rs verify_secp256k1_instruction). If the client writes the
// wrong value the tx is rejected; if it writes an ATTACKER-chosen value the
// on-chain check is the only thing standing between a forged layout and a
// full authorization bypass. This function is the client half of that check
// and had no test at all.

const DUMMY_SIG = {
  r: new Uint8Array(32).fill(1),
  s: new Uint8Array(32).fill(2), // low-s, no canonicalization
  v: 0,
};

test("patchSecpIxSelfReference writes all three index fields", () => {
  const { ix } = buildSecp256k1Ix(new Uint8Array(20).fill(3), new Uint8Array(101), DUMMY_SIG);
  // Fresh from the SDK the indices are 0.
  assert.deepEqual([ix.data[3], ix.data[6], ix.data[11]], [0, 0, 0]);

  patchSecpIxSelfReference(ix, 2);
  assert.equal(ix.data[3], 2, "signature_instruction_index");
  assert.equal(ix.data[6], 2, "eth_address_instruction_index");
  assert.equal(ix.data[11], 2, "message_instruction_index");
});

test("patchSecpIxSelfReference leaves the offsets and payload untouched", () => {
  const addr = new Uint8Array(20).fill(3);
  const msg = new Uint8Array(101).fill(4);
  const { ix } = buildSecp256k1Ix(addr, msg, DUMMY_SIG);
  const before = Uint8Array.from(ix.data);

  patchSecpIxSelfReference(ix, 5);

  for (let i = 0; i < before.length; i++) {
    if (i === 3 || i === 6 || i === 11) continue;
    assert.equal(ix.data[i], before[i], `byte ${i} must not change`);
  }
});

test("patchSecpIxSelfReference rejects an out-of-range index", () => {
  const { ix } = buildSecp256k1Ix(new Uint8Array(20), new Uint8Array(101), DUMMY_SIG);
  assert.throws(() => patchSecpIxSelfReference(ix, -1), /out of range/);
  assert.throws(() => patchSecpIxSelfReference(ix, 256), /out of range/);
});

test("patchSecpIxSelfReference refuses to patch an unexpected layout", () => {
  // Guards against silently corrupting a non-secp ix (data[0] is the signature
  // count and must be 1).
  const fake = { data: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
  assert.throws(() => patchSecpIxSelfReference(fake, 0), /Unexpected secp ix layout/);
  assert.throws(
    () => patchSecpIxSelfReference({ data: new Uint8Array(4) }, 0),
    /Unexpected secp ix layout/
  );
});

// ============================================================================
// Discriminators — independently derived with node:crypto
// ============================================================================

test("instruction discriminators equal sha256('global:<name>')[0..8]", () => {
  for (const [name, disc] of Object.entries(DISC)) {
    const want = new Uint8Array(
      createHash("sha256").update(`global:${name}`).digest().subarray(0, 8)
    );
    assert.deepEqual(disc, want, name);
  }
  // And the set matches the program's instruction list exactly. Six, not eight:
  // `create_token_account` was removed (the ATA program does it directly) and
  // arm/disarm collapsed into `set_dangerous_invoke(armed: bool, ...)`.
  assert.deepEqual(Object.keys(DISC).sort(), [
    "execute", "init_user_allowlist", "initialize",
    "set_dangerous_invoke", "user_allowlist_add", "user_allowlist_remove",
  ]);
});

test("account discriminators equal sha256('account:<Name>')[0..8]", () => {
  for (const [name, disc] of Object.entries(ACCOUNT_DISC)) {
    const want = new Uint8Array(
      createHash("sha256").update(`account:${name}`).digest().subarray(0, 8)
    );
    assert.deepEqual(disc, want, name);
  }
  assert.deepEqual(Object.keys(ACCOUNT_DISC).sort(),
    ["DangerConfig", "ProgramAllowlist", "Wallet"]);
});

// ============================================================================
// PDA seeds + constant drift
// ============================================================================

test("deriveWalletPDAs uses the documented seed literals", () => {
  const k1 = new Uint8Array(20).fill(6);
  const pdas = deriveWalletPDAs(k1);
  const enc = new TextEncoder();

  const [wallet] = PublicKey.findProgramAddressSync([enc.encode("burner"), k1], BURNER_PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync(
    [enc.encode("burner-vault"), wallet.toBytes()], BURNER_PROGRAM_ID);
  const [allow] = PublicKey.findProgramAddressSync(
    [enc.encode("burner-allowlist"), wallet.toBytes()], BURNER_PROGRAM_ID);
  const [danger] = PublicKey.findProgramAddressSync(
    [enc.encode("burner-danger"), wallet.toBytes()], BURNER_PROGRAM_ID);

  assert.equal(pdas.wallet.toBase58(), wallet.toBase58());
  assert.equal(pdas.vault.toBase58(), vault.toBase58());
  assert.equal(pdas.userAllowlist.toBase58(), allow.toBase58());
  assert.equal(pdas.dangerConfig.toBase58(), danger.toBase58());
});

test("deriveWalletPDAs rejects a wrong-length chip address", () => {
  assert.throws(() => deriveWalletPDAs(new Uint8Array(19)), /20 bytes/);
  assert.throws(() => deriveWalletPDAs(new Uint8Array(32)), /20 bytes/);
});

test("caps mirror the on-chain constants (state.rs)", () => {
  // Update these together with programs/halo-wallet/src/state.rs — a silent
  // divergence means the client accepts payloads the program will reject.
  assert.equal(MAX_OPS, 8);
  assert.equal(MAX_ACCOUNTS_PER_INVOKE, 96);
  assert.equal(MAX_INVOKE_DATA_LEN, 512);
  assert.equal(MAX_USER_ALLOWLIST_PROGRAMS, 64);
  assert.equal(MIN_VAULT_BALANCE, 890_880n);
  assert.equal(DANGEROUS_INVOKE_DELAY_SLOTS, 216_000n);
  assert.equal(EXECUTE_MSG_VERSION, 2);
  assert.equal(EXECUTE_MSG_SIZE, 101);
});

test("cluster strings are exactly 8 bytes each", () => {
  for (const c of ["devnet", "testnet", "mainnet"]) {
    assert.equal(clusterBytes(c).length, 8, c);
  }
  // Distinct per cluster — this is the cross-cluster replay guard.
  const seen = new Set(["devnet", "testnet", "mainnet"].map((c) => clusterBytes(c).join(",")));
  assert.equal(seen.size, 3);
});
