import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '../../app/api/decode/route.js'

function makeRequest(params) {
  const url = new URL('http://localhost/api/decode')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }
  return { url: url.toString() }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  delete process.env.BACKEND_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/decode', () => {
  it('returns 400 when the data param is missing', async () => {
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing data/i)
  })

  it('returns 500 when BACKEND_URL env var is not set', async () => {
    const res = await GET(makeRequest({ data: '0x12345678' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/backend url/i)
  })

  it('forwards data, multicall, with_abi, with_sign params to the backend', async () => {
    process.env.BACKEND_URL = 'https://backend.test'
    const mockResult = { function: 'transfer', params: [] }
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    })

    const res = await GET(makeRequest({
      data: '0x12345678',
      multicall: 'true',
      with_abi: 'true',
      with_sign: 'false',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(mockResult)

    const calledUrl = global.fetch.mock.calls[0][0]
    expect(calledUrl).toContain('data=0x12345678')
    expect(calledUrl).toContain('multicall=true')
    expect(calledUrl).toContain('with_abi=true')
    expect(calledUrl).toContain('with_sign=false')
  })

  it('returns 500 with an error message when the backend returns a non-OK status', async () => {
    process.env.BACKEND_URL = 'https://backend.test'
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })

    const res = await GET(makeRequest({ data: '0x12345678' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)
  })
})
