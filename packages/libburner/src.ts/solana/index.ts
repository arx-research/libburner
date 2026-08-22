// `@arx-research/libburner/solana` — burner_wallet Solana program client.
//
// Pairs with `burner-sol-demo` (on devnet at program ID
// Ev5JBnsnEAB2gTvQZqffnZ79RJaVaiVji1ReKAhcJBtv). Provides typed wrappers for
// every instruction plus a `SolanaBurnerWallet` class that orchestrates chip
// signing + relayer fee payer + RPC.
//
// Quick start:
//   const wallet = new SolanaBurnerWallet({ connection, chip, feePayer });
//   await wallet.initialize();
//   await wallet.transferSol(recipient, 1_000_000n);
//
// Implementations of `ChipSigner` and `FeePayerSigner` are app-supplied (HaLo
// Gateway in production; in-memory test keys in unit tests).

export * from "./constants.js";
export * from "./types.js";
export * from "./pdas.js";
export * from "./discriminators.js";
export * from "./canonical.js";
export * from "./secp.js";
export * from "./signers.js";
export * from "./builders.js";
export * from "./bubblegum.js";
export * from "./wallet.js";
