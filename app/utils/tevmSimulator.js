import { createMemoryClient, http } from 'tevm'
import { encodeFunctionData, decodeFunctionResult, parseEther, decodeEventLog } from 'viem'
import { isValidEthAddress } from './validation'

// Chain configurations for forking (built-in chains)
const BUILT_IN_CHAIN_CONFIGS = {
  ethereum: { chainId: 1, name: 'Ethereum' },
  arbitrum: { chainId: 42161, name: 'Arbitrum' },
  base: { chainId: 8453, name: 'Base' },
  polygon: { chainId: 137, name: 'Polygon' },
  bsc: { chainId: 56, name: 'BSC' },
}

// Default public RPCs (fallback)
const DEFAULT_RPCS = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  bsc: 'https://bsc-rpc.publicnode.com',
}

// Helper to parse an argument value based on ABI type
const parseArgValue = (arg, input) => {
  if (arg === undefined || arg === null || arg === '') {
    return arg
  }

  const type = input.type

  // Handle integer types
  if (type.startsWith('uint') || type.startsWith('int')) {
    try {
      return BigInt(arg)
    } catch {
      return arg
    }
  }

  // Handle boolean
  if (type === 'bool') {
    return arg === 'true' || arg === true
  }

  // Handle tuple types
  if (type === 'tuple' || type.startsWith('tuple')) {
    // If it's already an object/array, recursively parse components
    let tupleValue = arg
    if (typeof arg === 'string') {
      try {
        // Try to parse as JSON first
        tupleValue = JSON.parse(arg)
      } catch {
        // If not valid JSON, try to parse as comma-separated values
        // This handles cases like "value1,value2,value3"
        const parts = arg.split(',').map(s => s.trim())
        tupleValue = parts
      }
    }

    // If it's a tuple array (tuple[])
    if (type === 'tuple[]') {
      if (!Array.isArray(tupleValue)) {
        return arg
      }
      return tupleValue.map(item => parseArgValue(item, { ...input, type: 'tuple' }))
    }

    // For single tuple, parse each component
    if (input.components && Array.isArray(tupleValue)) {
      const parsed = tupleValue.map((val, idx) => {
        const component = input.components[idx]
        if (!component) return val
        return parseArgValue(val, component)
      })
      return parsed
    }

    return tupleValue
  }

  // Handle array types (e.g., address[], uint256[])
  if (type.endsWith('[]')) {
    let arrayValue = arg
    if (typeof arg === 'string') {
      try {
        arrayValue = JSON.parse(arg)
      } catch {
        return arg
      }
    }
    if (!Array.isArray(arrayValue)) {
      return arg
    }
    // Get the base type (remove [])
    const baseType = type.slice(0, -2)
    return arrayValue.map(item => parseArgValue(item, { ...input, type: baseType }))
  }

  return arg
}

// Helper to serialize BigInt values for JSON
const serializeValue = (value) => {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(serializeValue)
  if (value && typeof value === 'object') {
    const serialized = {}
    for (const key in value) {
      serialized[key] = serializeValue(value[key])
    }
    return serialized
  }
  return value
}

/**
 * Create a Tevm memory client with forking support
 * @param {string} chain - Chain identifier
 * @param {string} rpcUrl - Optional custom RPC URL
 * @param {string|number} blockNumber - Block number or tag ('latest')
 * @param {number} customChainId - Optional custom chain ID for non-built-in chains
 * @returns {Promise<{client: any, blockNumber: string}>}
 */
