import {
  Account,
  Address,
  Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  Hex,
  http,
  PublicClient, recoverAddress, serializeSignature,
  WalletClient
} from "viem";
import {createViemHaloAccount} from "./viem_account.js";
import {base, baseSepolia} from "viem/chains";
import {publicActionsL2} from "viem/op-stack";
import {relayPermitAndTransfer} from "./fullWallet/transactions/relayPermitAndTransfer.js";
import {giftcardMakeUSD2Transfer} from "./giftcard/transactions/giftcardTransfer.js";
import {
  dataStructDecoder,
  IDataStructDecoderResult
} from "./burnerTagData/dataStructDecoder.js";
import {computeGiftcardAddress} from "./giftcard/smartAccount/address.js";
import {usd2BaseToken, usdcBaseToken, usd2BaseSepoliaToken, usdcBaseSepoliaToken} from "./tokens/subsidizedTokenSpec.js";
import parseDERSignature, {secp256k1Order} from "./utils/parseDERSignature.js";
import {TSubsidizedTokenSpec} from "./tokens/index.js";

export {Hex, Address, Chain, Account}
export * from './error.js'
export * from './viem_account.js'

export interface HaloResGetDataStruct {
  isPartial: boolean
  data: Record<string, unknown>
}

export type IHaloExecCallback = {
  (cmd: unknown): Promise<unknown>
}

export type IGetDataResult = IDataStructDecoderResult & {
  address: Address
}

export type ISendUSDArgs = {
  destinationAddress: Address,
  amount: bigint,
  preSendCallback?: () => Promise<boolean>,
}

export type ISendUSD2Args = ISendUSDArgs
export type ISendUSDCArgs = ISendUSDArgs

type ChainRpcUrls = {
  http: readonly string[]
  webSocket?: readonly string[] | undefined
}

type TTokenType = "usdc" | "usd2"
type TChainName = "base" | "base-sepolia"

type ISupportedToken = {
  tokenType: TTokenType
  chainName: TChainName
  spec: TSubsidizedTokenSpec
}

const supportedTokens: ISupportedToken[] = [
  {tokenType: "usdc", chainName: "base", spec: usdcBaseToken},
  {tokenType: "usd2", chainName: "base", spec: usd2BaseToken},
  {tokenType: "usdc", chainName: "base-sepolia", spec: usdcBaseSepoliaToken},
  {tokenType: "usd2", chainName: "base-sepolia", spec: usd2BaseSepoliaToken},
]

export type IBurnerConstructorArgs = {
  haloExecCb: IHaloExecCallback
  chainRpcUrls: ChainRpcUrls
  burnerData?: IGetDataResult | null
  chain?: TChainName | null
}

export default class Burner {
  haloExecCb: IHaloExecCallback
  chainRpcUrls: ChainRpcUrls
  chain: TChainName
  burnerData: IGetDataResult | null
  keyPassword: string | null
  rawPwdDigest: string | null

  constructor(args: IBurnerConstructorArgs) {
    this.haloExecCb = args.haloExecCb
    this.chainRpcUrls = args.chainRpcUrls
    this.chain = args.chain ?? "base"
    this.burnerData = args.burnerData ?? null
    this.keyPassword = null
    this.rawPwdDigest = null
  }

  _getSubsidizedToken(tokenType: TTokenType): TSubsidizedTokenSpec {
    for (const supportedToken of supportedTokens) {
      if (supportedToken.chainName === this.chain && supportedToken.tokenType === tokenType) {
        return supportedToken.spec;
      }
    }

    throw new Error("Unsupported token " + tokenType + " on chain " + this.chain);
  }

  async getData(): Promise<IGetDataResult> {
    if (this.burnerData) {
      return this.burnerData
    }

    const response = await this.haloExecCb({
        name: 'get_data_struct',
        spec: 'latchValue:2,graffiti:1,compressedPublicKey:2,compressedPublicKey:9,publicKeyAttest:9,compressedPublicKey:8,publicKeyAttest:8',
      }
    ) as HaloResGetDataStruct

    const decoded = await dataStructDecoder(response)
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

    this.rawPwdDigest = null
    this.keyPassword = keyPassword
  }

  setRawPwdDigest(rawPwdDigest: string) {
    if (!this.burnerData) {
      throw new Error("Missing burner data.")
    }

    this.keyPassword = null
    this.rawPwdDigest = rawPwdDigest
  }

