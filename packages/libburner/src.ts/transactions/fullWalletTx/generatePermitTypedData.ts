import {ERC2612ABI} from './abi/ERC2612.js'
import {Account, Address, getAddress, Hex, parseSignature, PublicClient, WalletClient} from 'viem'

export type TGeneratePermitTypedDataParams = {
  tokenAddress: Address
  receiverContract: Address
  valueEth: string
  fromAccount: Address
  publicClient: PublicClient
  walletClient: WalletClient
}

export async function generatePermitTypedData(args: TGeneratePermitTypedDataParams) {
  const owner = args.fromAccount!
  const nonce = await getERC2612Nonce(args.tokenAddress, getAddress(owner), args.publicClient)
  const deadline = generateDeadline()
  const domain = await generateDomainData(args.tokenAddress, args.publicClient)
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

async function getERC2612TokenName(tokenAddress: Address, publicClient: PublicClient) {
  return await publicClient.readContract({
    address: tokenAddress,
    abi: ERC2612ABI,
    functionName: 'name',
    args: []
  }) as string
}

async function getChainId(publicClient: PublicClient) {
  return Number(publicClient.chain!.id)
}

async function getERC2612Nonce(
  tokenAddress: Address,
  owner: Address,
  publicClient: PublicClient
) {
  const nonce = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC2612ABI,
    functionName: 'nonces',
    args: [owner]
  })

  return Number(nonce)
}

function generateDeadline() {
  return Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
}

async function generateDomainData(tokenAddress: Address, publicClient: PublicClient) {
  return {
    name: await getERC2612TokenName(tokenAddress, publicClient),
    version: '1',
    chainId: await getChainId(publicClient),
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
