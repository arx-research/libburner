import { PublicKey } from "@solana/web3.js";

// ----------------------------------------------------------------------------
// ExecuteK1 (chip-signed message, v2)
// ----------------------------------------------------------------------------

export interface ExecuteK1 {
  /** Must equal EXECUTE_MSG_VERSION (2). */
  version: number;
  /** 12 bytes; "burner-v1-k1". */
  domain: Uint8Array;
  /** 8 bytes; "devnet  " / "testnet " / "mainnet ". */
  cluster: Uint8Array;
  /** The wallet PDA pubkey (binds the message to a specific wallet). */
  walletPda: PublicKey;
  /** Current wallet nonce. */
  nonce: bigint;
  /** Slot after which the message is invalid. */
  expirySlot: bigint;
  /** 32 bytes; keccak256 of canonical ops bytes (with pubkeys spliced in). */
  opsHash: Uint8Array;
}

// ----------------------------------------------------------------------------
// Operations
// ----------------------------------------------------------------------------

/** Tagged union mirroring the on-chain Rust enum (discriminants 0/1/2). */
export type Operation =
  | {
      kind: "transferSpl";
      mint: PublicKey;
      to: PublicKey;
      amount: bigint;
      decimals: number;
    }
  | {
      kind: "transferSol";
      to: PublicKey;
      lamports: bigint;
    }
  | {
      kind: "invoke";
      programId: PublicKey;
      /** Account list for the inner instruction. Pubkeys committed in ops_hash. */
      accounts: InvokeAccountMeta[];
      /** Raw inner-ix data. */
      data: Uint8Array;
    };

export interface InvokeAccountMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

/** Flag byte for one InvokeAccountMeta: bit0=is_signer, bit1=is_writable. */
export function packAccountFlags(m: InvokeAccountMeta): number {
  return (m.isSigner ? 0b01 : 0) | (m.isWritable ? 0b10 : 0);
}
