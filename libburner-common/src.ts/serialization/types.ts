import {Address, Hex} from "viem";

export interface SerializedBN {
    type: "BigInt"
    value: string
}

export interface SerializedUserOperation {
    paymaster: Address
    sender: Address
    callData: Hex
    maxFeePerGas: SerializedBN
    maxPriorityFeePerGas: SerializedBN
    nonce: SerializedBN
    signature: Hex
    paymasterData: Hex
    paymasterPostOpGasLimit: SerializedBN
    paymasterVerificationGasLimit: SerializedBN
    callGasLimit: SerializedBN
    preVerificationGas: SerializedBN
    verificationGasLimit: SerializedBN
}

export interface EncodeCallDataParams {
    type: "erc20Transfer"
    data: EncodeCallDataERC20TransferParams
}

export interface EncodeCallDataERC20TransferParams {
    destinationAddress: Address
    tokenContractAddress: Address
    sendAmount: SerializedBN
}
