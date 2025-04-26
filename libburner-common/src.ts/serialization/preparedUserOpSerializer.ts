import {Address, Hex, isAddress} from "viem";
import {PrepareUserOperationReturnType, SendUserOperationParameters, SmartAccount} from "viem/account-abstraction";

import {SerializedBN, SerializedUserOperation} from "./types.js";
import {ComethSafeSmartAccount} from "@cometh/connect-core-sdk";


export function ensureHex(data: unknown): Hex {
    if (typeof data === "string" && data.startsWith("0x")) {
        return data as Address
    }

    throw new Error("Expected Hex, got: " + data)
}

export function ensureAddress(data: unknown): Address {
    if (typeof data === "string" && isAddress(data)) {
        return ensureHex(data) as Address
    }

    throw new Error("Expected Address, got: " + data)
}

export function serializeBN(data: BigInt): SerializedBN {
    if (data.constructor && data.constructor === BigInt) {
        return {
            type: "BigInt",
            value: data.toString()
        }
    }

    throw new Error("Expected BigInt.")
}

export function unserializeBN(data: SerializedBN): bigint {
    if (typeof data !== "object") {
        throw new Error("Expected an object.")
    }

    if (data.type !== "BigInt") {
        throw new Error("Expected serialized BigInt.")
    }

    return BigInt(data.value)
}

export function serializeUserOp(userOperation: PrepareUserOperationReturnType): SerializedUserOperation {
    console.log('userOperation to serialize', userOperation)

    return {
        paymaster: ensureAddress(userOperation.paymaster),
        sender: ensureAddress(userOperation.sender),
        callData: ensureHex(userOperation.callData),
        maxFeePerGas: serializeBN(userOperation.maxFeePerGas!),
        maxPriorityFeePerGas: serializeBN(userOperation.maxPriorityFeePerGas!),
        nonce: serializeBN(userOperation.nonce!),
        signature: ensureHex(userOperation.signature),
        paymasterData: ensureHex(userOperation.paymasterData),
        paymasterPostOpGasLimit: serializeBN(userOperation.paymasterPostOpGasLimit!),
        paymasterVerificationGasLimit: serializeBN(userOperation.paymasterVerificationGasLimit!),
        callGasLimit: serializeBN(userOperation.callGasLimit!),
        preVerificationGas: serializeBN(userOperation.preVerificationGas!),
        verificationGasLimit: serializeBN(userOperation.verificationGasLimit!),
        factory: ensureAddress(userOperation.factory),
        factoryData: ensureHex(userOperation.factoryData)
    }
}

export function unserializeUserOp(account: ComethSafeSmartAccount, serializedOp: SerializedUserOperation): SendUserOperationParameters {
    return {
        account: account as SmartAccount,
        paymaster: ensureAddress(serializedOp.paymaster),
        sender: ensureAddress(serializedOp.sender),
        callData: ensureHex(serializedOp.callData),
        maxFeePerGas: unserializeBN(serializedOp.maxFeePerGas),
        maxPriorityFeePerGas: unserializeBN(serializedOp.maxPriorityFeePerGas),
        nonce: unserializeBN(serializedOp.nonce),
        signature: ensureHex(serializedOp.signature),
        paymasterData: ensureHex(serializedOp.paymasterData),
        paymasterPostOpGasLimit: unserializeBN(serializedOp.paymasterPostOpGasLimit),
        paymasterVerificationGasLimit: unserializeBN(serializedOp.paymasterVerificationGasLimit),
        callGasLimit: unserializeBN(serializedOp.callGasLimit),
        preVerificationGas: unserializeBN(serializedOp.preVerificationGas),
        verificationGasLimit: unserializeBN(serializedOp.verificationGasLimit),
        factory: ensureAddress(serializedOp.factory),
        factoryData: ensureHex(serializedOp.factoryData)
    }
}
