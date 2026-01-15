import { NextResponse } from 'next/server'
import { createPublicClient, http, decodeFunctionResult, encodeFunctionData } from 'viem'
import { mainnet, arbitrum, base, polygon, bsc } from 'viem/chains'

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
    const { chain, address, functionName, args, abi } = body

    if (!address || !functionName || !abi) {
      return NextResponse.json(
        { error: 'Missing required parameters: address, functionName, abi' },
        { status: 400 }
      )
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    const chainConfig = CHAINS[chain]
    const rpcUrl = RPC_URLS[chain]

    if (!chainConfig || !rpcUrl) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
        { status: 400 }
      )
    }

    // Find the function in ABI
    const functionAbi = abi.find(
      (item) => item.type === 'function' && item.name === functionName
    )

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

    // Parse args if they're strings that should be other types
    const parsedArgs = (args || []).map((arg, index) => {
      const input = functionAbi.inputs[index]
      if (!input) return arg

      // Handle different types
      if (input.type.startsWith('uint') || input.type.startsWith('int')) {
        // Convert to BigInt for integer types
        try {
          return BigInt(arg)
        } catch {
          return arg
        }
      }
      if (input.type === 'bool') {
        return arg === 'true' || arg === true
      }
      if (input.type.endsWith('[]')) {
        // Array type - try to parse as JSON
        try {
          return typeof arg === 'string' ? JSON.parse(arg) : arg
        } catch {
          return arg
        }
      }
      return arg
    })

    // Encode function data
    const data = encodeFunctionData({
      abi: [functionAbi],
      functionName,
      args: parsedArgs,
    })

    // Make the call
    const result = await client.call({
      to: address,
      data,
    })

    // Decode the result
    const decoded = decodeFunctionResult({
      abi: [functionAbi],
      functionName,
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

    return NextResponse.json({
      result: serializeResult(decoded),
      outputs: functionAbi.outputs,
    })
  } catch (error) {
    console.error('Call contract error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to call contract' },
      { status: 500 }
    )
  }
}
