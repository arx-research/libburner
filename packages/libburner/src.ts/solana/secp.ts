import { PublicKey, Secp256k1Program, TransactionInstruction } from "@solana/web3.js";

import { SECP256K1_PROGRAM_ID } from "./constants.js";

// secp256k1 curve order. Solana's precompile rejects high-s signatures
// (`libsecp256k1::Signature::parse_standard`), so we canonicalize to low-s.
const SECP_N = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
);
const SECP_HALF_N = SECP_N >> 1n;

export interface ChipSig {
  /** 32-byte r component. */
  r: Uint8Array;
  /** 32-byte s component (will be canonicalized to low-s if needed). */
  s: Uint8Array;
  /**
   * Recovery byte. Accepts EITHER:
   *   - 0 / 1 (Solana / standard convention), or
   *   - 27 / 28 (Ethereum convention; auto-normalized by subtracting 27).
   * Will be flipped if low-s canonicalization changes s.
   */
  v: number;
}

export interface BuiltSecpIx {
  ix: TransactionInstruction;
  /** Whether we flipped the recovery bit during low-s canonicalization. */
  canonicalized: boolean;
}

/**
 * Build a secp256k1 verify instruction that recovers the chip's signature
 * over `messageBytes` (raw bytes — the precompile hashes them via keccak256).
 *
 * Uses Solana's `Secp256k1Program.createInstructionWithEthAddress` helper for
 * the byte layout. The three instruction-index fields are left at 0; the caller
 * MUST call `patchSecpIxSelfReference(ix, txIndex)` once the ix's final
 * position is known — see the note at the end of this function.
 *
 * An earlier revision of this comment claimed a `0xff` "self" sentinel made the
 * ix robust to prepended ComputeBudget instructions. That is wrong, and it
 * contradicted the code immediately below it. Modern Solana has no such
 * sentinel: the indices must equal the secp ix's actual tx position, and
 * `burner_wallet` additionally requires all three to equal it (the
 * instruction-index binding, spec 9.2 item 1). Trusting the old wording would
 * mean skipping the patch and emitting transactions the program rejects.
 */
export function buildSecp256k1Ix(
  ethAddress: Uint8Array,
  messageBytes: Uint8Array,
  sig: ChipSig
): BuiltSecpIx {
  if (ethAddress.length !== 20) throw new Error("ethAddress must be 20 bytes");
  if (sig.r.length !== 32 || sig.s.length !== 32) {
    throw new Error("sig.r and sig.s must be 32 bytes each");
  }

  let recoveryId = normalizeRecoveryId(sig.v);
  let s = sig.s;

  let canonicalized = false;
  const sBig = bytesToBigInt(s);
  if (sBig > SECP_HALF_N) {
    const sCanon = SECP_N - sBig;
    s = bigIntToBytes32(sCanon);
    recoveryId ^= 1;
    canonicalized = true;
  }

  const signature = concatBytes(sig.r, s);
  const ix = Secp256k1Program.createInstructionWithEthAddress({
    ethAddress,
    message: messageBytes,
    signature,
    recoveryId,
  });

  // Sanity check that the programId we got matches the one we constant-defined
  // (cheap defense against future SDK behavior changes).
  if (!ix.programId.equals(SECP256K1_PROGRAM_ID)) {
    throw new Error("Secp256k1Program returned unexpected program ID");
  }

  // The instruction-index fields (data[3], data[6], data[11]) default to 0
  // from `Secp256k1Program.createInstructionWithEthAddress`. They tell the
  // precompile which ix in the tx holds the sig/addr/msg blobs. Modern
  // Solana doesn't support a 0xFF "self" sentinel — the indices must equal
  // the secp ix's actual position. Caller patches these via
  // `patchSecpIxSelfReference(ix, txIndex)` once it knows where the secp ix
  // lands in the final tx.
  return { ix, canonicalized };
}

/**
 * Patch a secp256k1-verify instruction's three `_ix_index` fields so they
 * point at `txIndex` (the position of THIS ix in the final tx). Required
 * whenever the secp ix is not at tx index 0 — e.g. when ComputeBudget ix's
 * are prepended.
 */
export function patchSecpIxSelfReference(
  ix: TransactionInstruction,
  txIndex: number
): void {
  if (txIndex < 0 || txIndex > 255) {
    throw new Error(`secp ix txIndex out of range: ${txIndex}`);
  }
  const data = ix.data;
  if (data.length < 12 || data[0] !== 1) {
    throw new Error("Unexpected secp ix layout — refusing to patch");
  }
  data[3] = txIndex;
  data[6] = txIndex;
  data[11] = txIndex;
}

/** Re-export the precompile program id for convenience. */
export function getSecp256k1ProgramId(): PublicKey {
  return SECP256K1_PROGRAM_ID;
}

function normalizeRecoveryId(v: number): 0 | 1 {
  if (v === 0 || v === 1) return v as 0 | 1;
  if (v === 27 || v === 28) return (v - 27) as 0 | 1;
  throw new Error(`unsupported recovery id: ${v} (want 0/1 or 27/28)`);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = 0; i < bytes.length; i++) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return v;
}

function bigIntToBytes32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
