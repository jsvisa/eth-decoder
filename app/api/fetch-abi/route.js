import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { mainnet, arbitrum, base, polygon, bsc } from 'viem/chains'

// Etherscan V2 API uses chain IDs
const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
}

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

const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api'

// EIP-1967 implementation slot
const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
// EIP-1967 beacon slot
const EIP1967_BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'
// OpenZeppelin legacy implementation slot
const OZ_IMPL_SLOT = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3'

// Fetch ABI and contract name from Etherscan
async function fetchContractInfo(address, chainId, apiKey) {
  const params = new URLSearchParams({
    chainid: chainId,
    module: 'contract',
    action: 'getsourcecode',
    address: address,
    apikey: apiKey,
  })

  const response = await fetch(`${ETHERSCAN_V2_API}?${params}`)

  if (!response.ok) {
    throw new Error(`Explorer API returned ${response.status}`)
  }

  const data = await response.json()

  if (data.status !== '1' || !data.result || !data.result[0]) {
    return null
  }

  const result = data.result[0]
  const abi = result.ABI && result.ABI !== 'Contract source code not verified'
    ? JSON.parse(result.ABI)
    : null

  return {
    abi,
    contractName: result.ContractName || null,
  }
}

// Get implementation address from proxy
async function getImplementationAddress(client, proxyAddress) {
  // Try EIP-1967 implementation slot first
  try {
    const implSlotData = await client.getStorageAt({
      address: proxyAddress,
      slot: EIP1967_IMPL_SLOT,
    })

    if (implSlotData && implSlotData !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      const implAddress = '0x' + implSlotData.slice(-40)
      if (implAddress !== '0x0000000000000000000000000000000000000000') {
        return implAddress
      }
    }
  } catch (e) {
    // Ignore and try next slot
  }

  // Try beacon slot
  try {
    const beaconSlotData = await client.getStorageAt({
      address: proxyAddress,
      slot: EIP1967_BEACON_SLOT,
    })

    if (beaconSlotData && beaconSlotData !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      const beaconAddress = '0x' + beaconSlotData.slice(-40)
      if (beaconAddress !== '0x0000000000000000000000000000000000000000') {
        // Call implementation() on the beacon
        try {
          const implData = await client.call({
            to: beaconAddress,
            data: '0x5c60da1b', // implementation()
          })
          if (implData.data && implData.data.length >= 66) {
            return '0x' + implData.data.slice(-40)
          }
        } catch (e) {
          // Beacon call failed
        }
      }
    }
  } catch (e) {
    // Ignore and try next slot
  }

  // Try OpenZeppelin legacy slot
  try {
    const ozSlotData = await client.getStorageAt({
      address: proxyAddress,
      slot: OZ_IMPL_SLOT,
    })

    if (ozSlotData && ozSlotData !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      const implAddress = '0x' + ozSlotData.slice(-40)
      if (implAddress !== '0x0000000000000000000000000000000000000000') {
        return implAddress
      }
    }
  } catch (e) {
    // Ignore
  }

  return null
}

// Merge two ABIs, preferring items from the second ABI for duplicates
function mergeAbis(proxyAbi, implAbi) {
  const seen = new Map()

  // Helper to create a unique key for ABI items
  const getKey = (item) => {
    if (item.type === 'function') {
      return `function:${item.name}`
    }
    if (item.type === 'event') {
      return `event:${item.name}`
    }
    if (item.type === 'error') {
      return `error:${item.name}`
    }
    return `${item.type}:${item.name || ''}`
  }

  // Add implementation ABI items first (they take priority)
  for (const item of implAbi) {
    const key = getKey(item)
    seen.set(key, item)
  }

  // Add proxy ABI items (only if not already present)
  for (const item of proxyAbi) {
    const key = getKey(item)
    if (!seen.has(key)) {
      seen.set(key, item)
    }
  }

  return Array.from(seen.values())
}

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
    const chainConfig = CHAINS[chain]
    const rpcUrl = RPC_URLS[chain]

    if (!chainId || !chainConfig) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
        { status: 400 }
      )
    }

    // Get API key from query param (user-provided) or fall back to env var
    const apiKey = searchParams.get('apiKey') || process.env.ETHERSCAN_API_KEY || ''

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Etherscan API key not configured. Please add your API key in Settings.' },
        { status: 400 }
      )
    }

    // Fetch the contract's ABI and name
    const proxyInfo = await fetchContractInfo(address, chainId, apiKey)

    if (!proxyInfo || !proxyInfo.abi) {
      return NextResponse.json(
        { error: 'Failed to fetch ABI. Contract may not be verified.' },
        { status: 400 }
      )
    }

    // Create RPC client to check for proxy
    const client = createPublicClient({
      chain: chainConfig,
      transport: http(rpcUrl),
    })

    // Check if this is a proxy contract
    const implAddress = await getImplementationAddress(client, address)

    if (implAddress) {
      // It's a proxy! Fetch implementation ABI and merge
      const implInfo = await fetchContractInfo(implAddress, chainId, apiKey)

      if (implInfo && implInfo.abi) {
        const mergedAbi = mergeAbis(proxyInfo.abi, implInfo.abi)
        return NextResponse.json({
          abi: mergedAbi,
          contractName: proxyInfo.contractName,
          implContractName: implInfo.contractName,
          isProxy: true,
          implAddress: implAddress,
        })
      }
    }

    // Not a proxy or couldn't fetch implementation ABI
    return NextResponse.json({
      abi: proxyInfo.abi,
      contractName: proxyInfo.contractName,
      isProxy: false,
    })
  } catch (error) {
    console.error('Fetch ABI error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ABI' },
      { status: 500 }
    )
  }
}
