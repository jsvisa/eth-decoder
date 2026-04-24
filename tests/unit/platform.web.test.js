import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

describe('platform (web) — decode', () => {
  it('calls /api/decode with the data param', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ msg: 'ok', data: [] }),
    }))
    const { decode } = await import('../../app/utils/platform.js')
    await decode('0xb82e16e3')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/decode'))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data=0xb82e16e3'))
  })

  it('passes multicall, with_abi, with_sign as query params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ msg: 'ok', data: [] }),
    }))
    const { decode } = await import('../../app/utils/platform.js')
    await decode('0xb82e16e3', { multicall: true, withAbi: true, withSign: true })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('multicall=true')
    expect(url).toContain('with_abi=true')
    expect(url).toContain('with_sign=true')
  })

  it('forwards the default count=3 param to the URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ msg: 'ok', data: [] }),
    }))
    const { decode } = await import('../../app/utils/platform.js')
    await decode('0xb82e16e3')
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('count=3')
  })
})

describe('platform (web) — fetchAbi', () => {
  it('calls /api/fetch-abi with address, chain, apiKey', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ abi: [] }),
    }))
    const { fetchAbi } = await import('../../app/utils/platform.js')
    await fetchAbi('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum', 'key123')
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('/api/fetch-abi')
    expect(url).toContain('address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    expect(url).toContain('chain=ethereum')
    expect(url).toContain('apiKey=key123')
  })

  it('does not add apiKey to the URL when not provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ abi: [] }),
    }))
    const { fetchAbi } = await import('../../app/utils/platform.js')
    await fetchAbi('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum')
    const url = fetch.mock.calls[0][0]
    expect(url).not.toContain('apiKey')
  })
})

describe('platform (web) — callContract', () => {
  it('POSTs to /api/call-contract with the request body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0x' }),
    }))
    const { callContract } = await import('../../app/utils/platform.js')
    const body = { chain: 'ethereum', address: '0x1234', functionName: 'totalSupply', args: [], abi: [] }
    await callContract(body)
    expect(fetch).toHaveBeenCalledWith('/api/call-contract', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
  })
})

describe('platform (web) — simulate', () => {
  it('POSTs to /api/simulate with the request body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ simulated: true }),
    }))
    const { simulate } = await import('../../app/utils/platform.js')
    const body = { chain: 'ethereum', address: '0x1234' }
    await simulate(body)
    expect(fetch).toHaveBeenCalledWith('/api/simulate', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
  })
})

describe('platform (web) — getLogs', () => {
  it('calls /api/get-logs with serialized params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [] }),
    }))
    const { getLogs } = await import('../../app/utils/platform.js')
    await getLogs({ address: '0x1234', fromBlock: '1000', toBlock: 'latest' })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('/api/get-logs')
    expect(url).toContain('address=0x1234')
    expect(url).toContain('fromBlock=1000')
    expect(url).toContain('toBlock=latest')
  })
})
