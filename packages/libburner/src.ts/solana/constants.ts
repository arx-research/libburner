// Constants for the v5 Burner Solana program.
//
// Program is deployed at the address below on both devnet (v5) and mainnet
// (v4 still — wire-incompatible). Devnet upgrade landed at slot 468,514,024
// (sig q86CN4Y6H7YxnTcbk8uGtPfXySLNLLXf6bEPtKuTvKi6xHLwRdBhTDnoVZ7byShEE6YoVpjqPNto6tdMaR5Smwq).

import { PublicKey } from "@solana/web3.js";

export const BURNER_PROGRAM_ID = new PublicKey(
  "Ev5JBnsnEAB2gTvQZqffnZ79RJaVaiVji1ReKAhcJBtv"
);

/** PDA seed for the wallet account. */
export const WALLET_SEED = new TextEncoder().encode("burner");
/** PDA seed for the vault account (SystemAccount that holds funds). */
export const VAULT_SEED = new TextEncoder().encode("burner-vault");
/** PDA seed for the per-wallet program allowlist. */
export const USER_ALLOWLIST_SEED = new TextEncoder().encode("burner-allowlist");
/** PDA seed for the per-wallet dangerous-invoke timelock config. */
export const DANGER_SEED = new TextEncoder().encode("burner-danger");

/** Domain separator embedded in ExecuteK1 (12 bytes). */
export const DOMAIN_BYTES = new TextEncoder().encode("burner-v1-k1");

/** Current ExecuteK1 format version (v2 = 101-byte wire). */
export const EXECUTE_MSG_VERSION = 2;
/** Wire length of a serialized ExecuteK1 v2. */
export const EXECUTE_MSG_SIZE = 101;

// On-chain hard caps. Keeping these as JS constants so clients can validate
// before submission and surface friendlier errors than the program would.
export const MAX_OPS = 8;
export const MAX_ACCOUNTS_PER_INVOKE = 96;
export const MAX_INVOKE_DATA_LEN = 512;
export const MAX_USER_ALLOWLIST_PROGRAMS = 64;

/** Minimum SOL kept in the vault for rent exemption (lamports). */
export const MIN_VAULT_BALANCE = 890_880n;

/**
 * Timelock delay (in slots) between arming "dangerous invoke" mode and it
 * becoming active. Mirrors `DANGEROUS_INVOKE_DELAY_SLOTS` in the on-chain
 * program (~24h at ~2.5 slots/s). Keep in sync with the program constant.
 */
export const DANGEROUS_INVOKE_DELAY_SLOTS = 216_000n;

/** Cluster strings as encoded in ExecuteK1 (must be exactly 8 bytes). */
export const CLUSTER_DEVNET = new TextEncoder().encode("devnet  ");
export const CLUSTER_TESTNET = new TextEncoder().encode("testnet ");
export const CLUSTER_MAINNET = new TextEncoder().encode("mainnet ");

export type Cluster = "devnet" | "testnet" | "mainnet";

export function clusterBytes(cluster: Cluster): Uint8Array {
  switch (cluster) {
    case "devnet":
      return CLUSTER_DEVNET;
    case "testnet":
      return CLUSTER_TESTNET;
    case "mainnet":
      return CLUSTER_MAINNET;
  }
}

/** Native secp256k1 verify precompile. */
export const SECP256K1_PROGRAM_ID = new PublicKey(
  "KeccakSecp256k11111111111111111111111111111"
);
