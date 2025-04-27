import {Buffer} from "buffer"
import {secp256k1} from "@noble/curves/secp256k1"

export default function uncompressPk(pk: string): string {
  return Buffer.from(secp256k1.ProjectivePoint.fromHex(pk).toRawBytes(false)).toString("hex")
}
