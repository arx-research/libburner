import { pknToWalletPDAs } from "../solana/pdas.js";

export interface IPKNTOSOLAddresses {
  vaultPDA: string,
  walletPDA: string,
}

/**
 * Wallet and vault PDAs for a chip, as base58 strings.
 *
 * Kept as-is for compatibility — dataStructDecoder returns this shape and it is
 * part of the public API. The derivation itself now lives in
 * `solana/pknToWalletPDAs`, which this delegates to.
 *
 * Before, this file re-implemented the seed derivation and read its own
 * SOL_PROGRAM_ID from config.ts, so the program id and the PDA seeds each had
 * two definitions that had to agree. They did — but nothing enforced it, and a
 * change to one would have silently produced different addresses for the same
 * chip.
 *
 * For the allowlist/danger PDAs, the bumps, or PublicKey objects, call
 * `pknToWalletPDAs` directly.
 */
export default function pknToSOLAddresses(pkN: string): IPKNTOSOLAddresses {
  const { wallet, vault } = pknToWalletPDAs(pkN);
  return {
    vaultPDA: vault.toBase58(),
    walletPDA: wallet.toBase58(),
  };
}
