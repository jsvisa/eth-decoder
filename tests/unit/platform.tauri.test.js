import { describe, it, expect, vi, afterEach } from 'vitest'

// Mock @tauri-apps/api/core BEFORE any imports that use it
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('platform (tauri) — decode', () => {
  it('calls invoke lookup_abi with the 4-byte selector', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValue([]) // no ABI found
    const { decode } = await import('../../desktop/platform.js')
    const result = await decode('0xb82e16e3aabbccdd')
    expect(invoke).toHaveBeenCalledWith('lookup_abi', {
      byte_sign: '0xb82e16e3',
      count: 3,
    })
    expect(result).toEqual({ msg: 'ok', data: [] })
  })

  it('returns decoded result when ABI is found', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValue([{
      text_sign: 'getAdapters()',
      abi: JSON.stringify({
        name: 'getAdapters',
        type: 'function',
        inputs: [],
        outputs: [],
        stateMutability: 'view',
      }),
      score: 1,
    }])
    const { decode } = await import('../../desktop/platform.js')
    const result = await decode('0xb82e16e3')
    expect(result.msg).toBe('ok')
    expect(result.data[0].func).toBe('getAdapters()')
    expect(result.data[0].args).toEqual({})
  })

  it('returns ok with empty data when selector is unknown', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValue([])
    const { decode } = await import('../../desktop/platform.js')
    const result = await decode('0xdeadbeef')
    expect(result).toEqual({ msg: 'ok', data: [] })
  })
})

describe('platform (tauri) — fetchAbi', () => {
  it('calls Etherscan V2 API directly with chainid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '1',
        result: [{ ABI: '[]', ContractName: 'TestContract', Implementation: '' }],
      }),
    }))
    const { fetchAbi } = await import('../../desktop/platform.js')
    await fetchAbi('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum', 'mykey')
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('api.etherscan.io')
    expect(url).toContain('chainid=1')
    expect(url).toContain('getsourcecode')
  })

  it('returns abi array and contract name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '1',
        result: [{ ABI: '[{"name":"balanceOf"}]', ContractName: 'USDC', Implementation: '' }],
      }),
    }))
    const { fetchAbi } = await import('../../desktop/platform.js')
    const result = await fetchAbi('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum', 'mykey')
    expect(result.name).toBe('USDC')
    expect(Array.isArray(result.abi)).toBe(true)
  })
})

describe('platform (tauri) — getLogs', () => {
  it('calls Etherscan V2 directly with getLogs action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: [] }),
    }))
    const { getLogs } = await import('../../desktop/platform.js')
    await getLogs({ address: '0x1234', fromBlock: '0', toBlock: 'latest', chainId: 1, apiKey: 'k' })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('api.etherscan.io')
    expect(url).toContain('getLogs')
    expect(url).toContain('chainid=1')
  })
})
