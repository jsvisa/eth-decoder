export class ArgValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ArgValidationError'
  }
}

// Recursively normalize a single ABI argument value to the type viem expects.
export function normalizeArg(value, type, components) {
  if (value === undefined || value === null || value === '') return value

  if (type.startsWith('uint') || type.startsWith('int')) {
    try { return BigInt(value) } catch { return value }
  }

  if (type === 'bool') return value === 'true' || value === true

  // bytes / bytesN: require 0x-prefixed hex.
  // The regex /^bytes\d+$/ matches bytes32, bytes16, etc. but NOT bytes32[] or
  // bytes32[N] because $ anchors before the brackets — array types reach the
  // branch below correctly.
  if (type === 'bytes' || /^bytes\d+$/.test(type)) {
    if (typeof value === 'string' && value !== '' && !value.startsWith('0x')) {
      const isHexChars = /^[0-9a-fA-F]+$/.test(value)
      if (isHexChars) {
        throw new ArgValidationError(
          `Invalid ${type}: value looks like a hex string missing the "0x" prefix. Try "0x${value}".`
        )
      }
      throw new ArgValidationError(`Invalid ${type}: expected a "0x"-prefixed hex string.`)
    }
    return value
  }

  // Dynamic arrays (type[]) and fixed-size arrays (type[N]) — strips the
  // outermost bracket pair and recurses, so bytes32[6] is handled the same as
  // bytes32[].
  const arrayMatch = type.match(/^(.+)\[(\d*)\]$/)
  if (arrayMatch) {
    const baseType = arrayMatch[1]
    let arr = value
    try { arr = typeof value === 'string' ? JSON.parse(value) : value } catch { return value }
    if (!Array.isArray(arr)) return value
    return arr.map(v => normalizeArg(v, baseType, components))
  }

  if (type === 'tuple' && components && Array.isArray(value)) {
    return value.map((v, i) => normalizeArg(v, components[i]?.type, components[i]?.components))
  }

  return value
}
