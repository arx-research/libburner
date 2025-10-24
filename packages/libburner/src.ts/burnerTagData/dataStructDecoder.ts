import {Address} from "viem";

import {defaultTheme, findTheme, ITheme} from "./themeDefinitions.js";
import {graffitiDecoder, IGraffitiInfo} from "./graffitiDecoder.js";
import uncompressPk from "../utils/uncompressPk.js";
import hexDecode from "../utils/hexDecode.js";
import pknToAddressETH from "../utils/pknToAddressETH.js";
import pknToAddressBTC from "../utils/pknToAddressBTC.js";
import {computeGiftcardAddress} from "../giftcard/index.js";
import pknToSOLAddresses from "../utils/pknToSOLAddresses.js";


export interface IHaloDataStruct {
  isPartial: boolean
  data: Record<string, unknown>
}

export interface IHaloDataKeyFlags {
  isExported: boolean
  isImported: boolean
  isPasswordProtected: boolean
  rawSignCommandNotUsed: boolean
}

export type IDataStructDecoderResult = {
  pk2: string
  pkN: string
  pkNAttest: string | undefined
  eoaAddress: Address
  smartAccount: Address
  btcAddress: string
  solAddresses: {
    vaultPDA: string
    walletPDA: string
  }
  keyNumber: number
  color: string
  themeId: string
  graffiti: IGraffitiInfo | undefined
  theme: ITheme
  latch2Decoded: string | undefined
  pkNFlags: IHaloDataKeyFlags | undefined
}

export function latchDecoder(latch: string | null): string | null {
  if (!latch) {
    return null
  }

  const decoded = hexDecode(latch)
  return decoded.replace('.', '-')
}

function isHaloDataKeyFlags(obj: any): obj is IHaloDataKeyFlags {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.isExported === 'boolean' &&
    typeof obj.isImported === 'boolean' &&
    typeof obj.isPasswordProtected === 'boolean' &&
    typeof obj.rawSignCommandNotUsed === 'boolean'
  )
}

