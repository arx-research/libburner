import {HaloCommandObject, HaloResGetDataStruct, HaloResponseObject, HexString} from "@arx-research/libhalo/types";
import {Account, Address, createPublicClient, createWalletClient, Hex, http, PublicClient, WalletClient} from "viem";
import {createViemHaloAccount} from "@arx-research/libhalo/api/common";
import {base} from "viem/chains";
import {publicActionsL2} from "viem/op-stack";
import relayPermitAndTransfer from "./transactions/fullWalletTx/relayPermitAndTransfer.js";
import {giftcardMakeUSD2Transfer} from "./transactions/giftcardTx/giftcardTransfer.js";
import {dataStructDecoder, computeGiftcardAddress, IDataStructDecoderResult, usd2BaseToken} from "@arx-research/libburner-common";


export type IHaloExecCallback = {
    (cmd: HaloCommandObject): Promise<HaloResponseObject>
}

export type IGetDataResult = IDataStructDecoderResult & {
    address: string
}

export type ISendUSD2Args = {
    destinationAddress: Address,
    amount: bigint
}

export default class Burner {
    haloExecCb: IHaloExecCallback
    burnerData: IGetDataResult | null
    keyPassword: string | null

    constructor(haloExecCb: IHaloExecCallback, burnerData?: IGetDataResult | null) {
        this.haloExecCb = haloExecCb
        this.burnerData = burnerData ?? null
        this.keyPassword = null
    }

    async getData(): Promise<IGetDataResult> {
        if (this.burnerData) {
            return this.burnerData
        }

        const response = await this.haloExecCb({
                name: 'get_data_struct',
                spec: 'latchValue:2,graffiti:1,compressedPublicKey:2,compressedPublicKey:8,compressedPublicKey:9,publicKeyAttest:8',
            }
        ) as HaloResGetDataStruct

        const decoded = dataStructDecoder(response)
        let address

        if (decoded.graffiti && decoded.graffiti.type === 'giftcard') {
            address = await computeGiftcardAddress(decoded.eoaAddress as Address)
        } else if (decoded.graffiti && decoded.graffiti.type === 'wallet') {
            address = decoded.eoaAddress
        } else {
            throw new Error('Unexpected Burner graffiti type.')
        }

        this.burnerData = {
            address,
            ...decoded,
        }

        return this.burnerData!
    }

    setPassword(keyPassword: string) {
        if (!this.burnerData) {
            throw new Error("Missing burner data.")
        }

        this.keyPassword = keyPassword
    }

    _asViemAccountNoCheck(): Account {
        if (!this.burnerData) {
            throw new Error("Missing burner data.")
        }

        return createViemHaloAccount(this.burnerData.eoaAddress as Hex, async (digest: HexString, subject: unknown) => {
            return await this.haloExecCb({
                "name": "sign",
                "keyNo": this.burnerData!.keyNumber,
                "password": this.keyPassword,
                "digest": digest
            })
        })
    }

    asViemAccount(): Account {
        if (!this.burnerData) {
            throw new Error("Missing burner data.")
        }

        if (!this.burnerData.graffiti || this.burnerData.graffiti.type !== "wallet") {
            throw new Error("Viem account provider is only supported for full wallet Burner tags.")
        }

        return this._asViemAccountNoCheck()
    }

    _getPublicClient(): PublicClient {
        return createPublicClient({
            chain: base,
            transport: http(),
        }).extend(publicActionsL2()) as PublicClient
    }

    _getWalletClient(): WalletClient {
        if (!this.burnerData) {
            throw new Error("Missing burner data.")
        }

        return createWalletClient({
            chain: base,
            transport: http(),
            account: this.asViemAccount() as Account,
        })
    }

    async getUSD2Balance() {
        if (!this.burnerData) {
            throw new Error("Missing burner data.")
        }

        return await this._getPublicClient().readContract({
            address: usd2BaseToken.erc2612ContractAddress as Hex,
            abi: [{
                inputs: [{name: "owner", type: "address"}],
                name: "balanceOf",
                outputs: [{name: "", type: "uint256"}],
                stateMutability: "view",
                type: "function",
            }],
            functionName: 'balanceOf',
            args: [this.burnerData.address as Hex],
        })
    }

    async _sendUSD2Wallet(args: ISendUSD2Args) {
        if (!this.burnerData) {
            throw new Error("Missing burner data.")
        }

        const walletClient = this._getWalletClient()

        return await relayPermitAndTransfer({
            walletClient: walletClient,
            sourceAddress: this.burnerData.eoaAddress,
            recipientAddress: args.destinationAddress,
            valueEth: args.amount.toString(),
        })
    }

    async _sendUSD2Giftcard(args: ISendUSD2Args) {
        if (!this.burnerData) {
            throw new Error("Missing burner data.")
        }

        return await giftcardMakeUSD2Transfer({
            chain: base,
            eoaAccount: this._asViemAccountNoCheck(),
            smartAccountAddress: this.burnerData.address as Address,
            destinationAddress: args.destinationAddress as Address,
            amount: args.amount,
        })
    }

    async sendUSD2(args: ISendUSD2Args) {
        if (!this.burnerData || !this.burnerData.graffiti) {
            throw new Error("Missing burner data.")
        }

        if (this.burnerData.graffiti.type === "wallet") {
            return await this._sendUSD2Wallet(args)
        } else if (this.burnerData.graffiti.type === "giftcard") {
            return await this._sendUSD2Giftcard(args)
        } else {
            throw new Error("Unsupported tag type: " + this.burnerData.graffiti.type)
        }
    }
}
