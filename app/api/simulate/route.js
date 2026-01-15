import { NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'

// Tenderly network IDs
const TENDERLY_NETWORK_IDS = {
  ethereum: '1',
  arbitrum: '42161',
  base: '8453',
  polygon: '137',
  bsc: '56',
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { chain, address, functionName, args, abi, fromAddress, tenderlyAccessKey, tenderlyAccount, tenderlyProject } = body

    if (!address || !functionName || !abi) {
      return NextResponse.json(
        { error: 'Missing required parameters: address, functionName, abi' },
        { status: 400 }
      )
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    const networkId = TENDERLY_NETWORK_IDS[chain]
    if (!networkId) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
        { status: 400 }
      )
    }

    // Check for Tenderly credentials (from request body)
    if (!tenderlyAccessKey || !tenderlyAccount || !tenderlyProject) {
      return NextResponse.json(
        { error: 'Tenderly API credentials not provided. Please configure your Tenderly settings.' },
        { status: 400 }
      )
    }

    // Find the function in ABI
    const functionAbi = abi.find(
      (item) => item.type === 'function' && item.name === functionName
    )

    if (!functionAbi) {
      return NextResponse.json(
        { error: `Function ${functionName} not found in ABI` },
        { status: 400 }
      )
    }

    // Parse args
    const parsedArgs = (args || []).map((arg, index) => {
      const input = functionAbi.inputs[index]
      if (!input) return arg

      if (input.type.startsWith('uint') || input.type.startsWith('int')) {
        try {
          return BigInt(arg)
        } catch {
          return arg
        }
      }
      if (input.type === 'bool') {
        return arg === 'true' || arg === true
      }
      if (input.type.endsWith('[]')) {
        try {
          return typeof arg === 'string' ? JSON.parse(arg) : arg
        } catch {
          return arg
        }
      }
      return arg
    })

    // Encode function data
    const callData = encodeFunctionData({
      abi: [functionAbi],
      functionName,
      args: parsedArgs,
    })

    // Default from address if not provided
    const sender = fromAddress || '0x0000000000000000000000000000000000000001'

    // Build Tenderly simulation request
    const simulationRequest = {
      network_id: networkId,
      from: sender,
      to: address,
      input: callData,
      gas: 8000000,
      gas_price: '0',
      value: '0',
      save: false,
      save_if_fails: false,
      simulation_type: 'full', // Use full to get call traces
    }

    // Call Tenderly API
    const tenderlyUrl = `https://api.tenderly.co/api/v1/account/${tenderlyAccount}/project/${tenderlyProject}/simulate`

    const response = await fetch(tenderlyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Key': tenderlyAccessKey,
      },
      body: JSON.stringify(simulationRequest),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `Tenderly API returned ${response.status}`)
    }

    const result = await response.json()
    const transaction = result.transaction
    const simulation = result.simulation

    // Parse the result
    const success = transaction?.status === true
    const rawOutput = transaction?.transaction_info?.call_trace?.output || '0x'

    // Helper to serialize BigInt and complex objects for JSON
    const serializeResult = (value) => {
      if (typeof value === 'bigint') return value.toString()
      if (Array.isArray(value)) return value.map(serializeResult)
      if (value && typeof value === 'object') {
        const serialized = {}
        for (const key in value) {
          serialized[key] = serializeResult(value[key])
        }
        return serialized
      }
      return value
    }

    // Decode output if function has outputs
    let decodedOutputs = []
    if (success && functionAbi.outputs && functionAbi.outputs.length > 0 && rawOutput !== '0x') {
      try {
        const { decodeFunctionResult } = await import('viem')
        const decoded = decodeFunctionResult({
          abi: [functionAbi],
          functionName,
          data: rawOutput,
        })

        if (functionAbi.outputs.length === 1) {
          decodedOutputs = [{
            name: functionAbi.outputs[0].name || 'result',
            type: functionAbi.outputs[0].type,
            value: serializeResult(decoded),
          }]
        } else {
          decodedOutputs = functionAbi.outputs.map((output, index) => ({
            name: output.name || `output${index}`,
            type: output.type,
            value: serializeResult(Array.isArray(decoded) ? decoded[index] : decoded[output.name]),
          }))
        }
      } catch (e) {
        console.error('Failed to decode output:', e)
      }
    }

    // Extract and decode logs
    const logs = transaction?.transaction_info?.logs || []
    const parsedLogs = logs.map(log => {
      // Tenderly provides decoded event info when available
      const decodedInputs = log.inputs?.map(input => ({
        name: input.soltype?.name || input.name || 'unknown',
        type: input.soltype?.type || input.type || 'unknown',
        value: serializeResult(input.value),
        indexed: input.soltype?.indexed || false,
      })) || []

      return {
        address: log.raw?.address,
        topics: log.raw?.topics || [],
        data: log.raw?.data,
        name: log.name || null,
        decoded: decodedInputs.length > 0,
        inputs: decodedInputs,
      }
    })

    // Extract call traces recursively
    const extractCallTrace = (trace, depth = 0) => {
      if (!trace) return null

      const traceItem = {
        depth,
        type: trace.call_type || 'CALL',
        from: trace.from,
        to: trace.to,
        value: trace.value || '0',
        gas: trace.gas,
        gasUsed: trace.gas_used,
        input: trace.input,
        output: trace.output,
        functionName: trace.function_name || trace.decoded_input?.method_name || null,
        functionSelector: trace.input?.slice(0, 10) || null,
        decodedInput: trace.decoded_input ? {
          methodName: trace.decoded_input.method_name,
          parameters: trace.decoded_input.parameters?.map(p => ({
            name: p.soltype?.name || p.name,
            type: p.soltype?.type || p.type,
            value: serializeResult(p.value),
          })) || [],
        } : null,
        decodedOutput: trace.decoded_output ?
          trace.decoded_output.map(o => ({
            name: o.soltype?.name || o.name || 'result',
            type: o.soltype?.type || o.type,
            value: serializeResult(o.value),
          })) : null,
        error: trace.error || null,
        errorReason: trace.error_reason || null,
        calls: [],
      }

      // Process nested calls
      if (trace.calls && Array.isArray(trace.calls)) {
        traceItem.calls = trace.calls.map(subTrace => extractCallTrace(subTrace, depth + 1)).filter(Boolean)
      }

      return traceItem
    }

    // Get the root call trace
    const rootTrace = transaction?.transaction_info?.call_trace
    const callTrace = extractCallTrace(rootTrace)

    // Flatten call trace for easier display
    const flattenTrace = (trace, result = []) => {
      if (!trace) return result
      result.push(trace)
      if (trace.calls) {
        trace.calls.forEach(subTrace => flattenTrace(subTrace, result))
      }
      return result
    }
    const flatCallTrace = flattenTrace(callTrace)

    // Extract state changes
    const stateDiff = simulation?.state_diff || []
    const stateChanges = stateDiff.map(diff => ({
      address: diff.address,
      changes: diff.state || [],
    }))

    // Gas info
    const gasUsed = transaction?.gas_used

    return NextResponse.json({
      success,
      simulated: true,
      rawData: rawOutput,
      decoded: decodedOutputs,
      gasUsed,
      logs: parsedLogs,
      callTrace: flatCallTrace,
      stateChanges,
      error: success ? null : (transaction?.error_message || 'Transaction reverted'),
    })
  } catch (error) {
    console.error('Simulation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to simulate transaction' },
      { status: 500 }
    )
  }
}
