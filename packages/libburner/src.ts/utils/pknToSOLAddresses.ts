import pknToAddressETH from "./pknToAddressETH.js";
import {PublicKey} from "@solana/web3.js";
import {SOL_PROGRAM_ID} from "../config.js";

export interface IPKNTOSOLAddresses {
  vaultPDA: string,
  walletPDA: string,
}

export default function pknToSOLAddresses(pkN: string): IPKNTOSOLAddresses {
  const haloAddress = Buffer.from(pknToAddressETH(pkN).replace("0x", ""), "hex")

  // Derive Solana wallet PDA
  const programId = new PublicKey(SOL_PROGRAM_ID);
  const walletSeed = new TextEncoder().encode('burner');
  const [pda] = PublicKey.findProgramAddressSync(
    [walletSeed, haloAddress],
    programId
  );
  const walletPDA = pda;

  // Derive vault PDA (System Program owned account for receiving funds)
  const vaultSeed = new TextEncoder().encode('burner-vault');
  const [vault] = PublicKey.findProgramAddressSync(
    [vaultSeed, walletPDA.toBytes()],
    programId
  );

  return {
    vaultPDA: vault.toBase58(),
    walletPDA: walletPDA.toBase58(),
  };
}
