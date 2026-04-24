import { describe, it, expect } from 'vitest'
import { parseArg } from '../../desktop/utils/argParser.js'

describe('parseArg', () => {
  it('returns address strings as-is', () => {
    const addr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    expect(parseArg(addr, 'address')).toBe(addr)
  })
  it('parses uint256 as BigInt', () => {
    expect(parseArg('1000000', 'uint256')).toBe(1000000n)
  })
  it('parses int128 as BigInt', () => {
    expect(parseArg('-42', 'int128')).toBe(-42n)
  })
  it('parses bool true', () => {
    expect(parseArg('true', 'bool')).toBe(true)
  })
  it('parses bool false', () => {
    expect(parseArg('false', 'bool')).toBe(false)
  })
  it('parses bool 1 as true', () => {
    expect(parseArg('1', 'bool')).toBe(true)
  })
  it('returns string as-is', () => {
    expect(parseArg('hello', 'string')).toBe('hello')
  })
  it('returns bytes32 hex as-is', () => {
    expect(parseArg('0xabc123', 'bytes32')).toBe('0xabc123')
  })
  it('splits address[] by comma', () => {
    expect(parseArg('0x1111,0x2222', 'address[]')).toEqual(['0x1111', '0x2222'])
  })
  it('splits uint256[] as BigInt array', () => {
    expect(parseArg('1,2,3', 'uint256[]')).toEqual([1n, 2n, 3n])
  })
  it('returns undefined for empty string', () => {
    expect(parseArg('', 'uint256')).toBeUndefined()
  })
})
