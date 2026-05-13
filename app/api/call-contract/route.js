import { NextResponse } from 'next/server'
import { createPublicClient, http, decodeFunctionResult, encodeFunctionData, defineChain } from 'viem'
import { mainnet, arbitrum, base, polygon, bsc } from 'viem/chains'
import { isValidEthAddress } from '../../utils/validation'

const CHAINS = {
  ethereum: mainnet,
  arbitrum: arbitrum,
  base: base,
  polygon: polygon,
  bsc: bsc,
}

const RPC_URLS = {
  ethereum: 'https://eth.llamarpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  base: 'https://mainnet.base.org',
  polygon: 'https://polygon-rpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { chain, address, functionName, args, abi, fromAddress, simulate, rpcUrl: customRpcUrl, blockNumber, chainId: customChainId } = body

    if (!address || !functionName || !abi) {
      return NextResponse.json(
        { error: 'Missing required parameters: address, functionName, abi' },
        { status: 400 }
      )
    }

    // Validate address format
    if (!isValidEthAddress(address)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    // Validate fromAddress if provided
    if (fromAddress && !isValidEthAddress(fromAddress)) {
      return NextResponse.json(
        { error: 'Invalid from address format' },
        { status: 400 }
      )
    }

    // Get chain config - either from built-in chains or create a custom one
    let chainConfig = CHAINS[chain]
    let rpcUrl = customRpcUrl || RPC_URLS[chain]

    // Handle custom chains (chain IDs starting with "chain-")
    if (!chainConfig && customChainId && customRpcUrl) {
      // Create a custom chain config for non-built-in chains
      chainConfig = defineChain({
        id: customChainId,
        name: chain,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [customRpcUrl] },
        },
      })
      rpcUrl = customRpcUrl
    }

    if (!chainConfig || !rpcUrl) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}. Please configure an RPC URL for this chain.` },
        { status: 400 }
      )
    }

    // Find the function in ABI — supports both plain name and full signature (e.g. "transfer(address,uint256)")
    const functionAbi = abi.find((item) => {
      if (item.type !== 'function') return false
      if (functionName.includes('(')) {
        const types = item.inputs?.map(i => i.type).join(',') || ''
        return `${item.name}(${types})` === functionName
      }
      return item.name === functionName
    })

    if (!functionAbi) {
      return NextResponse.json(
        { error: `Function ${functionName} not found in ABI` },
        { status: 400 }
      )
    }

    // Create client
    const client = createPublicClient({
      chain: chainConfig,
      transport: http(rpcUrl),
    })

    const normalizeArg = (value, type, components) => {
      if (value === undefined || value === null || value === '') return value
      if (type.startsWith('uint') || type.startsWith('int')) {
        try { return BigInt(value) } catch { return value }
      }
      if (type === 'bool') return value === 'true' || value === true
      if (type === 'bytes' || /^bytes\d+$/.test(type)) {
        if (typeof value === 'string' && value !== '' && !value.startsWith('0x')) {
          const isHexChars = /^[0-9a-fA-F]+$/.test(value)
          if (isHexChars) {
            throw new Error(`Invalid ${type}: value looks like a hex string missing the "0x" prefix. Try "0x${value}".`)
          }
          throw new Error(`Invalid ${type}: expected a "0x"-prefixed hex string.`)
        }
        return value
      }
      if (type.endsWith('[]')) {
        let arr = value
        try { arr = typeof value === 'string' ? JSON.parse(value) : value } catch { return value }
        if (!Array.isArray(arr)) return value
        const baseType = type.slice(0, -2)
        return arr.map(v => normalizeArg(v, baseType, components))
      }
      if (type === 'tuple' && components && Array.isArray(value)) {
        return value.map((v, i) => normalizeArg(v, components[i]?.type, components[i]?.components))
      }
      return value
    }

    // Parse args if they're strings that should be other types
    const parsedArgs = (args || []).map((arg, index) => {
      const input = functionAbi.inputs[index]
      if (!input) return arg
      return normalizeArg(arg, input.type, input.components)
    })

    // Encode function data
    const data = encodeFunctionData({
      abi: [functionAbi],
      functionName: functionAbi.name,
      args: parsedArgs,
    })

    // Make the call (works for both read and simulate)
    const callParams = {
      to: address,
      data,
    }

    // Add from address if provided (useful for simulating write functions)
    if (fromAddress) {
      callParams.account = fromAddress
    }

    // Add block number if provided (for historical state queries)
    if (blockNumber) {
      callParams.blockNumber = BigInt(blockNumber)
    }

    const result = await client.call(callParams)

    // Decode the result
    const decoded = decodeFunctionResult({
      abi: [functionAbi],
      functionName: functionAbi.name,
      data: result.data,
    })

    // Convert BigInt to string for JSON serialization
    const serializeResult = (value) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }
      if (Array.isArray(value)) {
        return value.map(serializeResult)
      }
      if (value && typeof value === 'object') {
        const serialized = {}
        for (const key in value) {
          serialized[key] = serializeResult(value[key])
        }
        return serialized
      }
      return value
    }

    // Build decoded output with names and types
    const outputs = functionAbi.outputs || []
    let decodedOutputs = []

    if (outputs.length === 1) {
      // Single return value
      decodedOutputs = [{
        name: outputs[0].name || 'result',
        type: outputs[0].type,
        value: serializeResult(decoded),
      }]
    } else if (outputs.length > 1) {
      // Multiple return values (tuple)
      decodedOutputs = outputs.map((output, index) => ({
        name: output.name || `output${index}`,
        type: output.type,
        value: serializeResult(Array.isArray(decoded) ? decoded[index] : decoded[output.name]),
      }))
    }

    return NextResponse.json({
      rawData: result.data,
      decoded: decodedOutputs,
      result: serializeResult(decoded),
      simulated: simulate || false,
    })
  } catch (error) {
    console.error('Call contract error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to call contract' },
      { status: 500 }
    )
  }
}
