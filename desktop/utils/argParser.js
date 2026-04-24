// desktop/utils/argParser.js

export function parseArg(value, type) {
  if (value === '' || value === undefined || value === null) return undefined

  if (type.endsWith('[]')) {
    const baseType = type.slice(0, -2)
    return value.split(',').map(v => parseArg(v.trim(), baseType))
  }

  const fixedMatch = type.match(/^(.+)\[(\d+)\]$/)
  if (fixedMatch) {
    const baseType = fixedMatch[1]
    return value.split(',').map(v => parseArg(v.trim(), baseType))
  }

  if (type === 'address') return value
  if (type === 'bool') return value.toLowerCase() === 'true' || value === '1'
  if (type === 'string') return value
  if (type.startsWith('bytes')) return value
  if (type.startsWith('uint') || type.startsWith('int')) return BigInt(value)
  if (type === 'tuple') {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}
