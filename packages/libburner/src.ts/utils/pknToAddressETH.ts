import {uncompressPk} from "./index.js";
import {Address} from "viem";
import {publicKeyToAddress} from "viem/accounts";

export default function pknToAddressETH(pkN: string) {
  return publicKeyToAddress('0x' + uncompressPk(pkN) as Address)
}
