// Import the module directly rather than the barrel. Going through
// ./index.js pulls every util into this file's dependency graph, which makes
// utils/index part of any cycle a sibling introduces — exactly what happened
// when pknToSOLAddresses started delegating into solana/pdas.
import uncompressPk from "./uncompressPk.js";
import {Address} from "viem";
import {publicKeyToAddress} from "viem/accounts";

export default function pknToAddressETH(pkN: string) {
  return publicKeyToAddress('0x' + uncompressPk(pkN) as Address)
}