  _asViemAccountNoCheck(): Account {
    if (!this.burnerData) {
      throw new Error("Missing burner data.")
    }

    return createViemHaloAccount(this.burnerData.eoaAddress as Hex, async (digest: string, subject: unknown) => {
      let pwdKey: Record<string, string> = {}

      if (this.keyPassword) {
        pwdKey = {password: this.keyPassword}
      } else if (this.rawPwdDigest) {
        pwdKey = {rawPwdDigest: this.rawPwdDigest}
      }

      const haloRes = await this.haloExecCb({
        "name": "sign",
        "keyNo": this.burnerData!.keyNumber,
        "digest": digest,
        ...pwdKey,
        "skipPostprocessing": true,
      }) as { signature: { der: string } }

      const derSig = Buffer.from(haloRes.signature.der, "hex")
      const parsedSig = parseDERSignature(derSig, secp256k1Order)

      for (let yParity = 0; yParity <= 1; yParity++) {
        const address = await recoverAddress({
          hash: ('0x' + digest) as Hex,
          signature: {
            ...parsedSig,
            yParity,
          }
        })

        if (this.burnerData!.eoaAddress.toLowerCase() === address.toLowerCase()) {
          return serializeSignature({...parsedSig, yParity})
        }
      }

      throw new Error("This Burner card does not seem to contain the correct key for " +
        "the subject account: " + this.burnerData!.eoaAddress);
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

  _getPatchedChain() {
    switch (this.chain) {
      case 'base':
        return this._patchChain(base)

      case 'base-sepolia':
        return this._patchChain(baseSepolia)

      default:
        throw new Error("Unsupported chain: " + this.chain)
    }
  }

  _patchChain(chain: Chain) {
    return defineChain({
      ...chain,
      fees: {
        baseFeeMultiplier: 1.2
      },
      rpcUrls: {
        default: this.chainRpcUrls,
      },
    })
  }

  _getPublicClient(): PublicClient {
    return createPublicClient({
      chain: this._getPatchedChain(),
      transport: http(),
    }).extend(publicActionsL2()) as PublicClient
  }

  _getWalletClient(): WalletClient {
    if (!this.burnerData) {
      throw new Error("Missing burner data.")
    }

    return createWalletClient({
      chain: this._getPatchedChain(),
      transport: http(),
      account: this.asViemAccount() as Account,
    })
  }

  async getUSD2Balance() {
    if (!this.burnerData) {
      throw new Error("Missing burner data.")
    }

    return await this._getPublicClient().readContract({
      address: this._getSubsidizedToken("usd2").erc2612ContractAddress as Hex,
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

  async getUSDCBalance() {
    if (!this.burnerData) {
      throw new Error("Missing burner data.")
    }

    return await this._getPublicClient().readContract({
      address: this._getSubsidizedToken("usdc").erc2612ContractAddress as Hex,
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

    const publicClient = this._getPublicClient()
    const walletClient = this._getWalletClient()

    const callArgs = {
      subsidizedToken: this._getSubsidizedToken("usd2"),
      publicClient: publicClient,
      walletClient: walletClient,
      sourceAddress: this.burnerData.eoaAddress,
      recipientAddress: args.destinationAddress,
      valueEth: args.amount.toString(),
    }

    if (args.preSendCallback) {
      return await relayPermitAndTransfer({...callArgs, preSendCallback: args.preSendCallback})
    } else {
      return await relayPermitAndTransfer({...callArgs})
    }
  }

  async _sendUSDCWallet(args: ISendUSDCArgs) {
    if (!this.burnerData) {
      throw new Error("Missing burner data.")
    }

    const publicClient = this._getPublicClient()
    const walletClient = this._getWalletClient()

    const callArgs = {
      subsidizedToken: this._getSubsidizedToken("usdc"),
      publicClient: publicClient,
      walletClient: walletClient,
      sourceAddress: this.burnerData.eoaAddress,
      recipientAddress: args.destinationAddress,
      valueEth: args.amount.toString(),
    }

    if (args.preSendCallback) {
      return await relayPermitAndTransfer({...callArgs, preSendCallback: args.preSendCallback})
    } else {
      return await relayPermitAndTransfer({...callArgs})
    }
  }

  async _sendUSD2Giftcard(args: ISendUSD2Args) {
    if (!this.burnerData) {
      throw new Error("Missing burner data.")
    }

    const callData = {
      chain: this._getPatchedChain(),
      publicClient: this._getPublicClient(),
      eoaAccount: this._asViemAccountNoCheck(),
      smartAccountAddress: this.burnerData.address as Address,
      destinationAddress: args.destinationAddress as Address,
      amount: args.amount,
    }

    if (args.preSendCallback) {
      return await giftcardMakeUSD2Transfer({...callData, preSendCallback: args.preSendCallback})
    } else {
      return await giftcardMakeUSD2Transfer({...callData})
    }
  }

  async sendUSD2(args: ISendUSD2Args & { preSendCallback?: null | undefined }): Promise<string>;
  async sendUSD2(args: ISendUSD2Args & { preSendCallback: () => Promise<boolean> }): Promise<string | null>;

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

  async sendUSDC(args: ISendUSDCArgs & { preSendCallback?: null | undefined }): Promise<string>;
  async sendUSDC(args: ISendUSDCArgs & { preSendCallback: () => Promise<boolean> }): Promise<string | null>;

  async sendUSDC(args: ISendUSDCArgs) {
    if (!this.burnerData || !this.burnerData.graffiti) {
      throw new Error("Missing burner data.")
    }

    if (this.burnerData.graffiti.type === "wallet") {
      return await this._sendUSDCWallet(args)
    } else {
      throw new Error("Unsupported tag type: " + this.burnerData.graffiti.type)
    }
  }
}
