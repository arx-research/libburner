// Client <-> program parity for the dangerous-invoke (and aux) chip messages
// and instructions. These lock the byte formats the on-chain v5 burner_wallet
// program expects; drift here silently breaks signature verification / dispatch
// on-chain (not caught by tsc). Runs against the built ESM: `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";

import {
  dangerMessageBytes,
  auxChipMessage,
  buildArmDangerousInvokeIx,
  buildDisarmDangerousInvokeIx,
  buildExecuteIx,
  BURNER_PROGRAM_ID,
  DOMAIN_BYTES,
  clusterBytes,
  EXECUTE_MSG_VERSION,
} from "../lib.esm/solana/index.js";

// --- reference encoders, written independently of the lib under test ---------

function refU64LE(v) {
  const out = new Uint8Array(8);
  let x = BigInt(v);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

// Devnet cluster bytes (8), matching a default-feature program build.
const CLUSTER = new TextEncoder().encode("devnet  ");

// Exactly what the Rust program hashes (utils::aux_chip_message):
//   version(1) | tag_ascii | cluster(8) | wallet(32) | nonce_u64le | expiry_u64le
function refAuxMessage(tag, wallet, nonce, expiry) {
  const t = new TextEncoder().encode(tag);
  return new Uint8Array([
    1, // AUX_MSG_VERSION
    ...t,
    ...CLUSTER,
    ...wallet.toBytes(),
    ...refU64LE(nonce),
    ...refU64LE(expiry),
  ]);
}

// Discriminators pulled from the anchor-generated IDL (target/idl/burner_wallet.json).
const DISC_ARM = [0x33, 0x0b, 0x28, 0xfc, 0x89, 0xd4, 0x93, 0xfc];
const DISC_DISARM = [0x64, 0x0b, 0x11, 0xa8, 0x9d, 0xde, 0x16, 0x50];

const WALLET = new PublicKey(new Uint8Array(32).fill(7));
const DANGER = new PublicKey(new Uint8Array(32).fill(9));
const PAYER = new PublicKey(new Uint8Array(32).fill(3));
const NONCE = 42n;
const EXPIRY = 123_456_789n;

test("arm message bytes match the on-chain layout", () => {
  const got = dangerMessageBytes("arm", CLUSTER, WALLET, NONCE, EXPIRY);
  assert.deepEqual(got, refAuxMessage("burner-danger-arm", WALLET, NONCE, EXPIRY));
  assert.equal(got.length, 1 + "burner-danger-arm".length + 8 + 32 + 8 + 8);
});

test("disarm message bytes match the on-chain layout", () => {
  const got = dangerMessageBytes("disarm", CLUSTER, WALLET, NONCE, EXPIRY);
  assert.deepEqual(got, refAuxMessage("burner-danger-disarm", WALLET, NONCE, EXPIRY));
});

test("aux message includes program suffix when provided (allowlist-add shape)", () => {
  const withProg = auxChipMessage("burner-allowlist-add", CLUSTER, WALLET, NONCE, EXPIRY, DANGER);
  const base = refAuxMessage("burner-allowlist-add", WALLET, NONCE, EXPIRY);
  assert.deepEqual(withProg, new Uint8Array([...base, ...DANGER.toBytes()]));
});

test("cross-cluster: mainnet cluster bytes change the message (replay guard)", () => {
  const devnet = dangerMessageBytes("arm", CLUSTER, WALLET, NONCE, EXPIRY);
  const mainnet = dangerMessageBytes(
    "arm",
    new TextEncoder().encode("mainnet "),
    WALLET,
    NONCE,
    EXPIRY
  );
  assert.notDeepEqual(devnet, mainnet);
});

test("arm ix: discriminator + expiry arg + account order", () => {
  const ix = buildArmDangerousInvokeIx(EXPIRY, {
    wallet: WALLET,
    dangerConfig: DANGER,
    payer: PAYER,
    programId: BURNER_PROGRAM_ID,
  });
  assert.deepEqual([...ix.data.subarray(0, 8)], DISC_ARM);
  assert.deepEqual([...ix.data.subarray(8, 16)], [...refU64LE(EXPIRY)]);
  assert.equal(ix.data.length, 16);

  const keys = ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);
  assert.deepEqual(keys, [
    [WALLET.toBase58(), false, true],
    [DANGER.toBase58(), false, true],
    [PAYER.toBase58(), true, true],
    [SYSVAR_INSTRUCTIONS_PUBKEY.toBase58(), false, false],
    [SystemProgram.programId.toBase58(), false, false],
  ]);
});

test("disarm ix: discriminator + account order (no payer / system program)", () => {
  const ix = buildDisarmDangerousInvokeIx(EXPIRY, {
    wallet: WALLET,
    dangerConfig: DANGER,
    programId: BURNER_PROGRAM_ID,
  });
  assert.deepEqual([...ix.data.subarray(0, 8)], DISC_DISARM);
  const keys = ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);
  assert.deepEqual(keys, [
    [WALLET.toBase58(), false, true],
    [DANGER.toBase58(), false, true],
    [SYSVAR_INSTRUCTIONS_PUBKEY.toBase58(), false, false],
  ]);
});

test("execute account list places danger_config at index 3 (after user allowlist)", () => {
  const msg = {
    version: EXECUTE_MSG_VERSION,
    domain: DOMAIN_BYTES,
    cluster: clusterBytes("devnet"),
    walletPda: WALLET,
    nonce: NONCE,
    expirySlot: EXPIRY,
    opsHash: new Uint8Array(32),
  };
  const vault = new PublicKey(new Uint8Array(32).fill(5));

  // Account order: wallet(0) vault(1) userAllowlist(2) dangerConfig(3) sysvar(4) system(5).
  // None → program-id sentinel at slots 2 and 3.
  const noneIx = buildExecuteIx(msg, [], {
    wallet: WALLET,
    vault,
    remainingAccounts: [],
    programId: BURNER_PROGRAM_ID,
  });
  assert.equal(noneIx.keys[2].pubkey.toBase58(), BURNER_PROGRAM_ID.toBase58()); // userAllowlist None
  assert.equal(noneIx.keys[3].pubkey.toBase58(), BURNER_PROGRAM_ID.toBase58()); // danger None
  assert.equal(noneIx.keys[4].pubkey.toBase58(), SYSVAR_INSTRUCTIONS_PUBKEY.toBase58());

  // Provided → the actual danger config PDA at slot 3.
  const withIx = buildExecuteIx(msg, [], {
    wallet: WALLET,
    vault,
    dangerConfig: DANGER,
    remainingAccounts: [],
    programId: BURNER_PROGRAM_ID,
  });
  assert.equal(withIx.keys[3].pubkey.toBase58(), DANGER.toBase58());
  assert.equal(withIx.keys[4].pubkey.toBase58(), SYSVAR_INSTRUCTIONS_PUBKEY.toBase58());
});
