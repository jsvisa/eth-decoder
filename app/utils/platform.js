// app/utils/platform.js
// Web adapter — delegates to the Next.js API routes.
// The desktop adapter (desktop/platform.js) provides the same interface
// using Tauri invoke() and direct fetch calls.

export async function decode(data, { count = 3, multicall = false, withAbi = false, withSign = false } = {}) {
  const params = new URLSearchParams({
    data,
    count,
    multicall,
    with_abi: withAbi,
    with_sign: withSign,
  })
  const res = await fetch(`/api/decode?${params}`)
  if (!res.ok) throw new Error(`Decode failed: ${res.statusText}`)
  return res.json()
}

export async function fetchAbi(address, chain, apiKey) {
  const params = new URLSearchParams({ address, chain, apiKey })
  const res = await fetch(`/api/fetch-abi?${params}`)
  if (!res.ok) throw new Error(`Fetch ABI failed: ${res.statusText}`)
  return res.json()
}

export async function callContract(body) {
  const res = await fetch('/api/call-contract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Call contract failed: ${res.statusText}`)
  return res.json()
}

export async function simulate(body) {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Simulate failed: ${res.statusText}`)
  return res.json()
}

export async function getLogs(params) {
  const qs = new URLSearchParams(params)
  const res = await fetch(`/api/get-logs?${qs}`)
  if (!res.ok) throw new Error(`Get logs failed: ${res.statusText}`)
  return res.json()
}
