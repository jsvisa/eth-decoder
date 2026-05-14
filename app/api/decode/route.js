import { NextResponse } from 'next/server'
import { lookupFunctionSignatures, sigToFunctionAbi } from '../../utils/openchain.js'
import { decodeFunctionCalldata } from '../../utils/decoder.js'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const data = searchParams.get('data')

  if (!data) {
    return NextResponse.json(
      { error: 'Missing data parameter' },
      { status: 400 }
    )
  }

  const backendUrl = process.env.BACKEND_URL

  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Backend URL is not configured. Please set BACKEND_URL environment variable.' },
      { status: 500 }
    )
  }

  const multicall = searchParams.get('multicall') === 'true'
  const withAbi = searchParams.get('with_abi') === 'true'
  const withSign = searchParams.get('with_sign') === 'true'

  const params = new URLSearchParams({
    data,
    multicall,
    with_abi: withAbi,
    with_sign: withSign,
  })

  try {
    const response = await fetch(`${backendUrl}/api/v1/decode?${params}`)

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    if (result?.msg === 'ok' && result?.data?.length > 0) return NextResponse.json(result)

    // Backend returned ok but empty data (signature not in DB) — try OpenChain
    const fallback = await tryOpenChainFunctionFallback(data)
    if (fallback) return NextResponse.json(fallback)

    return NextResponse.json(result)
  } catch (error) {
    // Backend unreachable — try OpenChain before giving up
    const fallback = await tryOpenChainFunctionFallback(data)
    if (fallback) return NextResponse.json(fallback)

    console.error('Decode API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to decode data' },
      { status: 500 }
    )
  }
}

async function tryOpenChainFunctionFallback(data) {
  const hex = data.startsWith('0x') ? data : '0x' + data
  const selector = hex.slice(0, 10)
  const sigs = await lookupFunctionSignatures(selector)
  for (const sig of sigs) {
    try {
      const abiItem = sigToFunctionAbi(sig)
      const decoded = decodeFunctionCalldata(abiItem, data)
      return { msg: 'ok', data: [{ ...decoded, source: 'openchain' }] }
    } catch {
      // selector mismatch or ABI mismatch — try next candidate
    }
  }
  return null
}
