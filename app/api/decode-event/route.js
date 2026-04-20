import { NextResponse } from 'next/server'

// Proxy to abi_server /api/v1/decode-event
// Accepts: sign (topic0), topics (comma-separated), data (hex)
export async function GET(request) {
  try {
    const backendUrl = process.env.BACKEND_URL
    if (!backendUrl) {
      return NextResponse.json({ error: 'BACKEND_URL not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const sign   = searchParams.get('sign')
    const topics = searchParams.get('topics')
    const data   = searchParams.get('data') || '0x'

    if (!sign) {
      return NextResponse.json({ error: 'Missing sign (topic0) parameter' }, { status: 400 })
    }

    const params = new URLSearchParams({ sign, data })
    if (topics) params.set('topics', topics)

    const response = await fetch(`${backendUrl}/api/v1/decode-event?${params}`)
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`)
    }

    return NextResponse.json(await response.json())
  } catch (error) {
    console.error('decode-event error:', error)
    return NextResponse.json({ error: error.message || 'Failed to decode event' }, { status: 500 })
  }
}
