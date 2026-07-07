import { PublicKey } from "@solana/web3.js";

import { ChipSig } from "./secp.js";

// ----------------------------------------------------------------------------
// Chip signing
// ----------------------------------------------------------------------------

/**
 * Abstracts the chip-side signing operation. The lib doesn't know whether the
 * chip is reached via HaLo Gateway, NFC reader, or an in-memory test key.
 */
export interface ChipSigner {
  /** The chip's 20-byte Ethereum-style address (== keccak256(uncompressedPubkey[1..])[12..]). */
  readonly address: Uint8Array;
  /**
   * Sign a 32-byte digest. The chip must NOT apply EIP-191 prefixes — pass
   * the digest as the chip's `digest:` parameter, not the `message:` parameter.
   */
  sign(digest: Uint8Array): Promise<ChipSig>;
}

// ----------------------------------------------------------------------------
// Fee payer (Solana side)
// ----------------------------------------------------------------------------

/**
 * Abstracts the Solana fee-payer signing operation. Production uses a hosted
 * relayer (POSTs the tx message to /api/sign-transaction); tests use a local
 * Keypair.
 */
export interface FeePayerSigner {
  readonly publicKey: PublicKey;
  /** Returns the 64-byte ed25519 signature over the wire-serialized tx message. */
  signMessage(messageBytes: Uint8Array): Promise<Uint8Array>;
}
