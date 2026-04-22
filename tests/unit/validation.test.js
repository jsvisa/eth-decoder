import { describe, it, expect } from 'vitest'
import {
  isValidEthAddress,
  isValidForkBlock,
  isValidNumber,
  isValidPositiveInteger,
} from '../../app/utils/validation.js'

describe('isValidEthAddress', () => {
  it('accepts a valid lowercase address', () => {
    expect(isValidEthAddress('0xabcdef1234567890abcdef1234567890abcdef12')).toBe(true)
  })

  it('accepts a checksummed address', () => {
    expect(isValidEthAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(true)
  })

  it('rejects an address missing the 0x prefix', () => {
    expect(isValidEthAddress('abcdef1234567890abcdef1234567890abcdef12')).toBe(false)
  })

  it('rejects an address that is too short', () => {
    expect(isValidEthAddress('0x1234')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidEthAddress('')).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidEthAddress(null)).toBe(false)
  })
})

describe('isValidForkBlock', () => {
  it('accepts an empty string (means latest)', () => {
    expect(isValidForkBlock('')).toBe(true)
  })

  it('accepts null and undefined', () => {
    expect(isValidForkBlock(null)).toBe(true)
    expect(isValidForkBlock(undefined)).toBe(true)
  })

  it('accepts "latest" (case-insensitive)', () => {
    expect(isValidForkBlock('latest')).toBe(true)
    expect(isValidForkBlock('LATEST')).toBe(true)
  })

  it('accepts a positive integer string', () => {
    expect(isValidForkBlock('12345678')).toBe(true)
  })

  it('rejects a negative number string', () => {
    expect(isValidForkBlock('-1')).toBe(false)
  })

  it('rejects a non-numeric string', () => {
    expect(isValidForkBlock('abc')).toBe(false)
  })
})

describe('isValidNumber', () => {
  it('accepts an empty string', () => {
    expect(isValidNumber('')).toBe(true)
  })

  it('accepts an integer string', () => {
    expect(isValidNumber('42')).toBe(true)
  })

  it('accepts a decimal string', () => {
    expect(isValidNumber('3.14')).toBe(true)
  })

  it('accepts a negative number string', () => {
    expect(isValidNumber('-7.5')).toBe(true)
  })

  it('rejects a non-numeric string', () => {
    expect(isValidNumber('abc')).toBe(false)
  })
})

describe('isValidPositiveInteger', () => {
  it('accepts an empty string', () => {
    expect(isValidPositiveInteger('')).toBe(true)
  })

  it('accepts a positive integer string', () => {
    expect(isValidPositiveInteger('100')).toBe(true)
  })

  it('rejects a negative string', () => {
    expect(isValidPositiveInteger('-1')).toBe(false)
  })

  it('rejects a decimal string', () => {
    expect(isValidPositiveInteger('1.5')).toBe(false)
  })

  it('rejects a non-numeric string', () => {
    expect(isValidPositiveInteger('abc')).toBe(false)
  })
})
