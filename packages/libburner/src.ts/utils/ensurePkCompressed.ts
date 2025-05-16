import * as secp from '@noble/secp256k1';

export default function ensurePkCompressed(hexString: string) {
  return secp.ProjectivePoint.fromHex(hexString).toHex(true)
}
