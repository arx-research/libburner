import {generatePermitTypedData} from "./generatePermitTypedData.js";
import axios from "axios";
import {Address, PublicClient, WalletClient} from "viem";
import {TSubsidizedTokenSpec, usd2BaseToken} from "../../tokens/index.js";
import {base} from "viem/chains";
import {ARX_FWD_API} from "../../config.js";
import {BurnerTransactionError} from "../../error.js";
import {TRelayPermitAndTransferParams} from "../../tokens/index.js";

export type IRelayPermitAndTransferArgs = {
  subsidizedToken?: TSubsidizedTokenSpec,
  sourceAddress: Address,
  recipientAddress: Address,
  valueEth: string,
  publicClient: PublicClient,
  walletClient: WalletClient,
  preSendCallback?: () => Promise<boolean> | null,
  extraData?: Record<string, unknown> | undefined
}

export async function relayPermitAndTransfer(args: IRelayPermitAndTransferArgs & {preSendCallback?: null | undefined}): Promise<string>
export async function relayPermitAndTransfer(args: IRelayPermitAndTransferArgs & {preSendCallback: () => Promise<boolean>}): Promise<string | null>

export async function relayPermitAndTransfer(args: IRelayPermitAndTransferArgs): Promise<string | null> {
  const subsidizedToken = args.subsidizedToken ?? usd2BaseToken

  const {owner, deadline, v, r, s} = await generatePermitTypedData({
    tokenAddress: subsidizedToken.erc2612ContractAddress,
    receiverContract: subsidizedToken.receiverContractAddress,
    fromAccount: args.sourceAddress,
    valueEth: args.valueEth,
    publicClient: args.publicClient,
    walletClient: args.walletClient,
  })

  const body: TRelayPermitAndTransferParams = {
    owner,
    chainId: base.id,
    recipientAddress: args.recipientAddress,
    receiverContract: subsidizedToken.receiverContractAddress,
    value: args.valueEth,
    deadline,
    signature: {r, s, v},
    extraData: args.extraData,
  }

  // optional callback to validate if the wallet state isn't stale
  // right after the transaction was actually signed
  if (args.preSendCallback && !(await args.preSendCallback())) {
    return null
  }

  let res

  try {
    res = await axios.post(ARX_FWD_API + '/wallet/relay-permit-and-transfer',
      body,
      {
        timeout: 1000 * 120,
      })
  } catch (e) {
    if (e instanceof axios.AxiosError && e.response?.data?.error) {
      throw new BurnerTransactionError(e.response?.data?.error)
    } else {
      throw e
    }
  }

  return res.data.txHash as string
}
