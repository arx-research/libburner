import * as bitcoinjs from 'bitcoinjs-lib'
import ensurePkCompressed from './ensurePkCompressed.js'

export default function pknToAddressBTC(hexString: string) {
  const pointCompressed = ensurePkCompressed(hexString)

  const { address } = bitcoinjs.payments.p2wpkh({
    pubkey: Buffer.from(pointCompressed, "hex")
  })

  if (!address) {
    throw new Error('Failed to generate address.')
  }

  return address!
}
