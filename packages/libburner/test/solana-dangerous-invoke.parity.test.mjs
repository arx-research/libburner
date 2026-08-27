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
  buildSetDangerousInvokeIx,
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

// Discriminator pulled from the anchor-generated IDL (target/idl/burner_wallet.json).
const DISC_SET = [0x08, 0xb2, 0xe0, 0xdb, 0x8d, 0xc6, 0x0f, 0xb8];

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

test("set_dangerous_invoke ix: discriminator + (armed, expiry) args + account order", () => {
  const ix = buildSetDangerousInvokeIx(true, EXPIRY, {
    wallet: WALLET,
    dangerConfig: DANGER,
    payer: PAYER,
    programId: BURNER_PROGRAM_ID,
  });
  // disc(8) | armed(1, Borsh bool) | expiry_slot(8 LE)
  assert.deepEqual([...ix.data.subarray(0, 8)], DISC_SET);
  assert.equal(ix.data[8], 1, "armed = true");
  assert.deepEqual([...ix.data.subarray(9, 17)], [...refU64LE(EXPIRY)]);
  assert.equal(ix.data.length, 17);

  const keys = ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);
  assert.deepEqual(keys, [
    [WALLET.toBase58(), false, true],
    [DANGER.toBase58(), false, true],
    [PAYER.toBase58(), true, true],
    [SYSVAR_INSTRUCTIONS_PUBKEY.toBase58(), false, false],
    [SystemProgram.programId.toBase58(), false, false],
  ]);
});

test("set_dangerous_invoke: armed flag is the only wire difference between directions", () => {
  const opts = {
    wallet: WALLET, dangerConfig: DANGER, payer: PAYER, programId: BURNER_PROGRAM_ID,
  };
  const arm = buildSetDangerousInvokeIx(true, EXPIRY, opts);
  const disarm = buildSetDangerousInvokeIx(false, EXPIRY, opts);

  assert.equal(disarm.data[8], 0, "armed = false");
  for (let i = 0; i < arm.data.length; i++) {
    if (i === 8) continue;
    assert.equal(disarm.data[i], arm.data[i], `byte ${i} must match`);
  }
  // ...but the CHIP messages differ, which is what actually binds the
  // direction. A relayer flipping the flag invalidates the signature.
  assert.notDeepEqual(
    dangerMessageBytes("arm", CLUSTER, WALLET, NONCE, EXPIRY),
    dangerMessageBytes("disarm", CLUSTER, WALLET, NONCE, EXPIRY)
  );
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
