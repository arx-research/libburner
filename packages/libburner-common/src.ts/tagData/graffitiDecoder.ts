import {findTheme} from './themeDefinitions.js'
import b64 from '../utils/b64.js'

// Graffiti map:
// - Beginning (up to the last 4 characters): Encoded wallet name
// - 3rd to last character: Theme ID
// - 2nd to last character: Wallet type
// - 1st to last character: Unused
// - Last character: Unused

export interface IGraffitiInfo {
  graffitiRaw: string
  graffitiPartsRaw: {
    name: string
    theme: string
    type: string
    unused1: string
    unused2: string
  }
  name: string | undefined
  type: 'giftcard' | 'wallet'
  themeId: string
  themeName: string
}

export function graffitiDecoder(graffiti: string | null): IGraffitiInfo | undefined {
  if (!graffiti) return

  // Get each part
  const nameEncoded = graffiti.slice(0, -4)
  const themeIdString = graffiti[graffiti.length - 4]
  const walletType = graffiti[graffiti.length - 3]
  const unused1 = graffiti[graffiti.length - 2]
  const unused2 = graffiti[graffiti.length - 1]

  // Decode the name
  const name = b64.decode(nameEncoded)

  // Get the theme
  const theme = findTheme(themeIdString)

  // Return the data
  return {
    graffitiRaw: graffiti,
    graffitiPartsRaw: {
      name: nameEncoded,
      theme: themeIdString,
      type: walletType,
      unused1,
      unused2,
    },
    name,
    type: walletType === '1' ? 'giftcard' : 'wallet',
    themeId: themeIdString,
    themeName: theme.sku,
  }
}