export async function dataStructDecoder(
  response: IHaloDataStruct
): Promise<IDataStructDecoderResult> {
  const pk8RawCompressed = response.data['compressedPublicKey:8']
  const pk9RawCompressed = response.data['compressedPublicKey:9']
  const pk2RawCompressed = response.data['compressedPublicKey:2']
  const pk8Attest = response.data['publicKeyAttest:8']
  const pk9Attest = response.data['publicKeyAttest:9']
  const graffitiRaw = response.data['graffiti:1']
  const latch2 = response.data['latchValue:2']
  const pk8Flags = response.data['keySlotFlags:8']
  const pk9Flags = response.data['keySlotFlags:9']
  let theme = defaultTheme

  // Make sure we have everything we need
  if (typeof pk2RawCompressed !== 'string') {
    throw new Error('Missing required pk2 parameters.')
  }

  if (typeof pk9RawCompressed === 'string') {
    // pk9 tag case
    if (typeof pk9Attest !== 'string') {
      throw new Error('Missing required pk9 parameters.')
    }
  } else if (
    typeof pk8RawCompressed !== 'string' ||
    typeof pk8Attest !== 'string'
  ) {
    // pk8 tag case
    throw new Error('Missing required pk8 parameters.')
  }

  let _latchDecoded = null
  let latch2Decoded = undefined

  // We might have color data
  if (typeof latch2 === 'string') {
    _latchDecoded = latchDecoder(latch2)

    if (_latchDecoded !== null) {
      latch2Decoded = _latchDecoded
      theme = findTheme(_latchDecoded)
    }
  }

  // If there's a pk9 but not graffiti they aborted early, finish setup
  if (graffitiRaw == null && typeof pk9RawCompressed === 'string') {
    const eoaAddress = pknToAddressETH(pk9RawCompressed)
    const smartAccount = await computeGiftcardAddress(eoaAddress)
    const btcAddress = pknToAddressBTC(pk9RawCompressed)
    const solAddresses = pknToSOLAddresses(pk9RawCompressed)

    if (typeof pk9Attest !== 'string') {
      throw new Error('Missing pk9Attest.')
    }

    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk9RawCompressed),
      pkNAttest: pk9Attest,
      eoaAddress,
      smartAccount,
      btcAddress,
      solAddresses,
      keyNumber: 9,
      color: theme.sku,
      themeId: theme.id,
      graffiti: undefined,
      theme,
      latch2Decoded,
      pkNFlags: isHaloDataKeyFlags(pk9Flags) ? pk9Flags : undefined
    }
  }

  // If its a new card save pk8 and go to step 1
  if (graffitiRaw === null && typeof pk8RawCompressed === 'string') {
    const eoaAddress = pknToAddressETH(pk8RawCompressed)
    const smartAccount = await computeGiftcardAddress(eoaAddress)
    const btcAddress = pknToAddressBTC(pk8RawCompressed)
    const solAddresses = pknToSOLAddresses(pk8RawCompressed)

    if (typeof pk8Attest !== 'string') {
      throw new Error('Missing pk8Attest.')
    }

    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk8RawCompressed),
      pkNAttest: pk8Attest,
      eoaAddress,
      smartAccount,
      btcAddress,
      solAddresses,
      keyNumber: 8,
      color: theme.sku,
      themeId: theme.id,
      graffiti: undefined,
      theme,
      latch2Decoded,
      pkNFlags: isHaloDataKeyFlags(pk8Flags) ? pk8Flags : undefined
    }
  }

  // If it's a setup pk9 card go to dashboard
  // We wont have the pkNAttest in this scenario and
  // Will have to retrieve it later if required
  if (typeof pk9RawCompressed === 'string' && typeof graffitiRaw === 'string') {
    const graffiti = graffitiDecoder(graffitiRaw)
    const theme = findTheme(graffiti?.themeId)

    const eoaAddress = pknToAddressETH(pk9RawCompressed)
    const smartAccount = await computeGiftcardAddress(eoaAddress)
    const btcAddress = pknToAddressBTC(pk9RawCompressed)
    const solAddresses = pknToSOLAddresses(pk9RawCompressed)

    if (typeof pk9Attest !== 'string') {
      throw new Error('Missing pk9Attest.')
    }

    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk9RawCompressed),
      pkNAttest: pk9Attest,
      eoaAddress,
      smartAccount,
      btcAddress,
      solAddresses,
      keyNumber: 9,
      color: theme.sku,
      themeId: theme.id,
      graffiti,
      theme,
      latch2Decoded,
      pkNFlags: isHaloDataKeyFlags(pk9Flags) ? pk9Flags : undefined
    }
  }

  // If it's a normal setup pk8 card
  if (typeof pk8RawCompressed === 'string' && typeof graffitiRaw === 'string') {
    const graffiti = graffitiDecoder(graffitiRaw)
    const theme = findTheme(graffiti?.themeId)

    const eoaAddress = pknToAddressETH(pk8RawCompressed)
    const smartAccount = await computeGiftcardAddress(eoaAddress)
    const btcAddress = pknToAddressBTC(pk8RawCompressed)
    const solAddresses = pknToSOLAddresses(pk8RawCompressed)

    if (typeof pk8Attest !== 'string') {
      throw new Error('Missing pk8Attest.')
    }

    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk8RawCompressed),
      pkNAttest: pk8Attest,
      eoaAddress,
      smartAccount,
      btcAddress,
      solAddresses,
      keyNumber: 8,
      color: theme.sku,
      themeId: theme.id,
      graffiti,
      theme,
      latch2Decoded,
      pkNFlags: isHaloDataKeyFlags(pk8Flags) ? pk8Flags : undefined
    }
  }

  throw new Error('Failed to parse data struct.')
}
