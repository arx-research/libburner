import {encodeFunctionData, parseAbi} from "viem";
import {ComethSafeSmartAccount} from "@cometh/connect-core-sdk";

import {EncodeCallDataERC20TransferParams, EncodeCallDataParams} from "./types.js";
import {unserializeBN} from "./preparedUserOpSerializer.js";


export async function encodeCallDataFromSerialized(smartAccount: ComethSafeSmartAccount, args: EncodeCallDataParams) {
    if (args.type === "erc20Transfer") {
        return await encodeCallDataERC20Transfer(smartAccount, args.data)
    } else {
        throw new Error("Unexpected type: " + args.type)
    }
}

export async function encodeCallDataERC20Transfer(smartAccount: ComethSafeSmartAccount, args: EncodeCallDataERC20TransferParams) {
    const transferAbi = parseAbi([
        'function transfer(address to, uint256 amount) returns (bool)',
    ])

    const innerCallData = encodeFunctionData({
        abi: transferAbi,
        functionName: "transfer",
        args: [args.destinationAddress, unserializeBN(args.sendAmount)],
    })

    return await smartAccount.encodeCalls([
        {
            to: args.tokenContractAddress,
            data: innerCallData,
            value: 0n,
        }
    ])
}