export async function createTevmClient(chain, rpcUrl, blockNumber = 'latest', customChainId = null) {
  // Get chain config from built-in or use custom chain ID
  let chainConfig = BUILT_IN_CHAIN_CONFIGS[chain]

  // Handle custom chains
  if (!chainConfig && customChainId) {
    chainConfig = { chainId: customChainId, name: chain }
  }

  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}. Please provide a custom chain ID.`)
  }

  const forkUrl = rpcUrl || DEFAULT_RPCS[chain]
  if (!forkUrl) {
    throw new Error(`No RPC URL configured for ${chain}`)
  }

  // Parse block number - treat empty string as 'latest'
  let blockTag = 'latest'
  if (blockNumber && blockNumber !== 'latest') {
    const numericBlock = typeof blockNumber === 'string' ? blockNumber.trim() : String(blockNumber)
    if (numericBlock && /^\d+$/.test(numericBlock)) {
      blockTag = BigInt(numericBlock)
    }
  }

  // Create fork client with the specified block tag
  const client = createMemoryClient({
    fork: {
      transport: http(forkUrl),
      blockTag,
    },
  })

  await client.tevmReady()

  return { client, blockNumber: blockTag === 'latest' ? 'latest' : blockTag.toString() }
}

/**
 * Apply cheatcodes to the Tevm client
 */
export async function applyCheatcodes(client, cheatcodes = {}) {
  const { deal, prank, warp } = cheatcodes

  // vm.deal - Set ETH balance for an address
  if (deal && deal.address && deal.amount) {
    await client.tevmSetAccount({
      address: deal.address,
      balance: parseEther(deal.amount.toString()),
    })
  }

  // vm.warp - Set block timestamp
  if (warp && warp.timestamp !== undefined && warp.timestamp !== null && warp.timestamp !== '') {
    try {
      const timestamp = typeof warp.timestamp === 'bigint' ? warp.timestamp : BigInt(warp.timestamp)
      await client.tevmMine({
        blockCount: 1,
        timestamp,
      })
    } catch (err) {
      console.warn('Failed to apply warp cheatcode:', err.message)
    }
  }

  // vm.prank is handled by setting the 'from' address in the call
  return {
    prankAddress: prank?.address || null,
  }
}

/**
 * Simulate a contract call using Tevm
 * @param {Object} params - Simulation parameters
 * @param {Map<string, Array>} params.abiCache - Optional map of lowercase address -> ABI array for decoding logs from multiple contracts
 * @returns {Object} Simulation result including `undecodedAddresses` - addresses that emitted logs but couldn't be decoded
 */
export async function simulateWithTevm({
  chain,
  address,
  functionName,
  args,
  abi,
  fromAddress,
  value,
  valueUnit = 'ETH',
  rpcUrl,
  blockNumber = 'latest',
  cheatcodes = {},
  customChainId = null,
  abiCache = new Map(),
}) {
  try {
    // Validate inputs
    if (!address || !functionName || !abi) {
      throw new Error('Missing required parameters: address, functionName, abi')
    }

    if (!isValidEthAddress(address)) {
      throw new Error('Invalid address format')
    }

    // Find the function in ABI
    const functionAbi = abi.find(
      (item) => item.type === 'function' && item.name === functionName
    )

    if (!functionAbi) {
      throw new Error(`Function ${functionName} not found in ABI`)
    }

    // Parse args based on types
    const parsedArgs = (args || []).map((arg, index) => {
      const input = functionAbi.inputs[index]
      if (!input) return arg
      return parseArgValue(arg, input)
    })

    // Create Tevm client with the specified block
    const { client, blockNumber: actualBlock } = await createTevmClient(chain, rpcUrl, blockNumber, customChainId)

    // Apply cheatcodes
    const { prankAddress } = await applyCheatcodes(client, cheatcodes)

    // Determine sender address
    const sender = prankAddress || fromAddress || '0x0000000000000000000000000000000000000001'

    // If using deal cheatcode, ensure sender has funds
    if (cheatcodes.deal?.address === sender) {
      // Already applied in applyCheatcodes
    } else if (!fromAddress || fromAddress === '0x0000000000000000000000000000000000000001') {
      // Give the default sender some ETH for gas
      await client.tevmSetAccount({
        address: sender,
        balance: parseEther('1000'),
      })
    }

    // Encode the function call
    const callData = encodeFunctionData({
      abi: [functionAbi],
      functionName,
      args: parsedArgs,
    })

    // Convert value to wei based on unit
    let valueInWei = 0n
    if (value) {
      try {
        if (valueUnit === 'Wei') {
          // Value is already in Wei
          valueInWei = BigInt(value)
        } else {
          // Value is in ETH, convert to Wei
          if (parseFloat(value) > 0) {
            valueInWei = parseEther(value)
          }
        }
      } catch (e) {
        console.warn('Failed to parse value:', e.message)
      }
    }

    // Execute the call using tevmCall for full trace
    const callResult = await client.tevmCall({
      to: address,
      from: sender,
      data: callData,
      value: valueInWei,
      createTrace: true,
      createAccessList: true,
    })

    // Check for errors
    const success = !callResult.errors || callResult.errors.length === 0
    const rawOutput = callResult.rawData || '0x'

    // Decode output if function has outputs and call succeeded
    let decodedOutputs = []
    if (success && functionAbi.outputs && functionAbi.outputs.length > 0 && rawOutput !== '0x') {
      try {
        const decoded = decodeFunctionResult({
          abi: [functionAbi],
          functionName,
          data: rawOutput,
        })

        if (functionAbi.outputs.length === 1) {
          decodedOutputs = [{
            name: functionAbi.outputs[0].name || 'result',
            type: functionAbi.outputs[0].type,
            value: serializeValue(decoded),
          }]
        } else {
          decodedOutputs = functionAbi.outputs.map((output, index) => ({
            name: output.name || `output${index}`,
            type: output.type,
            value: serializeValue(Array.isArray(decoded) ? decoded[index] : decoded[output.name]),
          }))
        }
      } catch (e) {
        console.error('Failed to decode output:', e)
      }
    }

    // Build a combined map of address -> event ABIs for decoding
    // Include the main contract's ABI and any cached ABIs
    const eventAbisByAddress = new Map()

    // Add main contract's event ABIs
    const mainContractEventAbis = abi.filter(item => item.type === 'event')
    eventAbisByAddress.set(address.toLowerCase(), mainContractEventAbis)

    // Add cached ABIs
    for (const [cachedAddress, cachedAbi] of abiCache) {
      const eventAbis = cachedAbi.filter(item => item.type === 'event')
      if (eventAbis.length > 0) {
        eventAbisByAddress.set(cachedAddress.toLowerCase(), eventAbis)
      }
    }

    // Track addresses that couldn't decode their events
    const undecodedAddresses = new Set()

    // Parse logs from execution and try to decode using appropriate ABIs
    const parsedLogs = (Array.isArray(callResult.logs) ? callResult.logs : []).map(log => {
      const topics = log.topics || []
      const data = log.data || '0x'
      const logAddress = log.address?.toLowerCase()

      // Get event ABIs for this log's address, or try all known ABIs
      const addressEventAbis = eventAbisByAddress.get(logAddress) || []

      // First try ABIs specific to this address
      for (const eventAbi of addressEventAbis) {
        try {
          const decoded = decodeEventLog({
            abi: [eventAbi],
            data,
            topics,
          })

          // Successfully decoded
          const inputs = eventAbi.inputs.map((input, index) => ({
            name: input.name || `arg${index}`,
            type: input.type,
            value: serializeValue(decoded.args[input.name] ?? decoded.args[index]),
            indexed: input.indexed || false,
          }))

          return {
            address: log.address,
            topics,
            data,
            name: decoded.eventName,
            decoded: true,
            inputs,
          }
        } catch {
          // This event ABI doesn't match, try next
        }
      }

      // If address-specific ABIs didn't work, try all known ABIs
      // This helps with common events like ERC20 Transfer
      for (const [, eventAbis] of eventAbisByAddress) {
        for (const eventAbi of eventAbis) {
          try {
            const decoded = decodeEventLog({
              abi: [eventAbi],
              data,
              topics,
            })

            // Successfully decoded
            const inputs = eventAbi.inputs.map((input, index) => ({
              name: input.name || `arg${index}`,
              type: input.type,
              value: serializeValue(decoded.args[input.name] ?? decoded.args[index]),
              indexed: input.indexed || false,
            }))

            return {
              address: log.address,
              topics,
              data,
              name: decoded.eventName,
              decoded: true,
              inputs,
            }
          } catch {
            // This event ABI doesn't match, try next
          }
        }
      }

      // Could not decode - track this address for potential ABI fetch
      if (logAddress) {
        undecodedAddresses.add(logAddress)
      }

      // Return raw log
      return {
        address: log.address,
        topics,
        data,
        name: null,
        decoded: false,
        inputs: [],
      }
    })

    // Build a simple call trace
    const callTraceTree = {
      type: 'CALL',
      from: sender,
      to: address,
      toName: null,
      functionName: functionName,
      value: valueInWei.toString(),
      gas: callResult.executionGasUsed?.toString() || '0',
      gasUsed: callResult.executionGasUsed?.toString() || '0',
      input: callData,
      output: rawOutput,
      decodedInputs: functionAbi.inputs.map((input, index) => ({
        name: input.name || `input${index}`,
        type: input.type,
        value: serializeValue(parsedArgs[index]),
      })),
      decodedOutputs,
      error: success ? null : (callResult.errors?.[0]?.message || 'Transaction reverted'),
      errorReason: null,
      logs: parsedLogs,
      calls: [],
    }

    // Get gas used
    const gasUsed = callResult.executionGasUsed ? Number(callResult.executionGasUsed) : 0

    // Access list if available
    const accessList = Array.isArray(callResult.accessList) ? callResult.accessList : []

    return {
      success,
      simulated: true,
      localSimulation: true,
      blockNumber: actualBlock,
      rawData: rawOutput,
      decoded: decodedOutputs,
      gasUsed,
      assetChanges: [],
      balanceChanges: [],
      logs: parsedLogs,
      callTrace: callTraceTree,
      stateChanges: [],
      accessList: accessList.map(item => ({
        address: item.address,
        storageKeys: item.storageKeys || [],
      })),
      error: success ? null : (callResult.errors?.[0]?.message || 'Transaction reverted'),
      undecodedAddresses: Array.from(undecodedAddresses),
    }
  } catch (error) {
    console.error('Tevm simulation error:', error)

    return {
      success: false,
      simulated: true,
      localSimulation: true,
      rawData: '0x',
      decoded: [],
      gasUsed: 0,
      assetChanges: [],
      balanceChanges: [],
      logs: [],
      callTrace: null,
      stateChanges: [],
      error: error.message || 'Failed to simulate transaction',
      undecodedAddresses: [],
    }
  }
}

/**
 * Re-decode logs using an updated ABI cache
 * @param {Array} logs - Array of log objects (some may be undecoded)
 * @param {Map<string, Array>} abiCache - Map of lowercase address -> ABI array
 * @returns {Array} Logs with updated decoding
 */
export function redecodeLogs(logs, abiCache) {
  if (!logs || !Array.isArray(logs)) return logs

  // Build event ABI map from cache
  const eventAbisByAddress = new Map()
  for (const [address, abi] of abiCache) {
    const eventAbis = abi.filter(item => item.type === 'event')
    if (eventAbis.length > 0) {
      eventAbisByAddress.set(address.toLowerCase(), eventAbis)
    }
  }

  return logs.map(log => {
    // If already decoded, skip
    if (log.decoded) return log

    const topics = log.topics || []
    const data = log.data || '0x'
    const logAddress = log.address?.toLowerCase()

    // Try ABIs specific to this address first
    const addressEventAbis = eventAbisByAddress.get(logAddress) || []
    for (const eventAbi of addressEventAbis) {
      try {
        const decoded = decodeEventLog({
          abi: [eventAbi],
          data,
          topics,
        })

        const inputs = eventAbi.inputs.map((input, index) => ({
          name: input.name || `arg${index}`,
          type: input.type,
          value: serializeValue(decoded.args[input.name] ?? decoded.args[index]),
          indexed: input.indexed || false,
        }))

        return {
          ...log,
          name: decoded.eventName,
          decoded: true,
          inputs,
        }
      } catch {
        // Try next
      }
    }

    // Try all known ABIs (for common events like ERC20 Transfer)
    for (const [, eventAbis] of eventAbisByAddress) {
      for (const eventAbi of eventAbis) {
        try {
          const decoded = decodeEventLog({
            abi: [eventAbi],
            data,
            topics,
          })

          const inputs = eventAbi.inputs.map((input, index) => ({
            name: input.name || `arg${index}`,
            type: input.type,
            value: serializeValue(decoded.args[input.name] ?? decoded.args[index]),
            indexed: input.indexed || false,
          }))

          return {
            ...log,
            name: decoded.eventName,
            decoded: true,
            inputs,
          }
        } catch {
          // Try next
        }
      }
    }

    // Still couldn't decode
    return log
  })
}

/**
 * Helper to check if Tevm is available and working
 */
export async function checkTevmAvailability(chain, rpcUrl, customChainId = null) {
  try {
    const { client } = await createTevmClient(chain, rpcUrl, 'latest', customChainId)
    const blockNumber = await client.getBlockNumber()
    return {
      available: true,
      blockNumber: Number(blockNumber),
    }
  } catch (error) {
    return {
      available: false,
      error: error.message,
    }
  }
}
