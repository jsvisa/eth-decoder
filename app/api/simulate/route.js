import { NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'
import { isValidEthAddress } from '../../utils/validation'

// Tenderly network IDs for simulation API
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
    const { chain, address, functionName, args, abi, fromAddress, tenderlyAccessKey, tenderlyAccount, tenderlyProject, value, valueUnit = 'ETH', blockNumber, stateOverrides } = body

    if (!address || !functionName || !abi) {
      return NextResponse.json(
        { error: 'Missing required parameters: address, functionName, abi' },
        { status: 400 }
      )
    }

    // Validate address format
    if (!isValidEthAddress(address)) {
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

    // Convert value to wei based on unit
    let valueInWei = '0'
    if (value) {
      try {
        if (valueUnit === 'Wei') {
          // Value is already in Wei
          valueInWei = BigInt(value).toString()
        } else {
          // Value is in ETH, convert to Wei
          if (parseFloat(value) > 0) {
            const { parseEther } = await import('viem')
            valueInWei = parseEther(value).toString()
          }
        }
      } catch (e) {
        console.warn('Failed to parse value:', e.message)
      }
    }

    // Build Tenderly simulation request
    const simulationRequest = {
      network_id: networkId,
      from: sender,
      to: address,
      input: callData,
      gas: 8000000,
      gas_price: '0',
      value: valueInWei,
      save: false,
      save_if_fails: false,
      simulation_type: 'full', // Full mode includes decoded call traces
    }

    // Add block number if specified
    if (blockNumber) {
      simulationRequest.block_number = parseInt(blockNumber, 10)
    }

    // Add state overrides (balance and storage overrides) if specified
    if (stateOverrides) {
      const stateObjects = {}

      // Process balance overrides
      if (stateOverrides.balances && stateOverrides.balances.length > 0) {
        for (const override of stateOverrides.balances) {
          if (override.address && override.balance) {
            const addr = override.address.toLowerCase()
            if (!stateObjects[addr]) {
              stateObjects[addr] = {}
            }
            // Convert balance to hex (Tenderly expects hex string)
            try {
              const { parseEther } = await import('viem')
              const balanceWei = parseEther(override.balance)
              stateObjects[addr].balance = '0x' + balanceWei.toString(16)
            } catch (e) {
              // If parsing fails, try to use it as raw wei value
              try {
                const balanceWei = BigInt(override.balance)
                stateObjects[addr].balance = '0x' + balanceWei.toString(16)
              } catch {
                console.warn('Failed to parse balance override:', e.message)
              }
            }
          }
        }
      }

      // Process storage overrides
      if (stateOverrides.storage && stateOverrides.storage.length > 0) {
        for (const override of stateOverrides.storage) {
          if (override.address && override.slot && override.value) {
            const addr = override.address.toLowerCase()
            if (!stateObjects[addr]) {
              stateObjects[addr] = {}
            }
            if (!stateObjects[addr].storage) {
              stateObjects[addr].storage = {}
            }
            // Ensure slot and value are properly formatted as hex
            const slot = override.slot.startsWith('0x') ? override.slot : '0x' + override.slot
            const value = override.value.startsWith('0x') ? override.value : '0x' + override.value
            stateObjects[addr].storage[slot] = value
          }
        }
      }

      if (Object.keys(stateObjects).length > 0) {
        simulationRequest.state_objects = stateObjects
      }
    }

    // Call Tenderly Simulation API for decoded outputs, logs, state changes
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

    // Cross-contract call types we want to display (not internal opcodes)
    const CROSS_CONTRACT_CALLS = ['CALL', 'DELEGATECALL', 'STATICCALL', 'CALLCODE', 'CREATE', 'CREATE2']

    // Extract call trace tree from transaction.transaction_info.call_trace
    // Only includes cross-contract calls, not internal opcodes like SLOAD, SSTORE, JUMPDEST
    // Returns an array of contract calls found at this level or nested within
    const extractContractCalls = (trace, logsArray = []) => {
      if (!trace) return []

      const callType = (trace.call_type || '').toUpperCase()
      const isContractCall = CROSS_CONTRACT_CALLS.includes(callType)

      // Recursively collect contract calls from children
      let nestedCalls = []
      if (trace.calls && Array.isArray(trace.calls)) {
        for (const child of trace.calls) {
          nestedCalls.push(...extractContractCalls(child, logsArray))
        }
      }

      // If this is a contract call, create a node for it with nested calls as children
      if (isContractCall) {
        // Find logs that belong to this call (by matching address)
        const callLogs = logsArray.filter(log =>
          log.raw?.address?.toLowerCase() === trace.to?.toLowerCase()
        ).map(log => ({
          name: log.name || 'Unknown Event',
          address: log.raw?.address,
          inputs: log.inputs?.map(input => ({
            name: input.soltype?.name || input.name || 'unknown',
            type: input.soltype?.type || input.type || 'unknown',
            value: serializeResult(input.value),
            indexed: input.soltype?.indexed || false,
          })) || [],
        }))

        // Extract decoded inputs
        const decodedInputs = trace.decoded_input?.map(input => ({
          name: input.soltype?.name || input.name || 'unknown',
          type: input.soltype?.type || input.type || 'unknown',
          value: serializeResult(input.value),
        })) || []

        // Extract decoded outputs
        const decodedOutputs = trace.decoded_output?.map(output => ({
          name: output.soltype?.name || output.name || 'unknown',
          type: output.soltype?.type || output.type || 'unknown',
          value: serializeResult(output.value),
        })) || []

        return [{
          type: callType,
          from: trace.from,
          to: trace.to,
          toName: trace.contract_name || null,
          functionName: trace.function_name || null,
          value: trace.value || '0',
          gas: trace.gas,
          gasUsed: trace.gas_used,
          input: trace.input,
          output: trace.output,
          decodedInputs,
          decodedOutputs,
          error: trace.error || null,
          errorReason: trace.error_reason || null,
          logs: callLogs,
          calls: nestedCalls,
        }]
      }

      // Not a contract call, promote nested calls up
      return nestedCalls
    }

    // Build call trace tree starting from root
    const buildCallTraceTree = (trace, logsArray = []) => {
      if (!trace) return null

      // Get the root call info
      const callLogs = logsArray.filter(log =>
        log.raw?.address?.toLowerCase() === trace.to?.toLowerCase()
      ).map(log => ({
        name: log.name || 'Unknown Event',
        address: log.raw?.address,
        inputs: log.inputs?.map(input => ({
          name: input.soltype?.name || input.name || 'unknown',
          type: input.soltype?.type || input.type || 'unknown',
          value: serializeResult(input.value),
          indexed: input.soltype?.indexed || false,
        })) || [],
      }))

      const decodedInputs = trace.decoded_input?.map(input => ({
        name: input.soltype?.name || input.name || 'unknown',
        type: input.soltype?.type || input.type || 'unknown',
        value: serializeResult(input.value),
      })) || []

      const decodedOutputs = trace.decoded_output?.map(output => ({
        name: output.soltype?.name || output.name || 'unknown',
        type: output.soltype?.type || output.type || 'unknown',
        value: serializeResult(output.value),
      })) || []

      // Collect all contract calls from children
      let childContractCalls = []
      if (trace.calls && Array.isArray(trace.calls)) {
        for (const child of trace.calls) {
          childContractCalls.push(...extractContractCalls(child, logsArray))
        }
      }

      return {
        type: (trace.call_type || 'CALL').toUpperCase(),
        from: trace.from,
        to: trace.to,
        toName: trace.contract_name || null,
        functionName: trace.function_name || null,
        value: trace.value || '0',
        gas: trace.gas,
        gasUsed: trace.gas_used,
        input: trace.input,
        output: trace.output,
        decodedInputs,
        decodedOutputs,
        error: trace.error || null,
        errorReason: trace.error_reason || null,
        logs: callLogs,
        calls: childContractCalls,
      }
    }

    // Build call trace tree
    const rawCallTrace = transaction?.transaction_info?.call_trace
    const callTraceTree = buildCallTraceTree(rawCallTrace, logs)

    // Extract asset changes and balance changes
    const assetChanges = transaction?.transaction_info?.asset_changes || []
    const balanceChanges = transaction?.transaction_info?.balance_changes || []

    // Extract state changes
    const stateDiff = simulation?.state_diff || []
    const stateChanges = stateDiff.map(diff => ({
      address: diff.address,
      changes: diff.state || [],
    }))

    // Extract access list if available
    const accessList = result.access_list || []

    // Gas info
    const gasUsed = transaction?.gas_used

    return NextResponse.json({
      success,
      simulated: true,
      rawData: rawOutput,
      decoded: decodedOutputs,
      gasUsed,
      assetChanges,
      balanceChanges,
      logs: parsedLogs,
      callTrace: callTraceTree,
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
