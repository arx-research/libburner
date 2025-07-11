import {Account, Address, Chain, Hex, PublicClient} from "viem";
import {createSafeSmartAccount} from "@cometh/connect-core-sdk";
import axios from "axios";
import {UserOperation} from "viem/account-abstraction";
import {usd2BaseToken} from "../../tokens/subsidizedTokenSpec.js";
import {ARX_FWD_API} from "../../config.js";
import {BurnerTransactionError} from "../../error.js";
import {encodeCallDataFromSerialized} from "../serialization/preparedCallData.js";
import {unserializeUserOp} from "../serialization/preparedUserOpSerializer.js";
import {EncodeCallDataParams} from "../serialization/types.js";


export interface IGiftcardMakeUSD2TransferArgs {
  chain: Chain
  publicClient: PublicClient
  eoaAccount: Account
  smartAccountAddress: Address
  destinationAddress: Address
  amount: BigInt
  preSendCallback?: (() => Promise<boolean>) | null | undefined,
}

export async function giftcardMakeUSD2Transfer(args: IGiftcardMakeUSD2TransferArgs & {preSendCallback?: null | undefined}): Promise<string>
export async function giftcardMakeUSD2Transfer(args: IGiftcardMakeUSD2TransferArgs & {preSendCallback: () => Promise<boolean>}): Promise<string | null>

export async function giftcardMakeUSD2Transfer(args: IGiftcardMakeUSD2TransferArgs) {
  const smartAccount = await createSafeSmartAccount({
    chain: args.chain,
    publicClient: args.publicClient,
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

  if (args.preSendCallback && !await args.preSendCallback()) {
    return null;
  }

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

  return receiptRes.data.receipt.txHash as string
}
