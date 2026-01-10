import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const data = searchParams.get('data')

    if (!data) {
      return NextResponse.json(
        { error: 'Missing data parameter' },
        { status: 400 }
      )
    }

    // Get the backend URL from environment variables
    const backendUrl = process.env.BACKEND_URL

    if (!backendUrl) {
      return NextResponse.json(
        { error: 'Backend URL is not configured. Please set BACKEND_URL environment variable.' },
        { status: 500 }
      )
    }

    // Get the optional parameters
    const multicall = searchParams.get('multicall') === 'true'
    const withAbi = searchParams.get('with_abi') === 'true'
    const withSign = searchParams.get('with_sign') === 'true'

    // Build the query string
    const params = new URLSearchParams({
      data: data,
      multicall: multicall,
      with_abi: withAbi,
      with_sign: withSign
    })

    // Make the request to the backend
    const response = await fetch(
      `${backendUrl}/api/v1/decode?${params}`
    )

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    return NextResponse.json(result)
  } catch (error) {
    console.error('Decode API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to decode data' },
      { status: 500 }
    )
  }
}
