import { PublicKey } from "@solana/web3.js";
import {
  BURNER_PROGRAM_ID,
  VAULT_SEED,
  WALLET_SEED,
  USER_ALLOWLIST_SEED,
  SUCCESSORS_SEED,
  DANGER_SEED,
} from "./constants.js";

export interface WalletPDAs {
  wallet: PublicKey;
  walletBump: number;
  vault: PublicKey;
  vaultBump: number;
  userAllowlist: PublicKey;
  userAllowlistBump: number;
  dangerConfig: PublicKey;
  dangerConfigBump: number;
}

/**
 * Derive all per-wallet PDAs from a chip's 20-byte Ethereum-style address.
 *
 * @param k1Addr  20-byte chip address (eg `keccak256(uncompressedPubkey[1..])[12..]`)
 * @param programId  Defaults to the canonical burner_wallet program ID; pass
 *                   another to test against a successor program.
 */
export function deriveWalletPDAs(
  k1Addr: Uint8Array,
  programId: PublicKey = BURNER_PROGRAM_ID
): WalletPDAs {
  if (k1Addr.length !== 20) {
    throw new Error(`k1Addr must be 20 bytes, got ${k1Addr.length}`);
  }
  const [wallet, walletBump] = PublicKey.findProgramAddressSync(
    [WALLET_SEED, k1Addr],
    programId
  );
  const [vault, vaultBump] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, wallet.toBytes()],
    programId
  );
  const [userAllowlist, userAllowlistBump] = PublicKey.findProgramAddressSync(
    [USER_ALLOWLIST_SEED, wallet.toBytes()],
    programId
  );
  const [dangerConfig, dangerConfigBump] = PublicKey.findProgramAddressSync(
    [DANGER_SEED, wallet.toBytes()],
    programId
  );
  return {
    wallet,
    walletBump,
    vault,
    vaultBump,
    userAllowlist,
    userAllowlistBump,
    dangerConfig,
    dangerConfigBump,
  };
}

/** The Successors singleton PDA. */
export function deriveSuccessorsPDA(
  programId: PublicKey = BURNER_PROGRAM_ID
): { successors: PublicKey; bump: number } {
  const [successors, bump] = PublicKey.findProgramAddressSync(
    [SUCCESSORS_SEED],
    programId
  );
  return { successors, bump };
}

/**
 * Compute the destination wallet+vault PDAs that `Op::MigrateAsset` will
 * derive on-chain when migrating to `successorProgram`. The successor MUST use
 * the same seed convention (`["burner", k1]` and `["burner-vault", wallet]`).
 */
export function deriveMigrationDestination(
  k1Addr: Uint8Array,
  successorProgram: PublicKey
): { destWallet: PublicKey; destVault: PublicKey } {
  const { wallet: destWallet, vault: destVault } = deriveWalletPDAs(
    k1Addr,
    successorProgram
  );
  return { destWallet, destVault };
}
