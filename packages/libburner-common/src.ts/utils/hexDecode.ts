export default function hexDecode(hexString: string) {
  let result = ''

  for (let i = 0; i < hexString.length; i += 2) {
    const byteValue = parseInt(hexString.substring(i, i + 2), 16)
    if (byteValue >= 32 && byteValue <= 126) {
      result += String.fromCharCode(byteValue)
    }
  }
  return result
}
