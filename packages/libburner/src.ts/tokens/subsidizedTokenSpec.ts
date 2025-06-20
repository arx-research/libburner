import {TGetSubsidizedGasTokenSpec, TSubsidizedTokenSpec} from "./types.js";

const CHAIN_ID_BASE = 8453
const CHAIN_ID_BASE_SEPOLIA = 84532

export const usd2BaseToken: TSubsidizedTokenSpec = {
  chainId: CHAIN_ID_BASE,
  decimals: 6,
  minTransferAmount: BigInt(10000),
  erc2612ContractAddress: '0xfe26e72431Bd82c285655e897F25104E547c4c07',
  receiverContractAddress: '0xe5B2Cd54B950a34e518Ec34F30c137f6b40D1ACB',
  relayerForwarderAddress: '0xd04f98c88ce1054c90022ee34d566b9237a1203c',
  relayerURL:
    'https://4392b34c.engine-usw2.thirdweb.com/relayer/d11225c0-f517-4b36-a101-fae5f535784e',
}

export const usd2BaseSepoliaToken: TSubsidizedTokenSpec = {
  chainId: CHAIN_ID_BASE_SEPOLIA,
  decimals: 6,
  minTransferAmount: BigInt(1),
  erc2612ContractAddress: '0x504f0eaf318cB4bF3290DcA07cEb3ea393822C20',
  receiverContractAddress: '0x3ECe77731794C007E9ABeB3D84D723af5d0259Ee',
  relayerForwarderAddress: '0xd04f98c88ce1054c90022ee34d566b9237a1203c',
  relayerURL:
    'https://c79710cb.engine-usw2.thirdweb.com/relayer/cb60161b-5e90-43e5-80d6-25a7dbad5f2e',
}

export const subsidizedGasTokens: TSubsidizedTokenSpec[] = [usd2BaseToken, usd2BaseSepoliaToken]

export function getSubsidizedGasTokenSpec(args: TGetSubsidizedGasTokenSpec) {
  for (let iterTokenSpec of subsidizedGasTokens) {
    const iterContractAddr = iterTokenSpec.erc2612ContractAddress.toLowerCase()
    const iterReceiverAddr = iterTokenSpec.receiverContractAddress.toLowerCase()

    const matchingContractAddr = args.contractAddress && args.contractAddress.toLowerCase() === iterContractAddr
    const matchingReceiverAddr = args.receiverContract && args.receiverContract.toLowerCase() === iterReceiverAddr

    if (args.chainId === iterTokenSpec.chainId && (matchingContractAddr || matchingReceiverAddr)) {
      return iterTokenSpec
    }
  }

  return null
}
