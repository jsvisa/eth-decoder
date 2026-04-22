import { describe, it, expect, vi, afterEach } from 'vitest'
import { POST } from '../../app/api/call-contract/route.js'

const VALID_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

const BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
]

function makeRequest(body) {
  return { json: async () => body }
}

// Stub global.fetch to respond to JSON-RPC requests from viem.
// Viem may send a single object or a batched array; this handles both.
// The mock response includes a headers object with a .get() method because
// viem's HTTP transport checks Content-Type before deciding how to parse the body.
function stubRpc(methodHandlers) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body)
    const reqs = Array.isArray(body) ? body : [body]
    const responses = reqs.map(req => {
      const handler = methodHandlers[req.method]
      if (handler) return { jsonrpc: '2.0', id: req.id, result: handler(req) }
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }
    })
    const responseData = Array.isArray(body) ? responses : responses[0]
    return {
      ok: true,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => responseData,
    }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/call-contract', () => {
  it('returns 400 when required params are missing', async () => {
    const res = await POST(makeRequest({ chain: 'ethereum' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing required/i)
  })

  it('returns 400 when address format is invalid', async () => {
    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: 'not-an-address',
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid address/i)
  })

  it('returns 400 when the chain is not supported and no custom chainId/rpcUrl provided', async () => {
    const res = await POST(makeRequest({
      chain: 'unsupported-chain-xyz',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unsupported chain/i)
  })

  it('returns 400 when the function name is not found in the ABI', async () => {
    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: VALID_ADDRESS,
      functionName: 'nonExistentFunction',
      abi: BALANCE_OF_ABI,
      args: [],
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not found in abi/i)
  })

  it('returns 500 when the RPC call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('resolves a built-in chain by name and returns a decoded result', async () => {
    // uint256 1000000 (0xF4240) padded to 32 bytes
    stubRpc({
      eth_call: () => '0x00000000000000000000000000000000000000000000000000000000000f4240',
      eth_chainId: () => '0x1',
    })

    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decoded).toHaveLength(1)
    expect(body.decoded[0].type).toBe('uint256')
    // BigInts are serialized to strings by the route
    expect(body.decoded[0].value).toBe('1000000')
  })

  it('resolves a custom chain by numeric chainId and rpcUrl', async () => {
    stubRpc({
      eth_call: () => '0x00000000000000000000000000000000000000000000000000000000000f4240',
      eth_chainId: () => '0x64',
    })

    const res = await POST(makeRequest({
      chain: 'custom-gnosis',
      chainId: 100,
      rpcUrl: 'https://rpc.gnosis.gateway.fm',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decoded[0].value).toBe('1000000')
  })
})
