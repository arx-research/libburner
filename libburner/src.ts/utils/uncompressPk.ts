import { SigningKey } from 'ethers'

export function uncompressPk(pk: string): string {
    return SigningKey.computePublicKey('0x' + pk, false).slice(2)
}
