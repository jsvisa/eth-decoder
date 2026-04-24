import { invoke } from '@tauri-apps/api/core'
import { decodeFunctionCalldata } from '@app/utils/decoder.js'

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api'

const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
}

// ---------------------------------------------------------------------------
// decode — SQLite lookup + viem ABI decoding (no network needed)
// ---------------------------------------------------------------------------
export async function decode(data, { count = 3, withAbi = false, withSign = false } = {}) {
  if (!data.startsWith('0x')) data = '0x' + data
  const selector = data.slice(0, 10)

  const candidates = await invoke('lookup_abi', { byte_sign: selector, count })

  const errors = []
  for (const entry of candidates) {
    const abi = entry.abi ? JSON.parse(entry.abi) : null
    if (!abi) continue
    try {
      const decoded = decodeFunctionCalldata(abi, data)
      const item = { func: decoded.func, args: decoded.args }
      if (withSign) item.sign = selector
      if (withAbi) item.abi = abi
      return { msg: 'ok', data: [item] }
    } catch (err) {
      errors.push({ error: err.message, abi })
    }
  }

  if (candidates.length === 0) return { msg: 'ok', data: [] }
  return { msg: 'error', error: errors }
}

// ---------------------------------------------------------------------------
// fetchAbi — Etherscan V2 + Sourcify + EIP-1967 proxy detection (direct JS)
// ---------------------------------------------------------------------------
export async function fetchAbi(address, chain, apiKey, { rpcUrl, chainId, detectProxy } = {}) {
  const resolvedChainId = chainId || CHAIN_IDS[chain]

  const params = new URLSearchParams({
    chainid: resolvedChainId,
    module: 'contract',
    action: 'getsourcecode',
    address,
  })
  if (apiKey) params.set('apikey', apiKey)

  const res = await fetch(`${ETHERSCAN_V2}?${params}`)
  if (!res.ok) throw new Error(`Etherscan request failed: ${res.status}`)
  const json = await res.json()

  if (json.status === '1' && json.result?.[0]?.ABI !== 'Contract source code not verified') {
    const info = json.result[0]
    const abi = JSON.parse(info.ABI)
    const name = info.ContractName

    // Proxy detection: if detectProxy is true or if there's an Implementation address
    if (detectProxy !== false && info.Implementation) {
      try {
        const implResult = await fetchAbi(info.Implementation, chain, apiKey, { chainId: resolvedChainId, detectProxy: false })
        if (implResult.abi?.length > 0) {
          const names = new Set(abi.map(item => item.name))
          const merged = [...abi, ...implResult.abi.filter(item => !names.has(item.name))]
          return { abi: merged, name, proxyImplementation: info.Implementation }
        }
      } catch { /* fallback to proxy ABI if impl fetch fails */ }
    }

    return { abi, name }
  }

  // Fallback to Sourcify
  const sourcifyRes = await fetch(
    `https://repo.sourcify.dev/contracts/full_match/${resolvedChainId}/${address}/metadata.json`
  )
  if (sourcifyRes.ok) {
    const meta = await sourcifyRes.json()
    return {
      abi: meta.output.abi,
      name: Object.keys(meta.settings?.compilationTarget || {})[0] || 'Unknown',
    }
  }

  throw new Error('Contract ABI not found on Etherscan or Sourcify')
}

// ---------------------------------------------------------------------------
// callContract — viem readContract (direct RPC, no proxy needed)
// ---------------------------------------------------------------------------
export async function callContract(body) {
  const { createPublicClient, http, defineChain } = await import('viem')
  const { mainnet, arbitrum, base, polygon, bsc } = await import('viem/chains')

  const VIEM_CHAINS = { ethereum: mainnet, arbitrum, base, polygon, bsc }

  const chain = body.chainId
    ? defineChain({
        id: body.chainId,
        name: body.chain || 'custom',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [body.rpcUrl] } },
      })
    : VIEM_CHAINS[body.chain]

  const client = createPublicClient({
    chain,
    transport: http(body.rpcUrl || undefined),
  })

  const result = await client.readContract({
    address: body.address,
    abi: body.abi,
    functionName: body.functionName,
    args: body.args || [],
    blockNumber: body.blockNumber ? BigInt(body.blockNumber) : undefined,
  })

  // Serialize BigInt values for JSON transfer
  return JSON.parse(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// ---------------------------------------------------------------------------
// simulate — Tenderly (direct, same as web app)
// ---------------------------------------------------------------------------
export async function simulate(body) {
  const url = `https://api.tenderly.co/api/v1/account/${body.tenderlyAccount}/project/${body.tenderlyProject}/simulate`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Key': body.tenderlyAccessKey,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tenderly simulation failed: ${res.status} ${res.statusText}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// getLogs — Etherscan V2 (direct)
// ---------------------------------------------------------------------------
export async function getLogs({ address, fromBlock, toBlock, topic0, chainId, apiKey }) {
  const params = new URLSearchParams({
    chainid: chainId,
    module: 'logs',
    action: 'getLogs',
    fromBlock: fromBlock || '0',
    toBlock: toBlock || 'latest',
  })
  if (address) params.set('address', address)
  if (topic0) params.set('topic0', topic0)
  if (apiKey) params.set('apikey', apiKey)

  const res = await fetch(`${ETHERSCAN_V2}?${params}`)
  if (!res.ok) throw new Error(`Get logs failed: ${res.status} ${res.statusText}`)
  return res.json()
}
