import {ethers} from 'ethers'
import {ERC2612ABI} from './abi/ERC2612.js'
import {Account, Hex, parseSignature, WalletClient} from 'viem'

export type TGeneratePermitTypedDataParams = {
    tokenAddress: string
    receiverContract: string
    valueEth: string
    fromAccount: string
    walletClient: WalletClient
}

export async function generatePermitTypedData(args: TGeneratePermitTypedDataParams) {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org/")
    const owner = args.fromAccount!
    const nonce = await getERC2612Nonce(args.tokenAddress, ethers.getAddress(owner), provider)
    const deadline = generateDeadline()
    const domain = await generateDomainData(args.tokenAddress, provider)
    const types = generateTypesData()
    const value = generateValue(owner, args.receiverContract, args.valueEth, nonce, deadline)

    const ethSignature = await args.walletClient.signTypedData({
        account: args.walletClient.account as Account,
        primaryType: 'Permit',
        domain,
        types,
        message: value,
    })

    const parsedSig = parseSignature(ethSignature)

    const v = 0x1b + parsedSig.yParity
    const r = parsedSig.r.replace('0x', '')
    const s = parsedSig.s.replace('0x', '')

    return {
        owner,
        receiverContract: args.receiverContract,
        valueEth: args.valueEth,
        deadline,
        v,
        r,
        s,
    }
}

async function getERC2612TokenName(tokenAddress: string, provider: ethers.JsonRpcProvider) {
    const ERC2612Contract = new ethers.Contract(tokenAddress, ERC2612ABI, provider)
    const tokenName = await ERC2612Contract.name()
    return tokenName
}

async function getChainId(provider: ethers.JsonRpcProvider) {
    const chainId = (await provider.getNetwork()).chainId
    return Number(chainId)
}

async function getERC2612Nonce(
    tokenAddress: string,
    owner: string,
    provider: ethers.JsonRpcProvider
) {
    const ERC2612Contract = new ethers.Contract(tokenAddress, ERC2612ABI, provider)
    const nonce = await ERC2612Contract.nonces(owner)
    return Number(nonce)
}

function generateDeadline() {
    return Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
}

async function generateDomainData(tokenAddress: string, provider: ethers.JsonRpcProvider) {
    return {
        name: await getERC2612TokenName(tokenAddress, provider),
        version: '1',
        chainId: await getChainId(provider),
        verifyingContract: tokenAddress as Hex,
    }
}

function generateTypesData() {
    return {
        Permit: [
            {
                name: 'owner',
                type: 'address',
            },
            {
                name: 'spender',
                type: 'address',
            },
            {
                name: 'value',
                type: 'uint256',
            },
            {
                name: 'nonce',
                type: 'uint256',
            },
            {
                name: 'deadline',
                type: 'uint256',
            },
        ],
    }
}

function generateValue(
    owner: string,
    spender: string,
    value: string,
    nonce: number,
    deadline: number
) {
    return {
        owner,
        spender,
        value,
        nonce,
        deadline,
    }
}
