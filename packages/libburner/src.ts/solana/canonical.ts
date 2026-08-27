import { PublicKey } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3";

import {
  EXECUTE_MSG_SIZE,
  EXECUTE_MSG_VERSION,
  MAX_ACCOUNTS_PER_INVOKE,
  MAX_INVOKE_DATA_LEN,
  MAX_OPS,
} from "./constants.js";
import { ExecuteK1, Operation, packAccountFlags } from "./types.js";

// ----------------------------------------------------------------------------
// Aux chip-signed messages (allowlist edits + dangerous-invoke arm/disarm)
// ----------------------------------------------------------------------------
//
// These are the non-ExecuteK1 chip-signed payloads. The layout MUST match the
// on-chain program (utils::aux_chip_message) byte-for-byte or signature
// verification fails on-chain:
//
//   version(1) | tag_ascii | cluster(8) | wallet(32) | nonce_u64le(8) | expiry_u64le(8) [| program(32)]
//
// The chip signs keccak256 of these bytes. The cluster binds the signature to a
// single deployment (prevents cross-cluster replay); the version byte prevents
// cross-format reinterpretation. Tags used on-chain:
//   "burner-allowlist-init" | "burner-allowlist-add" | "burner-allowlist-rm"
//   "burner-danger-arm"     | "burner-danger-disarm"

/** Format version for aux chip messages — must equal AUX_MSG_VERSION on-chain. */
export const AUX_MSG_VERSION = 1;

export function auxChipMessage(
  tag: string,
  cluster: Uint8Array,
  walletPda: PublicKey,
  nonce: bigint,
  expirySlot: bigint,
  program?: PublicKey
): Uint8Array {
  if (cluster.length !== 8) throw new Error("cluster must be 8 bytes");
  const tagBytes = new TextEncoder().encode(tag);
  const out = new Uint8Array(1 + tagBytes.length + 8 + 32 + 8 + 8 + (program ? 32 : 0));
  let o = 0;
  out[o++] = AUX_MSG_VERSION;
  out.set(tagBytes, o); o += tagBytes.length;
  out.set(cluster, o); o += 8;
  out.set(walletPda.toBytes(), o); o += 32;
  writeU64LE(out, o, nonce); o += 8;
  writeU64LE(out, o, expirySlot); o += 8;
  if (program) { out.set(program.toBytes(), o); o += 32; }
  return out;
}

/** Canonical bytes for the dangerous-invoke arm/disarm chip messages. */
export function dangerMessageBytes(
  kind: "arm" | "disarm",
  cluster: Uint8Array,
  walletPda: PublicKey,
  nonce: bigint,
  expirySlot: bigint
): Uint8Array {
  const tag = kind === "arm" ? "burner-danger-arm" : "burner-danger-disarm";
  return auxChipMessage(tag, cluster, walletPda, nonce, expirySlot);
}

// ----------------------------------------------------------------------------
// ExecuteK1 wire / chip-signed bytes
// ----------------------------------------------------------------------------

/**
 * Serialize an ExecuteK1 to its canonical 101-byte form.
 *
 * This is BOTH the bytes the chip signs (after keccak256) AND the bytes the
 * on-chain program reads from the `execute` ix arg (Anchor borsh structs are
 * fixed-layout so the wire matches).
 */
export function serializeExecuteK1(msg: ExecuteK1): Uint8Array {
  if (msg.version !== EXECUTE_MSG_VERSION) {
    throw new Error(`ExecuteK1.version must be ${EXECUTE_MSG_VERSION}, got ${msg.version}`);
  }
  if (msg.domain.length !== 12) throw new Error("domain must be 12 bytes");
  if (msg.cluster.length !== 8) throw new Error("cluster must be 8 bytes");
  if (msg.opsHash.length !== 32) throw new Error("opsHash must be 32 bytes");

  const out = new Uint8Array(EXECUTE_MSG_SIZE);
  let o = 0;
  out[o++] = msg.version;
  out.set(msg.domain, o); o += 12;
  out.set(msg.cluster, o); o += 8;
  out.set(msg.walletPda.toBytes(), o); o += 32;
  writeU64LE(out, o, msg.nonce); o += 8;
  writeU64LE(out, o, msg.expirySlot); o += 8;
  out.set(msg.opsHash, o); o += 32;
  if (o !== EXECUTE_MSG_SIZE) throw new Error("internal: bad msg length");
  return out;
}

// ----------------------------------------------------------------------------
// Canonical bytes for ops_hash
// ----------------------------------------------------------------------------

/**
 * Canonical bytes for a single Operation, in the form the chip commits to.
 *
 * For `Invoke` this includes the per-account pubkeys; the on-chain program
 * reconstructs them from `remaining_accounts` and re-hashes to compare.
 */
export function serializeOperation(op: Operation): Uint8Array {
  switch (op.kind) {
    case "transferSpl": {
      const out = new Uint8Array(1 + 32 + 32 + 8 + 1);
      let o = 0;
      out[o++] = 0; // discriminant
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
      if (op.accounts.length > MAX_ACCOUNTS_PER_INVOKE) {
        throw new Error(
          `Invoke account count ${op.accounts.length} exceeds MAX_ACCOUNTS_PER_INVOKE (${MAX_ACCOUNTS_PER_INVOKE})`
        );
      }
      if (op.data.length > MAX_INVOKE_DATA_LEN) {
        throw new Error(
          `Invoke data length ${op.data.length} exceeds MAX_INVOKE_DATA_LEN (${MAX_INVOKE_DATA_LEN})`
        );
      }
      const acctCount = op.accounts.length;
      const out = new Uint8Array(1 + 32 + 1 + acctCount * 33 + 4 + op.data.length);
      let o = 0;
      out[o++] = 2;
      out.set(op.programId.toBytes(), o); o += 32;
      out[o++] = acctCount;
      for (const a of op.accounts) {
        out.set(a.pubkey.toBytes(), o); o += 32;
        out[o++] = packAccountFlags(a);
      }
      writeU32LE(out, o, op.data.length); o += 4;
      out.set(op.data, o);
      return out;
    }
  }
}

/** keccak256 of the concatenated canonical bytes of every op. */
export function computeOpsHash(ops: readonly Operation[]): Uint8Array {
  if (ops.length > MAX_OPS) {
    throw new Error(`ops.length ${ops.length} exceeds MAX_OPS (${MAX_OPS})`);
  }
  const parts = ops.map(serializeOperation);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const concat = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { concat.set(p, o); o += p.length; }
  return keccak_256(concat);
}

/** keccak256 of an ExecuteK1's canonical bytes — the digest the chip signs. */
export function executeK1Digest(msg: ExecuteK1): Uint8Array {
  return keccak_256(serializeExecuteK1(msg));
}

// ----------------------------------------------------------------------------
// Borsh-ish primitives (manual; no full borsh dep needed for these sizes)
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
  if (value < 0 || value > 0xffffffff) {
    throw new Error(`u32 out of range: ${value}`);
  }
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}
