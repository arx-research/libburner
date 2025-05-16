import {Address, Hex} from "viem";
import {publicKeyToAddress} from "viem/accounts";

import {defaultTheme, findTheme, ITheme} from "./themeDefinitions.js";
import {graffitiDecoder, IGraffitiInfo} from "./graffitiDecoder.js";
import uncompressPk from "../utils/uncompressPk.js";
import hexDecode from "../utils/hexDecode.js";
import pknToAddressETH from "../utils/pknToAddressETH.js";
import {pknToAddressBTC} from "../utils/index.js";


export interface IHaloDataStruct {
  isPartial: boolean
  data: Record<string, unknown>
}

export type IDataStructDecoderResultETH = {
  pk2: string
  pkN: string
  pkNAttest: string | undefined
  eoaAddress: Address
  keyNumber: number
  color: string
  themeId: string
  graffiti: IGraffitiInfo | undefined
  theme: ITheme
}

export type IDataStructDecoderResultBTC = {
  pk2: string
  pkN: string
  pkNAttest: string | undefined
  eoaAddress: string
  keyNumber: number
  color: string
  themeId: string
  graffiti: IGraffitiInfo | undefined
  theme: ITheme
}

export type DecodeMode = "BurnerETH" | "BurnerBTC";

export type IDataStructDecoderResultType<T> =
  T extends "BurnerETH" ? IDataStructDecoderResultETH :
    T extends "BurnerBTC" ? IDataStructDecoderResultBTC :
      never;

function latchDecoder(latch: string | null) {
  if (!latch) return 0

  const decoded = hexDecode(latch)
  return decoded.replace('.', '-')
}

function computeEOAAddress(decodeMode: DecodeMode, pkN: string) {
  if (decodeMode === "BurnerETH") {
    return pknToAddressETH(pkN)
  } else if (decodeMode === "BurnerBTC") {
    return pknToAddressBTC(pkN)
  } else {
    throw new Error("Invalid decodeMode.")
  }
}

export function dataStructDecoder<T extends DecodeMode>(decodeMode: T, response: IHaloDataStruct): IDataStructDecoderResultType<T> {
  const pk8RawCompressed = response.data['compressedPublicKey:8']
  const pk9RawCompressed = response.data['compressedPublicKey:9']
  const pk2RawCompressed = response.data['compressedPublicKey:2']
  const pk8Attest = response.data['publicKeyAttest:8']
  const graffitiRaw = response.data['graffiti:1']
  const latch2 = response.data['latchValue:2']
  let theme = defaultTheme

  // Make sure we have everything we need
  if (
    response.isPartial ||
    (typeof pk8RawCompressed !== 'string' && typeof pk9RawCompressed !== 'string') ||
    typeof pk2RawCompressed !== 'string' ||
    typeof pk8Attest !== 'string'
  ) {
    throw new Error('Missing required parameters.')
  }

  // We might have color data
  if (typeof latch2 === 'string') {
    const latchDecoded = latchDecoder(latch2)
    if (latchDecoded !== 0) theme = findTheme(latchDecoded)
    // console.log('Theme found from latch2', theme)
  }

  // If there's a pk9 but not graffiti they aborted early, finish setup
  if (graffitiRaw == null && typeof pk9RawCompressed === 'string') {
    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk9RawCompressed),
      pkNAttest: undefined,
      eoaAddress: computeEOAAddress(decodeMode, pk9RawCompressed),
      keyNumber: 9,
      color: theme.sku,
      themeId: theme.id,
      graffiti: undefined,
      theme,
    } as IDataStructDecoderResultType<T>
  }

  // If its a new card save pk8 and go to step 1
  if (graffitiRaw === null && typeof pk8RawCompressed === 'string') {
    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk8RawCompressed),
      pkNAttest: pk8Attest,
      eoaAddress: computeEOAAddress(decodeMode, pk8RawCompressed),
      keyNumber: 8,
      color: theme.sku,
      themeId: theme.id,
      graffiti: undefined,
      theme,
    } as IDataStructDecoderResultType<T>
  }

  // If it's a setup pk9 card go to dashboard
  // We wont have the pkNAttest in this scenario and
  // Will have to retrieve it later if required
  if (typeof pk9RawCompressed === 'string' && typeof graffitiRaw === 'string') {
    const graffiti = graffitiDecoder(graffitiRaw)
    const theme = findTheme(graffiti?.themeId)

    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk9RawCompressed),
      pkNAttest: undefined,
      eoaAddress: computeEOAAddress(decodeMode, pk9RawCompressed),
      keyNumber: 9,
      color: theme.sku,
      themeId: theme.id,
      graffiti,
      theme,
    } as IDataStructDecoderResultType<T>
  }

  // If it's a normal setup pk8 card
  if (typeof pk8RawCompressed === 'string' && typeof graffitiRaw === 'string') {
    const graffiti = graffitiDecoder(graffitiRaw)
    const theme = findTheme(graffiti?.themeId)

    return {
      pk2: uncompressPk(pk2RawCompressed),
      pkN: uncompressPk(pk8RawCompressed),
      pkNAttest: pk8Attest,
      eoaAddress: computeEOAAddress(decodeMode, pk8RawCompressed),
      keyNumber: 8,
      color: theme.sku,
      themeId: theme.id,
      graffiti,
      theme,
    } as IDataStructDecoderResultType<T>
  }

  throw new Error('Failed to parse data struct.')
}
