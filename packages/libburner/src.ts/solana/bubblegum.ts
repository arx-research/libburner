// Compressed-NFT (Bubblegum) transfer instruction builder.
//
// cNFTs live in a merkle tree rather than as individual SPL accounts. A
// transfer touches: tree authority (PDA), leaf owner (= burner vault for our
// case), leaf delegate, new owner, the merkle tree (mut), log wrapper,
// compression program, system program — plus the merkle proof path as
// `remaining_accounts`.
//
// We deliberately ship a hand-rolled builder rather than depend on
// @metaplex-foundation/mpl-bubblegum to keep this library framework-free.
// The ix layout below matches Bubblegum's `transfer` (anchor program;
// discriminator = sha256("global:transfer")[:8]).

import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

export const BUBBLEGUM_PROGRAM_ID = new PublicKey(
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
);
export const SPL_NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);
export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);

// Anchor discriminator for "transfer".
const TRANSFER_DISC = sha256(new TextEncoder().encode("global:transfer")).slice(0, 8);

export interface BubblegumTransferParams {
  /** Merkle tree account (cNFT lives in here). */
  merkleTree: PublicKey;
  /** Current owner of the leaf. For burner_wallet flows: the vault PDA. */
  leafOwner: PublicKey;
  /** Current delegate. Often === leafOwner unless explicitly delegated. */
  leafDelegate: PublicKey;
  /** New owner of the leaf. */
  newLeafOwner: PublicKey;
  /** 32-byte root hash of the merkle tree at the time of building (from getAssetProof). */
  root: Uint8Array;
  /** 32-byte data_hash from the asset metadata (from getAsset). */
  dataHash: Uint8Array;
  /** 32-byte creator_hash from the asset metadata (from getAsset). */
  creatorHash: Uint8Array;
  /** Leaf nonce (u64) — also from getAsset. */
  nonce: bigint;
  /** Leaf index in the tree (u32) — from getAsset.compression.leaf_id. */
  index: number;
  /** Merkle proof: ordered list of sibling-hash pubkeys, ROOT-DOWN order
   *  with canopy nodes removed (from getAssetProof, trimmed by canopy depth). */
  proof: PublicKey[];
}

/** Derives the tree authority PDA (seeds: [merkleTree], program: bubblegum). */
export function deriveTreeAuthority(merkleTree: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  return pda;
}

/**
 * Build the on-the-wire Bubblegum `transfer` instruction. Caller is expected
 * to wrap this through burner_wallet::execute via `wallet.invoke(ix)` so the
 * vault PDA can sign as `leafOwner` via invoke_signed.
 */
export function buildBubblegumTransferIx(
  p: BubblegumTransferParams
): TransactionInstruction {
  if (p.root.length !== 32) throw new Error("root must be 32 bytes");
  if (p.dataHash.length !== 32) throw new Error("dataHash must be 32 bytes");
  if (p.creatorHash.length !== 32) throw new Error("creatorHash must be 32 bytes");

  const treeAuthority = deriveTreeAuthority(p.merkleTree);

  // Instruction data: [disc(8) | root(32) | dataHash(32) | creatorHash(32) | nonce(8 LE) | index(4 LE)]
  const data = new Uint8Array(8 + 32 + 32 + 32 + 8 + 4);
  let o = 0;
  data.set(TRANSFER_DISC, o); o += 8;
  data.set(p.root, o); o += 32;
  data.set(p.dataHash, o); o += 32;
  data.set(p.creatorHash, o); o += 32;
  // nonce u64 LE
  let n = p.nonce;
  for (let i = 0; i < 8; i++) { data[o + i] = Number(n & 0xffn); n >>= 8n; }
  o += 8;
  // index u32 LE
  let idx = p.index >>> 0;
  for (let i = 0; i < 4; i++) { data[o + i] = idx & 0xff; idx >>>= 8; }
  o += 4;

  const keys: AccountMeta[] = [
    { pubkey: treeAuthority, isSigner: false, isWritable: false },
    // leafOwner: signer iff != delegate; for our case it IS the signer (vault).
    { pubkey: p.leafOwner, isSigner: true, isWritable: false },
    // leafDelegate: signer if delegate != owner; we use owner as delegate.
    { pubkey: p.leafDelegate, isSigner: p.leafDelegate.equals(p.leafOwner) ? false : true, isWritable: false },
    { pubkey: p.newLeafOwner, isSigner: false, isWritable: false },
    { pubkey: p.merkleTree, isSigner: false, isWritable: true },
    { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    // Proof path nodes follow as additional non-signer, non-writable accounts.
    ...p.proof.map((pk) => ({ pubkey: pk, isSigner: false, isWritable: false })),
  ];

  return new TransactionInstruction({
    programId: BUBBLEGUM_PROGRAM_ID,
    keys,
    data: Buffer.from(data),
  });
}
