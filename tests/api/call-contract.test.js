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

  describe('overloaded functions', () => {
    // Two overloads: getValue(uint256) → uint256, getValue(address) → bytes32
    const OVERLOADED_ABI = [
      {
        type: 'function',
        name: 'getValue',
        inputs: [{ name: 'index', type: 'uint256' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
      },
      {
        type: 'function',
        name: 'getValue',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: '', type: 'bytes32' }],
        stateMutability: 'view',
      },
    ]

    // uint256 42 padded to 32 bytes
    const UINT256_RESPONSE = '0x000000000000000000000000000000000000000000000000000000000000002a'
    // bytes32 value
    const BYTES32_RESPONSE = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

    it('selects getValue(uint256) overload via full signature', async () => {
      stubRpc({
        eth_call: () => UINT256_RESPONSE,
        eth_chainId: () => '0x1',
      })

      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'getValue(uint256)',
        abi: OVERLOADED_ABI,
        args: ['1'],
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.decoded[0].type).toBe('uint256')
      expect(body.decoded[0].value).toBe('42')
    })

    it('selects getValue(address) overload via full signature', async () => {
      stubRpc({
        eth_call: () => BYTES32_RESPONSE,
        eth_chainId: () => '0x1',
      })

      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'getValue(address)',
        abi: OVERLOADED_ABI,
        args: [VALID_ADDRESS],
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.decoded[0].type).toBe('bytes32')
    })

    it('returns 400 when the signature matches no overload', async () => {
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'getValue(bool)',
        abi: OVERLOADED_ABI,
        args: [],
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/not found in abi/i)
    })

    it('still resolves a plain name when there is no ambiguity', async () => {
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
      expect(body.decoded[0].type).toBe('uint256')
    })
  })

  it('returns 500 when the RPC call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const reqs = Array.isArray(body) ? body : [body]
      const responses = reqs.map(req => ({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32000, message: 'execution reverted' },
      }))
      return {
        ok: true,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
        json: async () => Array.isArray(body) ? responses : responses[0],
      }
    }))
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

  describe('bytes / bytesN argument validation', () => {
    const BYTES32_ABI = [{
      type: 'function',
      name: 'verify',
      inputs: [{ name: 'hash', type: 'bytes32' }],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
    }]

    const BYTES_ABI = [{
      type: 'function',
      name: 'process',
      inputs: [{ name: 'data', type: 'bytes' }],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
    }]

    const BYTES32_ARRAY_ABI = [{
      type: 'function',
      name: 'submitProofs',
      inputs: [{ name: 'proofs', type: 'bytes32[]' }],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
    }]

    const VALID_BYTES32 = '0xb8f00eedc238b5599a1a0789f5c6388292540315cb3bbc2970596d97772e6448'
    const HEX_WITHOUT_PREFIX = 'b8f00eedc238b5599a1a0789f5c6388292540315cb3bbc2970596d97772e6448'

    it('rejects bytes32 without 0x and hints the fix when value looks like hex', async () => {
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'verify',
        abi: BYTES32_ABI,
        args: [HEX_WITHOUT_PREFIX],
      }))
      const body = await res.json()
      expect(body.error).toMatch(/missing the "0x" prefix/i)
      expect(body.error).toContain(`0x${HEX_WITHOUT_PREFIX}`)
    })

    it('rejects bytes32 without 0x with a generic error when value has non-hex chars', async () => {
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'verify',
        abi: BYTES32_ABI,
        args: ['not-a-hex-string'],
      }))
      const body = await res.json()
      expect(body.error).toMatch(/expected a "0x"-prefixed hex string/i)
    })

    it('accepts bytes32 with 0x prefix', async () => {
      stubRpc({
        eth_call: () => '0x0000000000000000000000000000000000000000000000000000000000000001',
        eth_chainId: () => '0x1',
      })
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'verify',
        abi: BYTES32_ABI,
        args: [VALID_BYTES32],
      }))
      expect(res.status).toBe(200)
    })

    it('rejects dynamic bytes without 0x and hints the fix when value looks like hex', async () => {
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'process',
        abi: BYTES_ABI,
        args: [HEX_WITHOUT_PREFIX],
      }))
      const body = await res.json()
      expect(body.error).toMatch(/missing the "0x" prefix/i)
      expect(body.error).toContain(`0x${HEX_WITHOUT_PREFIX}`)
    })

    it('accepts dynamic bytes with 0x prefix', async () => {
      stubRpc({
        eth_call: () => '0x0000000000000000000000000000000000000000000000000000000000000001',
        eth_chainId: () => '0x1',
      })
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'process',
        abi: BYTES_ABI,
        args: [VALID_BYTES32],
      }))
      expect(res.status).toBe(200)
    })

    it('rejects bytes32[] where any element is missing the 0x prefix', async () => {
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'submitProofs',
        abi: BYTES32_ARRAY_ABI,
        args: [[VALID_BYTES32, HEX_WITHOUT_PREFIX]],
      }))
      const body = await res.json()
      expect(body.error).toMatch(/missing the "0x" prefix/i)
    })

    it('accepts bytes32[] where all elements have 0x prefix', async () => {
      stubRpc({
        eth_call: () => '0x0000000000000000000000000000000000000000000000000000000000000001',
        eth_chainId: () => '0x1',
      })
      const res = await POST(makeRequest({
        chain: 'ethereum',
        address: VALID_ADDRESS,
        functionName: 'submitProofs',
        abi: BYTES32_ARRAY_ABI,
        args: [[VALID_BYTES32, VALID_BYTES32]],
      }))
      expect(res.status).toBe(200)
    })
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
