import {Account, Address, Chain, createPublicClient, Hex, http} from "viem";
import {createSafeSmartAccount} from "@cometh/connect-core-sdk";
import axios from "axios";
import {UserOperation} from "viem/account-abstraction";
import {encodeCallDataFromSerialized, EncodeCallDataParams, unserializeUserOp, usd2BaseToken} from "@arx-research/libburner-common";
import {ARX_FWD_API} from "../../config.js";
import {BurnerTransactionError} from "../../error.js";

export interface IGiftcardMakeUSD2TransferArgs {
    chain: Chain
    eoaAccount: Account
    smartAccountAddress: Address
    destinationAddress: Address
    amount: BigInt
}

export async function giftcardMakeUSD2Transfer(args: IGiftcardMakeUSD2TransferArgs) {
    const publicClient = createPublicClient({
        transport: http(),
        chain: args.chain,
    })

    const smartAccount = await createSafeSmartAccount({
        chain: args.chain,
        publicClient: publicClient as any,
        signer: args.eoaAccount,
        smartAccountAddress: args.smartAccountAddress,
    })

    const callDataReq: EncodeCallDataParams = {
        type: "erc20Transfer",
        data: {
            destinationAddress: args.destinationAddress as Hex,
            tokenContractAddress: usd2BaseToken.erc2612ContractAddress as Hex,
            sendAmount: {type: "BigInt", value: args.amount.toString()}
        }
    }

    let prepRes

    try {
        prepRes = await axios.post(ARX_FWD_API + "/giftcard/userop/prepare", {
            type: "giftcard",
            eoaAddress: args.eoaAccount.address,
            smartAccountAddress: args.smartAccountAddress,
            callData: callDataReq
        })
    } catch (e) {
        if (e instanceof axios.AxiosError && e.response?.data?.error) {
            throw new BurnerTransactionError(e.response?.data?.error)
        } else {
            throw e
        }
    }

    const payloadPart = prepRes.data.jwt.split('.')[1]
    const payloadBytes = Buffer.from(payloadPart, "base64")
    const payload = JSON.parse(payloadBytes.toString("utf-8"))

    const expectedCallData = await encodeCallDataFromSerialized(smartAccount, callDataReq)
    const unserializedUserOp = unserializeUserOp(smartAccount, payload.userOperation)

    // we will cross-check whether the callData returned by the server is matching with
    // the operation that we are planning to execute
    if (unserializedUserOp.callData !== expectedCallData) {
        throw new BurnerTransactionError("Mismatched call data serializations.")
    }

    const signature = await smartAccount.signUserOperation(unserializedUserOp as UserOperation)
    let submitRes

    try {
        submitRes = await axios.post(ARX_FWD_API + "/giftcard/userop/send", {
            jwt: prepRes.data.jwt,
            signature,
        })
    } catch (e) {
        if (e instanceof axios.AxiosError && e.response?.data?.error) {
            throw new BurnerTransactionError(e.response?.data?.error)
        } else {
            throw e
        }
    }

    const userOperationHash = submitRes.data.userOperationHash
    const sendJWT = submitRes.data.jwt

    let receiptRes
    let retry = 0

    while (true) {
        try {
            receiptRes = await axios.get(ARX_FWD_API + "/giftcard/userop/receipt", {
                params: {
                    jwt: sendJWT
                }
            })
        } catch (e) {
            if (e instanceof axios.AxiosError && e.response?.data?.error) {
                throw new BurnerTransactionError(e.response?.data?.error)
            } else {
                throw e
            }
        }

        if (receiptRes.data.receipt) {
            break;
        }

        if (retry >= 60) {
            throw new BurnerTransactionError("Timed out trying to get receipt for operation: " + userOperationHash)
        }

        retry++
        await new Promise(r => setTimeout(r, 1500))
    }

    if (receiptRes.data.receipt.status !== "success") {
        throw new BurnerTransactionError("Transaction receipt has status: " + receiptRes.data.receipt.status)
    }

    return receiptRes.data.receipt.txHash
}
