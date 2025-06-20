import {Hex} from "viem";

export type TGetSubsidizedGasTokenSpec = {
  chainId: number,
  contractAddress?: Hex
  receiverContract?: Hex
}

export type TSubsidizedTokenSpec = {
  chainId: number,
  decimals: number,
  erc2612ContractAddress: Hex,
  receiverContractAddress: Hex,
  relayerForwarderAddress: Hex,
  relayerURL: string,
}

export type TRelayPermitAndTransferParams = {
  chainId: number,
  owner: string,
  recipientAddress: string,
  receiverContract: string,
  value: string,
  deadline: number,
  signature: {
    r: string,
    s: string,
    v: number
  },
  extraData?: Record<string, unknown> | undefined
}
