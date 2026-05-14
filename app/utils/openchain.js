const OPENCHAIN_URL = 'https://api.openchain.xyz/signature-database/v1/lookup'

export async function lookupFunctionSignatures(selector) {
  try {
    const res = await fetch(`${OPENCHAIN_URL}?function=${selector}`)
    if (!res.ok) return []
    const json = await res.json()
    if (!json.ok) return []
    return (json.result?.function?.[selector] ?? []).map(e => e.name)
  } catch {
    return []
  }
}

export async function lookupEventSignatures(topic0) {
  try {
    const res = await fetch(`${OPENCHAIN_URL}?event=${topic0}`)
    if (!res.ok) return []
    const json = await res.json()
    if (!json.ok) return []
    return (json.result?.event?.[topic0] ?? []).map(e => e.name)
  } catch {
    return []
  }
}

// Split top-level comma-separated param type strings, respecting tuple nesting.
function parseParamTypes(raw) {
  if (!raw.trim()) return []
  const out = []
  let depth = 0, cur = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// Convert a canonical type string to a viem ABI input object.
// Handles primitives, arrays, and nested tuples.
function parseType(raw) {
  raw = raw.trim()
  if (!raw.startsWith('(')) return { type: raw }

  let depth = 0, close = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '(') depth++
    else if (raw[i] === ')') { depth--; if (depth === 0) { close = i; break } }
  }
  const suffix = raw.slice(close + 1)   // '' | '[]' | '[N]'
  const components = parseParamTypes(raw.slice(1, close))
    .map((t, i) => ({ name: `arg${i}`, ...parseType(t) }))
  return { type: `tuple${suffix}`, components }
}

// Build a minimal function ABI item from a canonical signature string.
// e.g. 'withdraw(uint256,uint32,bytes,bytes32[])' or 'foo((uint256,address),bytes32)'
export function sigToFunctionAbi(sig) {
  const m = sig.match(/^(\w+)\((.*)\)$/)
  if (!m) throw new Error(`Invalid function signature: ${sig}`)
  return {
    type: 'function',
    name: m[1],
    inputs: parseParamTypes(m[2]).map((t, i) => ({ name: `arg${i}`, ...parseType(t) })),
  }
}

// Build a minimal event ABI item from a canonical signature string.
// numIndexed: number of params to mark indexed (inferred from topics count).
export function sigToEventAbi(sig, numIndexed = 0) {
  const m = sig.match(/^(\w+)\((.*)\)$/)
  if (!m) throw new Error(`Invalid event signature: ${sig}`)
  return {
    type: 'event',
    name: m[1],
    inputs: parseParamTypes(m[2]).map((t, i) => ({
      name: `arg${i}`,
      indexed: i < numIndexed,
      ...parseType(t),
    })),
    anonymous: false,
  }
}
