import {generatePermitTypedData} from "./generatePermitTypedData.js";
import axios from "axios";
import {WalletClient} from "viem";
import {usd2BaseToken} from "@arx-research/libburner-common"
import {base} from "viem/chains";
import {ARX_FWD_API} from "../../config.js";
import {BurnerTransactionError} from "../../error.js";

export type IRelayPermitAndTransferArgs = {
    sourceAddress: string,
    recipientAddress: string,
    valueEth: string,
    walletClient: WalletClient,
}

export default async function relayPermitAndTransfer(args: IRelayPermitAndTransferArgs) {
    const {owner, deadline, v, r, s} = await generatePermitTypedData({
        tokenAddress: usd2BaseToken.erc2612ContractAddress,
        receiverContract: usd2BaseToken.receiverContractAddress,
        fromAccount: args.sourceAddress,
        walletClient: args.walletClient,
        valueEth: args.valueEth,
    })

    const body = {
        owner,
        chainId: base.id,
        recipientAddress: args.recipientAddress,
        receiverContract: usd2BaseToken.receiverContractAddress,
        value: args.valueEth,
        deadline,
        signature: {r, s, v},
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

    return res.data.txHash
}
