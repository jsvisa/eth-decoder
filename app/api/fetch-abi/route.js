import { NextResponse } from 'next/server'

// Etherscan V2 API uses chain IDs
const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
}

const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    const chain = searchParams.get('chain') || 'ethereum'

    if (!address) {
      return NextResponse.json(
        { error: 'Missing address parameter' },
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

    const chainId = CHAIN_IDS[chain]
    if (!chainId) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
        { status: 400 }
      )
    }

    const apiKey = process.env.ETHERSCAN_API_KEY || ''

    const params = new URLSearchParams({
      chainid: chainId,
      module: 'contract',
      action: 'getabi',
      address: address,
      apikey: apiKey,
    })

    const response = await fetch(`${ETHERSCAN_V2_API}?${params}`)

    if (!response.ok) {
      throw new Error(`Explorer API returned ${response.status}`)
    }

    const data = await response.json()

    if (data.status !== '1') {
      return NextResponse.json(
        { error: data.result || 'Failed to fetch ABI' },
        { status: 400 }
      )
    }

    // Parse ABI JSON string
    const abi = JSON.parse(data.result)

    return NextResponse.json({ abi })
  } catch (error) {
    console.error('Fetch ABI error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ABI' },
      { status: 500 }
    )
  }
}
