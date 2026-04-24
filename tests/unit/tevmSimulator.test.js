import { describe, it, expect } from 'vitest'
import { decodeRevertData } from '../../app/utils/tevmSimulator.js'

// Pre-encoded revert payloads (selector + ABI-encoded args).
// Generated with viem: keccak256(sig).slice(0,10) + encodeAbiParameters(...)
const HEX = {
  // Error("Ownable: caller is not the owner")
  errorString:
    '0x08c379a0' +
    '0000000000000000000000000000000000000000000000000000000000000020' +
    '0000000000000000000000000000000000000000000000000000000000000020' +
    '4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572',

  // Panic(1) — assert failed
  panic1: '0x4e487b71' + '0000000000000000000000000000000000000000000000000000000000000001',

  // Panic(17) — arithmetic overflow/underflow
  panic17: '0x4e487b71' + '0000000000000000000000000000000000000000000000000000000000000011',

  // Unauthorized() — zero-arg custom error
  unauthorized: '0x82b42900',

  // OwnableUnauthorizedAccount(address)
  ownableUnauthorized:
    '0x118cdaa7' +
    '0000000000000000000000001234567890123456789012345678901234567890',
}

const OWNABLE_UNAUTHORIZED_ABI = [
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [{ name: 'account', type: 'address' }],
  },
]

const UNAUTHORIZED_ABI = [
  { type: 'error', name: 'Unauthorized', inputs: [] },
]

describe('decodeRevertData', () => {
  describe('Error(string)', () => {
    it('decodes a standard require revert message', () => {
      expect(decodeRevertData(HEX.errorString)).toBe('Ownable: caller is not the owner')
    })

    it('does not need the ABI for Error(string)', () => {
      expect(decodeRevertData(HEX.errorString, [])).toBe('Ownable: caller is not the owner')
    })
  })

  describe('Panic(uint256)', () => {
    it('decodes Panic(1) as assert failed', () => {
      expect(decodeRevertData(HEX.panic1)).toBe('Panic: assert failed')
    })

    it('decodes Panic(17) as arithmetic overflow/underflow', () => {
      expect(decodeRevertData(HEX.panic17)).toBe('Panic: arithmetic overflow/underflow')
    })
  })

  describe('custom errors', () => {
    it('decodes a zero-arg custom error by name', () => {
      expect(decodeRevertData(HEX.unauthorized, UNAUTHORIZED_ABI)).toBe('Unauthorized')
    })

    it('decodes a custom error with an address argument', () => {
      expect(decodeRevertData(HEX.ownableUnauthorized, OWNABLE_UNAUTHORIZED_ABI)).toBe(
        'OwnableUnauthorizedAccount(0x1234567890123456789012345678901234567890)'
      )
    })

    it('returns null for an unknown custom error selector without ABI', () => {
      expect(decodeRevertData(HEX.ownableUnauthorized, [])).toBeNull()
    })

    it('returns null for an unknown custom error selector with wrong ABI', () => {
      expect(decodeRevertData(HEX.ownableUnauthorized, UNAUTHORIZED_ABI)).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(decodeRevertData(null)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(decodeRevertData('')).toBeNull()
    })

    it('returns null for bare 0x', () => {
      expect(decodeRevertData('0x')).toBeNull()
    })

    it('returns null for data shorter than 4 bytes', () => {
      expect(decodeRevertData('0x08c379')).toBeNull()
    })
  })
})
