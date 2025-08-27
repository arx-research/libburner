import {Hex} from "viem";

export const secp256k1Order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export default function parseDERSignature(res: Buffer, curveOrder: bigint): {r: Hex, s: Hex} {
  if (res[0] !== 0x30 || res[2] !== 0x02) {
    throw new Error("Unable to parse signature, unexpected header (1).");
  }

  const rLen = res[3];

  if (res[rLen + 4] !== 0x02) {
    throw new Error("Unable to parse signature, unexpected header (2).");
  }

  const sLen = res[rLen + 5];

  if (res.length !== rLen + 4 + 2 + sLen) {
    throw new Error("Unable to parse signature, unexpected length.");
  }

  const r = res.slice(4, rLen + 4);
  const s = res.slice(rLen + 4 + 2, rLen + 4 + 2 + sLen);
  let rn = BigInt('0x' + r.toString('hex'));
  let sn = BigInt('0x' + s.toString('hex'));

  rn %= curveOrder;
  sn %= curveOrder;

  if (sn > curveOrder / 2n) {
    // malleable signature, not compliant with Ethereum's EIP-2
    // we need to flip s value in the signature
    sn = -sn + curveOrder;
  }

  return {
    r: ('0x' + rn.toString(16).padStart(64, '0')) as Hex,
    s: ('0x' + sn.toString(16).padStart(64, '0')) as Hex
  };
}
