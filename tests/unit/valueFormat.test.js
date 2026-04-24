import { describe, it, expect } from 'vitest'
import { valueColorClass, formatNumericHint, shortenAddress } from '../../desktop/utils/valueFormat.js'

describe('valueColorClass', () => {
  it('returns colorAddress for address type', () => {
    expect(valueColorClass('address')).toBe('colorAddress')
  })
  it('returns colorUint for uint256', () => {
    expect(valueColorClass('uint256')).toBe('colorUint')
  })
  it('returns colorUint for int128', () => {
    expect(valueColorClass('int128')).toBe('colorUint')
  })
  it('returns colorBool for bool', () => {
    expect(valueColorClass('bool')).toBe('colorBool')
  })
  it('returns colorDefault for string and bytes', () => {
    expect(valueColorClass('string')).toBe('colorDefault')
    expect(valueColorClass('bytes32')).toBe('colorDefault')
  })
})

describe('formatNumericHint', () => {
  it('returns ETH hint for values >= 1e18', () => {
    expect(formatNumericHint('1000000000000000000', 'uint256')).toBe('1.0 ETH')
  })
  it('returns null for non-numeric types', () => {
    expect(formatNumericHint('hello', 'string')).toBeNull()
  })
  it('returns null for small values', () => {
    expect(formatNumericHint('1000', 'uint256')).toBeNull()
  })
  it('returns null for address type', () => {
    expect(formatNumericHint('123', 'address')).toBeNull()
  })
})

describe('shortenAddress', () => {
  it('shortens a full address to first6…last4', () => {
    expect(shortenAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe('0xA0b8…eB48')
  })
  it('returns short strings unchanged', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234')
  })
  it('returns empty string for falsy input', () => {
    expect(shortenAddress('')).toBe('')
  })
})
