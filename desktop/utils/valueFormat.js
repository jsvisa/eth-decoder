// desktop/utils/valueFormat.js

export function valueColorClass(type) {
  if (type === 'address') return 'colorAddress'
  if (type.startsWith('uint') || type.startsWith('int')) return 'colorUint'
  if (type === 'bool') return 'colorBool'
  return 'colorDefault'
}

export function formatNumericHint(value, type) {
  if (!type.startsWith('uint') && !type.startsWith('int')) return null
  try {
    const n = BigInt(value)
    if (n >= 10n ** 18n) {
      const eth = Number(n * 1000n / 10n ** 18n) / 1000
      return `${eth.toFixed(1)} ETH`
    }
    if (n >= 10n ** 9n) {
      const gwei = Number(n * 1000n / 10n ** 9n) / 1000
      return `${gwei.toFixed(1)} Gwei`
    }
    return null
  } catch {
    return null
  }
}

export function shortenAddress(addr) {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
