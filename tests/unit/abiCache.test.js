import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAbiCacheKey,
  getCachedAbi,
  setCachedAbi,
  buildAbiCacheFromStorage,
} from '../../app/utils/abiCache.js'

// jsdom provides localStorage. Clear between tests.
beforeEach(() => {
  localStorage.clear()
})

describe('getAbiCacheKey', () => {
  it('produces the correct abi-{chain}-{address} format', () => {
    expect(getAbiCacheKey('ethereum', '0xAbCd')).toBe('abi-ethereum-0xabcd')
  })

  it('lowercases the address', () => {
    expect(getAbiCacheKey('base', '0xDEADBEEF')).toBe('abi-base-0xdeadbeef')
  })
})

describe('setCachedAbi / getCachedAbi', () => {
  const abi = [{ type: 'function', name: 'transfer' }]

  it('round-trips ABI through localStorage', () => {
    setCachedAbi('ethereum', '0x1234', abi)
    const result = getCachedAbi('ethereum', '0x1234')
    expect(result.abi).toEqual(abi)
  })

  it('stores proxy metadata fields', () => {
    setCachedAbi('base', '0xabcd', abi, true, '0ximpl', 'Proxy', 'Implementation')
    const result = getCachedAbi('base', '0xabcd')
    expect(result.isProxy).toBe(true)
    expect(result.implAddress).toBe('0ximpl')
    expect(result.contractName).toBe('Proxy')
    expect(result.implContractName).toBe('Implementation')
  })

  it('stores a timestamp', () => {
    const before = Date.now()
    setCachedAbi('ethereum', '0x1234', abi)
    const result = getCachedAbi('ethereum', '0x1234')
    expect(result.timestamp).toBeGreaterThanOrEqual(before)
  })

  it('returns null for a missing key', () => {
    expect(getCachedAbi('ethereum', '0xunknown')).toBeNull()
  })
})

describe('buildAbiCacheFromStorage', () => {
  const abi = [{ type: 'function', name: 'balanceOf' }]

  it('returns only entries for the requested chain with their ABI', () => {
    setCachedAbi('ethereum', '0x1111111111111111111111111111111111111111', abi)
    setCachedAbi('base', '0x2222222222222222222222222222222222222222', abi)
    const cache = buildAbiCacheFromStorage('ethereum')
    expect(cache.has('0x1111111111111111111111111111111111111111')).toBe(true)
    expect(cache.get('0x1111111111111111111111111111111111111111')).toEqual(abi)
    expect(cache.has('0x2222222222222222222222222222222222222222')).toBe(false)
  })

  it('returns an empty Map when no entries exist for the chain', () => {
    expect(buildAbiCacheFromStorage('polygon').size).toBe(0)
  })

  it('does not throw on malformed JSON entries', () => {
    localStorage.setItem('abi-ethereum-0xbad', 'not-valid-json{{{')
    expect(() => buildAbiCacheFromStorage('ethereum')).not.toThrow()
  })
})
