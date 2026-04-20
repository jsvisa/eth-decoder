'use client'

import { useState, useEffect, useRef } from 'react'
import { toFunctionSelector, encodeFunctionData, toEventSelector, decodeEventLog } from 'viem'
import yaml from 'js-yaml'
import styles from './page.module.css'
import {
  getAddressBook,
  addToAddressBook,
  removeFromAddressBook,
  isAddressBookmarked,
  getBookmarkedAddress,
} from '../utils/addressBook'
import { simulateWithTevm, redecodeLogs, redecodeCallTrace, decodeLogsViaServer, decodeCallTraceLogsViaServer } from '../utils/tevmSimulator'
import { buildAbiCacheFromStorage, fetchAbisForAddresses } from '../utils/abiCache'
import { isValidEthAddress, isValidForkBlock, isValidNumber, isValidPositiveInteger } from '../utils/validation'

const CHAINS = [
  { id: 'ethereum', name: 'Ethereum', icon: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg' },
  { id: 'arbitrum', name: 'Arbitrum', icon: 'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg' },
  { id: 'base', name: 'Base', icon: 'https://icons.llamao.fi/icons/chains/rsz_base.jpg' },
  { id: 'polygon', name: 'Polygon', icon: 'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg' },
  { id: 'bsc', name: 'BSC', icon: 'https://icons.llamao.fi/icons/chains/rsz_binance.jpg' },
]

const STORAGE_KEY = 'contract_caller_history'
const ABI_CACHE_PREFIX = 'abi-'
const TOKEN_SYMBOL_CACHE_PREFIX = 'token-symbol-'
const TENDERLY_SETTINGS_KEY = 'tenderly_settings'
const API_KEYS_STORAGE_KEY = 'api_keys_settings'
const RPC_SETTINGS_KEY = 'rpc_settings'
const SIMULATION_SETTINGS_KEY = 'simulation_settings'
const CUSTOM_CHAINS_KEY = 'custom_chains'
const MAX_HISTORY_ITEMS = 50

// Expected chain IDs for validation (built-in chains)
const BUILT_IN_CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
}

// Recursively validate all addresses in an argument (handles tuples, arrays, nested structures)
const validateAddressesInArg = (argValue, input, errors, argIndex, argErrors, path = '') => {
  const type = input.type

  // Handle address type
  if (type === 'address') {
    if (!argValue || !isValidEthAddress(argValue)) {
      errors[`arg_${argIndex}`] = true
      const fieldName = path || input.name || `Argument ${argIndex + 1}`
      argErrors.push(`${fieldName} must be a valid Ethereum address`)
      return false
    }
    return true
  }

  // Handle address[] type
  if (type === 'address[]') {
    if (!argValue) return true // Empty array is ok
    try {
      const addresses = typeof argValue === 'string' ? JSON.parse(argValue) : argValue
      if (Array.isArray(addresses)) {
        let valid = true
        addresses.forEach((addr, i) => {
          if (!isValidEthAddress(addr)) {
            errors[`arg_${argIndex}`] = true
            const fieldName = path || input.name || `Argument ${argIndex + 1}`
            argErrors.push(`${fieldName}[${i}] must be a valid Ethereum address`)
            valid = false
          }
        })
        return valid
      }
    } catch {
      // JSON parse error - will be caught later
    }
    return true
  }

  // Handle tuple type - recursively validate components
  if (type === 'tuple' && input.components) {
    if (!argValue) return true
    const tupleValue = Array.isArray(argValue) ? argValue : []
    let valid = true
    input.components.forEach((component, i) => {
      const componentPath = path ? `${path}.${component.name || i}` : `${input.name || `Argument ${argIndex + 1}`}.${component.name || i}`
      if (!validateAddressesInArg(tupleValue[i], component, errors, argIndex, argErrors, componentPath)) {
        valid = false
      }
    })
    return valid
  }

  // Handle tuple[] type
  if (type === 'tuple[]' && input.components) {
    if (!argValue) return true
    try {
      const tupleArray = typeof argValue === 'string' ? JSON.parse(argValue) : argValue
      if (Array.isArray(tupleArray)) {
        let valid = true
        tupleArray.forEach((tuple, i) => {
          const tuplePath = path ? `${path}[${i}]` : `${input.name || `Argument ${argIndex + 1}`}[${i}]`
          const tupleInput = { ...input, type: 'tuple' }
          if (!validateAddressesInArg(tuple, tupleInput, errors, argIndex, argErrors, tuplePath)) {
            valid = false
          }
        })
        return valid
      }
    } catch {
      // JSON parse error
    }
    return true
  }

  return true
}

// Helper functions for ABI cache
const getAbiCacheKey = (chain, address) => `${ABI_CACHE_PREFIX}${chain}-${address.toLowerCase()}`

const getCachedAbi = (chain, address) => {
  try {
    const key = getAbiCacheKey(chain, address)
    const cached = localStorage.getItem(key)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (err) {
    console.error('Failed to load cached ABI:', err)
  }
  return null
}

const setCachedAbi = (chain, address, abi, isProxy = false, implAddress = null, contractName = null, implContractName = null) => {
  try {
    const key = getAbiCacheKey(chain, address)
    localStorage.setItem(key, JSON.stringify({
      abi, isProxy, implAddress, contractName, implContractName, timestamp: Date.now()
    }))
  } catch (err) {
    console.error('Failed to cache ABI:', err)
  }
}

// Format ABI with compact inputs/outputs (one line if not nested)
const formatAbiCompact = (abi) => {
  const hasNestedComponents = (params) => {
    return params?.some(p => p.components && p.components.length > 0)
  }

  const formatParams = (params) => {
    if (!params || params.length === 0) return '[]'
    if (hasNestedComponents(params)) {
      return JSON.stringify(params, null, 2)
    }
    // Format each param on same line
    return '[' + params.map(p => JSON.stringify(p)).join(', ') + ']'
  }

  return '[\n' + abi.map(item => {
    if (item.type === 'function') {
      const parts = [
        `  "type": "function"`,
        `  "name": "${item.name}"`,
        `  "inputs": ${formatParams(item.inputs)}`,
        `  "outputs": ${formatParams(item.outputs)}`,
        `  "stateMutability": "${item.stateMutability || 'nonpayable'}"`
      ]
      return '  {\n  ' + parts.join(',\n  ') + '\n  }'
    }
    // For non-function items, use standard formatting
    return '  ' + JSON.stringify(item, null, 2).split('\n').join('\n  ')
  }).join(',\n') + '\n]'
}

// Get contract name from cache for a given address
const getContractNameFromCache = (chain, address) => {
  if (!address) return null
  const cached = getCachedAbi(chain, address)
  if (!cached) return null
  // Return implementation name for proxies, otherwise contract name
  return cached.implContractName || cached.contractName || null
}

// Token symbol cache functions
const getTokenSymbolCacheKey = (chain, address) => `${TOKEN_SYMBOL_CACHE_PREFIX}${chain}-${address.toLowerCase()}`

const getCachedTokenSymbol = (chain, address) => {
  if (!address) return null
  try {
    const key = getTokenSymbolCacheKey(chain, address)
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setCachedTokenSymbol = (chain, address, symbol) => {
  try {
    const key = getTokenSymbolCacheKey(chain, address)
    localStorage.setItem(key, symbol)
  } catch {
    // Ignore cache errors
  }
}

// ERC20 symbol() ABI for fetching token symbols
const ERC20_SYMBOL_ABI = [{ type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' }]

// Get all cached contract addresses
const getCachedAddresses = () => {
  const addresses = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ABI_CACHE_PREFIX)) {
        const withoutPrefix = key.substring(ABI_CACHE_PREFIX.length)

        // Parse chain and address from key
        // Format: {chain}-{address} where chain could be "ethereum" or "chain-1"
        let chain, address
        if (withoutPrefix.startsWith('chain-')) {
          // Custom chain format: chain-{chainId}-{address}
          const addressIndex = withoutPrefix.indexOf('-0x')
          if (addressIndex === -1) continue
          chain = withoutPrefix.substring(0, addressIndex)
          address = withoutPrefix.substring(addressIndex + 1)
        } else {
          // Built-in chain format: {chainName}-{address}
          const firstDash = withoutPrefix.indexOf('-')
          if (firstDash === -1) continue
          chain = withoutPrefix.substring(0, firstDash)
          address = withoutPrefix.substring(firstDash + 1)
        }

        const cached = JSON.parse(localStorage.getItem(key))
        addresses.push({
          chain,
          address,
          contractName: cached.contractName,
          implContractName: cached.implContractName,
          isProxy: cached.isProxy,
        })
      }
    }
  } catch (err) {
    console.error('Failed to get cached addresses:', err)
  }
  return addresses
}

// Component for address-type argument input with address book support
function AddressArgInput({ value, onChange, addressBook, disabled, placeholder, onBookmarkClick, error }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [filter, setFilter] = useState('')

  const isValidAddress = isValidEthAddress(value)
  const isBookmarked = isValidAddress && addressBook.some(item => item.address.toLowerCase() === value.toLowerCase())

  const filteredAddresses = addressBook.filter(item => {
    if (!filter.trim()) return true
    const search = filter.toLowerCase()
    return (
      item.address.toLowerCase().includes(search) ||
      (item.label && item.label.toLowerCase().includes(search)) ||
      (item.contractName && item.contractName.toLowerCase().includes(search))
    )
  })

  const handleSelect = (addr) => {
    onChange(addr)
    setShowDropdown(false)
    setFilter('')
  }

  const handleStarClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isValidAddress || !onBookmarkClick) return
    // Always open the modal - for both adding and editing/removing
    onBookmarkClick(value)
  }

  return (
    <div className={styles.addressArgWrapper}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setFilter(e.target.value)
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder={placeholder}
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        disabled={disabled}
      />
      {isValidAddress && onBookmarkClick && (
        <button
          type="button"
          className={`${styles.addressBookToggleButton} ${isBookmarked ? styles.bookmarked : ''}`}
          onClick={handleStarClick}
          title={isBookmarked ? 'Edit bookmark' : 'Add to address book'}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
      )}
      {showDropdown && addressBook.length > 0 && (
        <div className={styles.addressArgDropdown}>
          {filteredAddresses.length === 0 ? (
            <div className={styles.addressArgEmpty}>No matching addresses</div>
          ) : (
            filteredAddresses.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className={styles.addressArgItem}
                onClick={() => handleSelect(item.address)}
              >
                <span className={styles.addressArgStar}>★</span>
                <span className={styles.addressArgLabel}>
                  {item.label || item.contractName || 'Unnamed'}
                </span>
                <span className={styles.addressArgAddr}>
                  {item.address.slice(0, 8)}...{item.address.slice(-6)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Recursive argument input component for complex types
function ArgInput({ input, value, onChange, addressBook, disabled, onBookmarkClick, depth = 0, error }) {
  const type = input.type

  // Handle address type
  if (type === 'address') {
    return (
      <AddressArgInput
        value={value || ''}
        onChange={onChange}
        addressBook={addressBook}
        disabled={disabled}
        placeholder={`Enter ${type}...`}
        onBookmarkClick={onBookmarkClick}
        error={error}
      />
    )
  }

  // Handle tuple type
  if (type === 'tuple' && input.components) {
    return (
      <TupleArgInput
        input={input}
        value={value}
        onChange={onChange}
        addressBook={addressBook}
        disabled={disabled}
        onBookmarkClick={onBookmarkClick}
        depth={depth}
        error={error}
      />
    )
  }

  // Handle array types (including tuple[])
  if (type.endsWith('[]')) {
    return (
      <ArrayArgInput
        input={input}
        value={value}
        onChange={onChange}
        addressBook={addressBook}
        disabled={disabled}
        onBookmarkClick={onBookmarkClick}
        depth={depth}
        error={error}
      />
    )
  }

  // Handle simple types (uint, int, bool, bytes, string, etc.)
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${type}...`}
      className={`${styles.input} ${error ? styles.inputError : ''}`}
      disabled={disabled}
    />
  )
}

// Tuple input component - renders nested fields for each member
function TupleArgInput({ input, value, onChange, addressBook, disabled, onBookmarkClick, depth = 0 }) {
  const components = input.components || []

  // Initialize value as array if not already
  const tupleValue = Array.isArray(value) ? value : components.map(() => '')

  const handleComponentChange = (index, newValue) => {
    const newTuple = [...tupleValue]
    newTuple[index] = newValue
    onChange(newTuple)
  }

  return (
    <div className={styles.tupleContainer} style={{ marginLeft: depth > 0 ? '1rem' : 0 }}>
      {components.map((component, index) => (
        <div key={index} className={styles.tupleField}>
          <label className={styles.tupleLabel}>
            {component.name || `[${index}]`}
            <span className={styles.tupleType}>({component.type})</span>
          </label>
          <ArgInput
            input={component}
            value={tupleValue[index]}
            onChange={(val) => handleComponentChange(index, val)}
            addressBook={addressBook}
            disabled={disabled}
            onBookmarkClick={onBookmarkClick}
            depth={depth + 1}
          />
        </div>
      ))}
    </div>
  )
}

// Array input component - allows adding/removing elements
function ArrayArgInput({ input, value, onChange, addressBook, disabled, onBookmarkClick, depth = 0 }) {
  const baseType = input.type.slice(0, -2) // Remove '[]' from type
  const isBaseTuple = baseType === 'tuple'

  // Create a mock input for the base type
  const baseInput = isBaseTuple
    ? { type: 'tuple', components: input.components }
    : { type: baseType }

  // Initialize value as array if not already
  const arrayValue = Array.isArray(value) ? value : []

  const handleItemChange = (index, newValue) => {
    const newArray = [...arrayValue]
    newArray[index] = newValue
    onChange(newArray)
  }

  const handleAddItem = () => {
    const newItem = isBaseTuple && input.components
      ? input.components.map(() => '')
      : ''
    onChange([...arrayValue, newItem])
  }

  const handleRemoveItem = (index) => {
    const newArray = arrayValue.filter((_, i) => i !== index)
    onChange(newArray)
  }

  return (
    <div className={styles.arrayContainer} style={{ marginLeft: depth > 0 ? '1rem' : 0 }}>
      {arrayValue.map((item, index) => (
        <div key={index} className={styles.arrayItem}>
          <div className={styles.arrayItemHeader}>
            <span className={styles.arrayIndex}>[{index}]</span>
            <button
              type="button"
              onClick={() => handleRemoveItem(index)}
              className={styles.arrayRemoveButton}
              disabled={disabled}
              title="Remove item"
            >
              ×
            </button>
          </div>
          <div className={styles.arrayItemContent}>
            <ArgInput
              input={baseInput}
              value={item}
              onChange={(val) => handleItemChange(index, val)}
              addressBook={addressBook}
              disabled={disabled}
              onBookmarkClick={onBookmarkClick}
              depth={depth + 1}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAddItem}
        className={styles.arrayAddButton}
        disabled={disabled}
      >
        + Add {isBaseTuple ? 'tuple' : baseType}
      </button>
    </div>
  )
}

export default function ContractCaller() {
  const [chain, setChain] = useState('ethereum')
  const [address, setAddress] = useState('')
  const [abi, setAbi] = useState('')
  const [parsedAbi, setParsedAbi] = useState(null)
  const [functions, setFunctions] = useState([])
  const [selectedFunction, setSelectedFunction] = useState('')
  const [args, setArgs] = useState([])
  const [result, setResult] = useState(null)
  const [simLogsExpanded, setSimLogsExpanded] = useState(true)
  const [simProgress, setSimProgress] = useState(null) // null = not simulating, 0-100 = in progress
  const simAbortRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [fetchingAbi, setFetchingAbi] = useState(false)
  const [detectProxy, setDetectProxy] = useState(false)
  const [error, setError] = useState(null)
  const [isYaml, setIsYaml] = useState(false)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(true)
  const [abiSource, setAbiSource] = useState(null) // 'cached', 'fetched', or null
  const [contractName, setContractName] = useState(null)
  const [abiSaved, setAbiSaved] = useState(false) // Feedback for ABI save action
  const [showFullResponse, setShowFullResponse] = useState(false)
  const [cachedAddresses, setCachedAddresses] = useState([])
  const [tokenSymbols, setTokenSymbols] = useState({}) // Map of address -> symbol for Transfer events
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false)
  const [addressFilter, setAddressFilter] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [tenderlySettings, setTenderlySettings] = useState({
    accessKey: '',
    account: '',
    project: '',
  })
  const [apiKeys, setApiKeys] = useState({
    etherscan: '',
  })
  const [rpcSettings, setRpcSettings] = useState({
    ethereum: '',
    arbitrum: '',
    base: '',
    polygon: '',
    bsc: '',
  })
  const [resultCollapsed, setResultCollapsed] = useState(false)
  const [hideTooltip, setHideTooltip] = useState(false)
  const [functionFilter, setFunctionFilter] = useState('')
  const [showFunctionList, setShowFunctionList] = useState(false)
  const [copiedItem, setCopiedItem] = useState(null) // 'selector' | 'signature' | null
  const [ethValue, setEthValue] = useState('') // ETH value for payable functions
  const [ethValueUnit, setEthValueUnit] = useState('ETH') // 'ETH' or 'Wei'
  const [urlCopied, setUrlCopied] = useState(false) // For share URL feedback
  const [calldataCopied, setCalldataCopied] = useState(false) // For copy calldata feedback
  const [testingEtherscan, setTestingEtherscan] = useState(false)
  const [etherscanTestResult, setEtherscanTestResult] = useState(null) // 'success' | 'error' | null
  const [testingTenderly, setTestingTenderly] = useState(false)
  const [tenderlyTestResult, setTenderlyTestResult] = useState(null) // 'success' | 'error' | null
  const [testingRpc, setTestingRpc] = useState({}) // { [chain]: boolean }
  const [rpcTestResult, setRpcTestResult] = useState({}) // { [chain]: 'success' | 'error' | null }
  const [addressBook, setAddressBook] = useState([]) // Address book entries
  const [showBookmarkModal, setShowBookmarkModal] = useState(false) // Show save to address book modal
  const [bookmarkAddress, setBookmarkAddress] = useState('') // Address being bookmarked (empty = main contract address)
  const [bookmarkLabel, setBookmarkLabel] = useState('') // Label for new bookmark
  const [bookmarkNotes, setBookmarkNotes] = useState('') // Notes for new bookmark
  const [selectedRpcChain, setSelectedRpcChain] = useState('ethereum') // For RPC settings dropdown
  // Simulation settings
  const [useLocalSimulation, setUseLocalSimulation] = useState(true) // Use browser-based Tevm simulation (default)
  const [rpcBatchSize, setRpcBatchSize] = useState(1) // JSON-RPC batch size for simulation prefetch
  const [forkBlockNumber, setForkBlockNumber] = useState('') // Block number to fork from (empty = latest)
  const [readBlockNumber, setReadBlockNumber] = useState('') // Block number for read-only eth_call (empty = latest)
  const [cheatcodes, setCheatcodes] = useState({
    deal: { enabled: false, address: '', amount: '' },
    prank: { enabled: false, address: '' },
    warp: { enabled: false, timestamp: '' },
  })
  // Tenderly-specific state overrides
  const [balanceOverrides, setBalanceOverrides] = useState([]) // Array of {address, balance}
  const [storageOverrides, setStorageOverrides] = useState([]) // Array of {address, slot, value}
  const [timestampOverride, setTimestampOverride] = useState('') // Unix timestamp override
  const [abiCollapsed, setAbiCollapsed] = useState(true) // Collapse ABI JSON textarea (default collapsed)
  const [abiViewMode, setAbiViewMode] = useState('list') // 'list' or 'raw' view mode
  const [abiFilter, setAbiFilter] = useState('') // Search filter for ABI entries
  const [abiCopiedItem, setAbiCopiedItem] = useState(null) // Track which ABI item was just copied
  const [simOptionsExpanded, setSimOptionsExpanded] = useState(false) // Expand simulation options
  const [fieldErrors, setFieldErrors] = useState({}) // Track validation errors for fields
  // Custom chains state
  const [customChains, setCustomChains] = useState([]) // User-added chains from chainlist.org
  const [showAddChainModal, setShowAddChainModal] = useState(false) // Modal for adding custom chains
  const [chainlistData, setChainlistData] = useState([]) // Data from chainlist.org
  const [chainlistLoading, setChainlistLoading] = useState(false) // Loading chainlist data
  const [chainlistSearch, setChainlistSearch] = useState('') // Search filter for chainlist
  const [chainlistError, setChainlistError] = useState(null) // Error loading chainlist
  const [addedChainsCollapsed, setAddedChainsCollapsed] = useState(true) // Collapse added chains by default
  // Events tab state
  const [activeTab, setActiveTab] = useState('functions') // 'functions' | 'events'
  const [selectedEvents, setSelectedEvents] = useState([]) // Array of selected event names
  const [eventFilter, setEventFilter] = useState('') // Search filter for events
  const [eventLogs, setEventLogs] = useState([]) // Fetched logs from API
  const [fetchingLogs, setFetchingLogs] = useState(false) // Loading state for logs
  const [logsError, setLogsError] = useState(null) // Error state for logs
  const [logsPage, setLogsPage] = useState(1) // Pagination page
  const [logsOffset, setLogsOffset] = useState(1000) // Records per page
  const [logsFilter, setLogsFilter] = useState('') // Filter for topics/data after fetch
  const [logsFromBlock, setLogsFromBlock] = useState('') // From block (empty = auto latest-10000)
  const [logsToBlock, setLogsToBlock] = useState('latest') // To block
  const [latestBlockCache, setLatestBlockCache] = useState(null) // Cached latest block number
  const [logsFetched, setLogsFetched] = useState(false) // Track if fetch was attempted
  const [eventListCollapsed, setEventListCollapsed] = useState(false) // Collapse event selection list
  // Store pending args with context to handle race conditions when switching contracts
  const pendingHistoryRef = useRef(null) // { functionName, args, timestamp }
  const bookmarkInputRef = useRef(null)
  const chainSearchRef = useRef(null)

  // Focus bookmark input when modal opens
  useEffect(() => {
    if (showBookmarkModal && bookmarkInputRef.current) {
      bookmarkInputRef.current.focus()
    }
  }, [showBookmarkModal])

  // Focus chain search input when add chain modal opens
  useEffect(() => {
    if (showAddChainModal && chainSearchRef.current) {
      chainSearchRef.current.focus()
    }
  }, [showAddChainModal])

  // Compute merged chains list (built-in + custom)
  const allChains = [...CHAINS, ...customChains]

  // Compute chain IDs map (built-in + custom)
  const getChainId = (chainId) => {
    if (BUILT_IN_CHAIN_IDS[chainId]) {
      return BUILT_IN_CHAIN_IDS[chainId]
    }
    const customChain = customChains.find(c => c.id === chainId)
    return customChain?.chainId || null
  }

  // Get chain info by ID
  const getChainInfo = (chainId) => {
    return allChains.find(c => c.id === chainId) || null
  }

  // Clear stale pending history after 5 seconds
  useEffect(() => {
    if (pendingHistoryRef.current && pendingHistoryRef.current.timestamp) {
      const timer = setTimeout(() => {
        if (pendingHistoryRef.current && Date.now() - pendingHistoryRef.current.timestamp > 5000) {
          pendingHistoryRef.current = null
        }
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [pendingHistoryRef.current?.timestamp])

  // Helper to check if function is read-only
  const isReadOnly = (func) => {
    return func?.stateMutability === 'view' || func?.stateMutability === 'pure'
  }

  // Helper to check if function is payable
  const isPayable = (func) => {
    return func?.stateMutability === 'payable'
  }

  // Helper to get default value for an input type
  const getDefaultValue = (input) => {
    if (!input) return ''
    const type = input.type
    // For tuple types, initialize with array of default values for each component
    if (type === 'tuple' && input.components) {
      return input.components.map(comp => getDefaultValue(comp))
    }
    // For array types, initialize with empty array
    if (type.endsWith('[]')) {
      return []
    }
    // For simple types, return empty string
    return ''
  }

  // Get selected function object
  const getSelectedFunction = () => {
    if (!selectedFunction || !parsedAbi) return null
    return parsedAbi.find(
      (item) => item.type === 'function' && item.name === selectedFunction
    )
  }

  // Get function selector (4-byte signature)
  const getFunctionSelector = (func) => {
    if (!func) return null
    try {
      return toFunctionSelector(func)
    } catch (e) {
      return null
    }
  }

  // Filter functions by search term
  const getFilteredFunctions = () => {
    if (!functionFilter.trim()) return functions
    const search = functionFilter.toLowerCase()
    return functions.filter(func =>
      func.name.toLowerCase().includes(search) ||
      func.inputs?.some(input => input.name?.toLowerCase().includes(search) || input.type?.toLowerCase().includes(search))
    )
  }

  // Filter and group ABI entries for searchable view
  const getFilteredAbiEntries = () => {
    if (!parsedAbi || !Array.isArray(parsedAbi)) return { functions: [], events: [], errors: [], other: [] }

    const search = abiFilter.toLowerCase().trim()
    const filtered = search
      ? parsedAbi.filter(item => {
          const name = item.name?.toLowerCase() || ''
          const type = item.type?.toLowerCase() || ''
          const inputs = item.inputs?.map(i => `${i.name} ${i.type}`).join(' ').toLowerCase() || ''
          const outputs = item.outputs?.map(o => `${o.name} ${o.type}`).join(' ').toLowerCase() || ''
          return name.includes(search) || type.includes(search) || inputs.includes(search) || outputs.includes(search)
        })
      : parsedAbi

    return {
      functions: filtered.filter(item => item.type === 'function'),
      events: filtered.filter(item => item.type === 'event'),
      errors: filtered.filter(item => item.type === 'error'),
      other: filtered.filter(item => !['function', 'event', 'error'].includes(item.type))
    }
  }

  // Format ABI entry signature for display
  const formatAbiSignature = (item) => {
    const inputs = item.inputs?.map(i => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ') || ''
    if (item.type === 'function') {
      const outputs = item.outputs?.map(o => o.type).join(', ') || ''
      return `${item.name}(${inputs})${outputs ? ` → ${outputs}` : ''}`
    }
    return `${item.name || item.type}(${inputs})`
  }

  // Copy ABI entry to clipboard and show feedback
  const copyAbiEntry = async (item, itemKey) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(item, null, 2))
      setAbiCopiedItem(itemKey)
      setTimeout(() => setAbiCopiedItem(null), 1500)
    } catch (err) {
      console.error('Failed to copy ABI:', err)
    }
  }

  // Get events from parsed ABI
  const getEvents = () => {
    if (!parsedAbi || !Array.isArray(parsedAbi)) return []
    return parsedAbi.filter(item => item.type === 'event')
  }

  // Filter events by search term
  const getFilteredEvents = () => {
    const events = getEvents()
    if (!eventFilter.trim()) return events
    const search = eventFilter.toLowerCase()
    return events.filter(event =>
      event.name.toLowerCase().includes(search) ||
      event.inputs?.some(input => input.name?.toLowerCase().includes(search) || input.type?.toLowerCase().includes(search))
    )
  }

  // Toggle event selection
  const toggleEventSelection = (eventName) => {
    setSelectedEvents(prev =>
      prev.includes(eventName)
        ? prev.filter(e => e !== eventName)
        : [...prev, eventName]
    )
  }

  // Select all visible events
  const selectAllEvents = () => {
    const filtered = getFilteredEvents()
    setSelectedEvents(filtered.map(e => e.name))
  }

  // Clear all event selections
  const clearEventSelection = () => {
    setSelectedEvents([])
  }

  // Decode a single log entry
  const decodeLog = (log) => {
    if (!parsedAbi) return { ...log, decodedName: null, decodedArgs: null }

    try {
      const decoded = decodeEventLog({
        abi: parsedAbi,
        data: log.data,
        topics: log.topics,
      })
      return {
        ...log,
        decodedName: decoded.eventName,
        decodedArgs: decoded.args,
      }
    } catch {
      return { ...log, decodedName: null, decodedArgs: null }
    }
  }

  // Fetch latest block number from Etherscan
  const fetchLatestBlock = async () => {
    const chainIdForApi = getChainId(chain)
    if (!chainIdForApi || !apiKeys.etherscan) return null

    try {
      const params = new URLSearchParams({
        chainid: chainIdForApi.toString(),
        module: 'proxy',
        action: 'eth_blockNumber',
        apikey: apiKeys.etherscan,
      })
      const response = await fetch(`https://api.etherscan.io/v2/api?${params}`)
      const data = await response.json()
      if (data.result) {
        const blockNum = parseInt(data.result, 16)
        setLatestBlockCache(blockNum)
        return blockNum
      }
    } catch (err) {
      console.error('Failed to fetch latest block:', err)
    }
    return null
  }

  // Fetch logs for selected events
  const fetchLogs = async () => {
    if (selectedEvents.length === 0) {
      setLogsError('Please select at least one event')
      return
    }

    if (!address || !isValidEthAddress(address)) {
      setLogsError('Please enter a valid contract address')
      return
    }

    if (!apiKeys.etherscan) {
      setLogsError('Please configure your Etherscan API key in Settings')
      setShowSettings(true)
      return
    }

    setFetchingLogs(true)
    setLogsError(null)
    setEventLogs([])

    try {
      // Determine block range
      let fromBlock = logsFromBlock.trim()
      let toBlock = logsToBlock.trim() || 'latest'

      // If fromBlock is empty, default to latest - 10000
      if (!fromBlock) {
        const latestBlock = latestBlockCache || await fetchLatestBlock()
        if (latestBlock) {
          fromBlock = Math.max(0, latestBlock - 10000).toString()
        } else {
          fromBlock = '0' // Fallback if can't get latest
        }
      }

      const allLogs = []

      for (const eventName of selectedEvents) {
        const event = parsedAbi.find(e => e.type === 'event' && e.name === eventName)
        if (!event) continue

        const topic0 = toEventSelector(event)

        const params = new URLSearchParams({
          address,
          chain,
          topic0,
          fromBlock,
          toBlock,
          page: logsPage.toString(),
          offset: logsOffset.toString(),
        })

        if (apiKeys.etherscan) {
          params.set('apiKey', apiKeys.etherscan)
        }

        const chainIdForApi = getChainId(chain)
        if (chainIdForApi) {
          params.set('chainId', chainIdForApi.toString())
        }

        const response = await fetch(`/api/get-logs?${params}`)
        const data = await response.json()

        if (data.error) {
          throw new Error(data.error)
        }

        if (data.result && Array.isArray(data.result)) {
          allLogs.push(...data.result)
        }
      }

      // Sort by block number descending (most recent first)
      allLogs.sort((a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16))

      // Decode all logs
      const decodedLogs = allLogs.map(log => decodeLog(log))
      setEventLogs(decodedLogs)
      setLogsFetched(true)
    } catch (err) {
      setLogsError(err.message || 'Failed to fetch logs')
    } finally {
      setFetchingLogs(false)
    }
  }

  // Download event logs as CSV (respects current filter)
  const downloadLogsAsCsv = () => {
    const logsToExport = getFilteredLogs()
    if (logsToExport.length === 0) return

    const headers = ['Block', 'Timestamp', 'Tx Hash', 'Event', 'Topics', 'Data', 'Decoded Args']
    const rows = logsToExport.map(log => {
      const block = parseInt(log.blockNumber, 16)
      const timestamp = log.timeStamp
        ? new Date(parseInt(log.timeStamp, 16) * 1000).toISOString()
        : ''
      const txHash = log.transactionHash
      const eventName = log.decodedName || 'Unknown'
      const topics = log.topics?.join('; ') || ''
      const data = log.data || ''
      const decodedArgs = log.decodedArgs
        ? JSON.stringify(log.decodedArgs, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
          )
        : ''
      return [block, timestamp, txHash, eventName, topics, data, decodedArgs]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `event_logs_${address.slice(0, 10)}_${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Parse and evaluate boolean filter expression for logs
  // Syntax: field op value [and|or field op value ...]
  // Fields: event, args.*, topic0-3, data, block, tx
  // Operators: =, !=, >, <, >=, <=, contains
  const parseFilterExpression = (expr) => {
    if (!expr.trim()) return () => true

    // Tokenize: split by and/or while preserving them, handle quoted strings
    const tokenize = (str) => {
      const tokens = []
      let current = ''
      let inQuote = false
      let quoteChar = ''

      for (let i = 0; i < str.length; i++) {
        const char = str[i]

        if ((char === '"' || char === "'") && !inQuote) {
          inQuote = true
          quoteChar = char
          current += char
        } else if (char === quoteChar && inQuote) {
          inQuote = false
          current += char
          quoteChar = ''
        } else if (!inQuote && (char === ' ' || char === '\t')) {
          if (current.trim()) {
            tokens.push(current.trim())
            current = ''
          }
        } else {
          current += char
        }
      }
      if (current.trim()) tokens.push(current.trim())
      return tokens
    }

    // Parse a single condition: field op value
    const parseCondition = (tokens, startIdx) => {
      if (startIdx >= tokens.length) return { condition: null, nextIdx: startIdx }

      const field = tokens[startIdx]
      if (!field || field.toLowerCase() === 'and' || field.toLowerCase() === 'or') {
        return { condition: null, nextIdx: startIdx }
      }

      const op = tokens[startIdx + 1]
      let value = tokens[startIdx + 2]

      if (!op || !value) return { condition: null, nextIdx: startIdx + 1 }

      // Remove quotes from value
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      return {
        condition: { field: field.toLowerCase(), op: op.toLowerCase(), value },
        nextIdx: startIdx + 3
      }
    }

    // Evaluate a condition against a log
    const evalCondition = (cond, log) => {
      if (!cond) return true

      const { field, op, value } = cond
      let logValue = null

      // Get field value from log
      if (field === 'event') {
        logValue = log.decodedName || ''
      } else if (field.startsWith('args.')) {
        const argName = field.slice(5)
        if (log.decodedArgs) {
          logValue = log.decodedArgs[argName]
          if (typeof logValue === 'bigint') logValue = logValue.toString()
          else if (logValue !== undefined) logValue = String(logValue)
        }
      } else if (field.startsWith('topic')) {
        const idx = parseInt(field.slice(5)) || 0
        logValue = log.topics?.[idx] || ''
      } else if (field === 'data') {
        logValue = log.data || ''
      } else if (field === 'block') {
        logValue = parseInt(log.blockNumber, 16)
      } else if (field === 'tx') {
        logValue = log.transactionHash || ''
      } else {
        return true // Unknown field, pass through
      }

      if (logValue === null || logValue === undefined) logValue = ''

      // Compare based on operator
      const strValue = String(logValue).toLowerCase()
      const compareValue = String(value).toLowerCase()

      switch (op) {
        case '=':
        case '==':
          return strValue === compareValue
        case '!=':
        case '<>':
          return strValue !== compareValue
        case 'contains':
          return strValue.includes(compareValue)
        case '>':
          return Number(logValue) > Number(value)
        case '<':
          return Number(logValue) < Number(value)
        case '>=':
          return Number(logValue) >= Number(value)
        case '<=':
          return Number(logValue) <= Number(value)
        default:
          return strValue.includes(compareValue) // Default to contains
      }
    }

    // Parse the full expression
    const tokens = tokenize(expr)
    const conditions = []
    const operators = []
    let idx = 0

    while (idx < tokens.length) {
      const token = tokens[idx].toLowerCase()
      if (token === 'and' || token === 'or') {
        operators.push(token)
        idx++
      } else {
        const { condition, nextIdx } = parseCondition(tokens, idx)
        if (condition) {
          conditions.push(condition)
        }
        idx = nextIdx
      }
    }

    // Return evaluator function
    return (log) => {
      if (conditions.length === 0) return true

      let result = evalCondition(conditions[0], log)
      for (let i = 0; i < operators.length && i + 1 < conditions.length; i++) {
        const nextResult = evalCondition(conditions[i + 1], log)
        if (operators[i] === 'and') {
          result = result && nextResult
        } else {
          result = result || nextResult
        }
      }
      return result
    }
  }

  // Filter fetched logs using boolean expression
  const getFilteredLogs = () => {
    if (!logsFilter.trim()) return eventLogs
    try {
      const evaluator = parseFilterExpression(logsFilter)
      return eventLogs.filter(evaluator)
    } catch {
      return eventLogs // On parse error, return all
    }
  }

  // Load history, cached addresses, and Tenderly settings on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
      setCachedAddresses(getCachedAddresses())

      // Load cached token symbols
      const symbols = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(TOKEN_SYMBOL_CACHE_PREFIX)) {
          const [, chainAndAddress] = key.split(TOKEN_SYMBOL_CACHE_PREFIX)
          const dashIndex = chainAndAddress.indexOf('-')
          if (dashIndex !== -1) {
            const addr = chainAndAddress.substring(dashIndex + 1)
            symbols[addr] = localStorage.getItem(key)
          }
        }
      }
      setTokenSymbols(symbols)

      // Load Tenderly settings
      const savedTenderly = localStorage.getItem(TENDERLY_SETTINGS_KEY)
      if (savedTenderly) {
        setTenderlySettings(JSON.parse(savedTenderly))
      }

      // Load API keys
      const savedApiKeys = localStorage.getItem(API_KEYS_STORAGE_KEY)
      if (savedApiKeys) {
        setApiKeys(JSON.parse(savedApiKeys))
      }

      // Load RPC settings
      const savedRpcSettings = localStorage.getItem(RPC_SETTINGS_KEY)
      if (savedRpcSettings) {
        setRpcSettings(JSON.parse(savedRpcSettings))
      }

      // Load simulation settings
      const savedSimSettings = localStorage.getItem(SIMULATION_SETTINGS_KEY)
      if (savedSimSettings) {
        const parsed = JSON.parse(savedSimSettings)
        if (typeof parsed.useLocalSimulation === 'boolean') {
          setUseLocalSimulation(parsed.useLocalSimulation)
        }
        if (typeof parsed.rpcBatchSize === 'number' && parsed.rpcBatchSize >= 1) {
          setRpcBatchSize(parsed.rpcBatchSize)
        }
      }

      // Load address book
      setAddressBook(getAddressBook())

      // Load custom chains
      const savedCustomChains = localStorage.getItem(CUSTOM_CHAINS_KEY)
      if (savedCustomChains) {
        setCustomChains(JSON.parse(savedCustomChains))
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }, [])

  // Load from URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlChain = params.get('chain')
    const urlAddress = params.get('address')
    const urlFunction = params.get('function')
    const urlArgs = params.get('args')
    const urlFrom = params.get('from')
    const urlValue = params.get('value')

    if (urlAddress) {
      // Set chain first if provided - check both built-in and custom chains
      if (urlChain) {
        const isBuiltIn = CHAINS.some(c => c.id === urlChain)
        let isCustom = false
        try {
          const savedCustomChains = localStorage.getItem(CUSTOM_CHAINS_KEY)
          if (savedCustomChains) {
            const parsed = JSON.parse(savedCustomChains)
            isCustom = parsed.some(c => c.id === urlChain)
          }
        } catch (e) {}
        if (isBuiltIn || isCustom) {
          setChain(urlChain)
        }
      }

      setAddress(urlAddress)

      // Store pending args to be applied after ABI loads
      if (urlFunction) {
        let parsedArgs = []
        if (urlArgs) {
          try {
            parsedArgs = JSON.parse(urlArgs)
          } catch (e) {
            console.error('Failed to parse URL args:', e)
          }
        }

        pendingHistoryRef.current = {
          functionName: urlFunction,
          args: parsedArgs,
          timestamp: Date.now()
        }

        // Set selected function (will be applied after ABI loads)
        setTimeout(() => {
          setSelectedFunction(urlFunction)
        }, 100)
      }

      if (urlFrom) {
        setFromAddress(urlFrom)
      }

      if (urlValue) {
        setEthValue(urlValue)
      }

      // Auto-fetch ABI after a short delay
      setTimeout(() => {
        const fetchButton = document.querySelector('[data-fetch-abi]')
        if (fetchButton) {
          fetchButton.click()
        }
      }, 200)
    }
  }, [])

  // Auto-load cached ABI when address or chain changes
  useEffect(() => {
    if (!isValidEthAddress(address)) {
      setContractName(null)
      return
    }

    const cached = getCachedAbi(chain, address)
    if (cached) {
      setAbi(formatAbiCompact(cached.abi))
      const nameDisplay = cached.isProxy && cached.implContractName
        ? `${cached.contractName} → ${cached.implContractName}`
        : cached.contractName
      setContractName(nameDisplay)
      setAbiSource(cached.isProxy ? `cached (proxy → ${cached.implAddress?.slice(0, 10)}...)` : 'cached')
    } else {
      // Clear ABI when switching to uncached contract
      setAbi('')
      setParsedAbi(null)
      setAbiSource(null)
      setContractName(null)
    }
  }, [chain, address])

  // Parse ABI when it changes
  useEffect(() => {
    if (!abi.trim()) {
      setParsedAbi(null)
      setFunctions([])
      setSelectedFunction('')
      return
    }

    try {
      const parsed = JSON.parse(abi)
      setParsedAbi(parsed)

      // Get all functions (both read and write)
      const allFunctions = parsed.filter(
        (item) => item.type === 'function'
      )

      // Sort: view/pure first, then others
      allFunctions.sort((a, b) => {
        const aIsRead = a.stateMutability === 'view' || a.stateMutability === 'pure'
        const bIsRead = b.stateMutability === 'view' || b.stateMutability === 'pure'
        if (aIsRead && !bIsRead) return -1
        if (!aIsRead && bIsRead) return 1
        return a.name.localeCompare(b.name)
      })

      setFunctions(allFunctions)
      // Don't reset selectedFunction if we have pending history waiting
      if (pendingHistoryRef.current) {
        setSelectedFunction(pendingHistoryRef.current.functionName)
      } else {
        setSelectedFunction('')
        setArgs([])
      }
      setError(null)
    } catch (err) {
      setParsedAbi(null)
      setFunctions([])
      setError('Invalid ABI JSON format')
    }
  }, [abi])

  // Update args when selected function changes
  useEffect(() => {
    if (!selectedFunction || !parsedAbi) {
      // Don't reset args if we have pending history waiting
      if (!pendingHistoryRef.current) {
        setArgs([])
      }
      return
    }

    const func = parsedAbi.find(
      (item) => item.type === 'function' && item.name === selectedFunction
    )

    // If we have pending args from history, try to apply them
    if (pendingHistoryRef.current !== null) {
      const pending = pendingHistoryRef.current
      const pendingArgs = pending.args || []

      // Check if this is the function we're waiting for
      if (pending.functionName === selectedFunction && func) {
        const expectedInputs = func.inputs?.length || 0

        // If args count matches, apply them
        if (pendingArgs.length === expectedInputs) {
          pendingHistoryRef.current = null
          setArgs(pendingArgs)
          return
        }
      }
      // Still waiting for correct ABI to load, don't reset args
      return
    }

    // No pending history - normal function switch, reset args
    if (func && func.inputs) {
      setArgs(func.inputs.map(input => getDefaultValue(input)))
    } else {
      setArgs([])
    }
  }, [selectedFunction, parsedAbi, address])

  // Fetch token symbols for Transfer events
  const fetchTokenSymbolsForLogs = async (logs, chainId) => {
    if (!logs || logs.length === 0) return

    // Find unique addresses that emitted Transfer events
    const transferAddresses = new Set()
    for (const log of logs) {
      if (log.name === 'Transfer' && log.address) {
        const addr = log.address.toLowerCase()
        // Only fetch if not already cached
        if (!getCachedTokenSymbol(chain, addr) && !tokenSymbols[addr]) {
          transferAddresses.add(addr)
        }
      }
    }

    if (transferAddresses.size === 0) return

    // Fetch symbols in parallel
    const newSymbols = { ...tokenSymbols }
    const fetchPromises = Array.from(transferAddresses).map(async (addr) => {
      try {
        const response = await fetch('/api/call-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain,
            address: addr,
            functionName: 'symbol',
            args: [],
            abi: ERC20_SYMBOL_ABI,
            rpcUrl: rpcSettings[chain] || undefined,
            chainId: chainId,
          }),
        })
        const data = await response.json()
        if (response.ok && data.decoded && data.decoded.length > 0) {
          const symbol = data.decoded[0].value
          newSymbols[addr] = symbol
          setCachedTokenSymbol(chain, addr, symbol)
        }
      } catch {
        // Ignore errors for individual symbol fetches
      }
    })

    await Promise.all(fetchPromises)
    setTokenSymbols(newSymbols)
  }

  const fetchAbi = async (forceRefresh = false) => {
    if (!address.trim()) {
      setError('Please enter a contract address')
      return
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedAbi(chain, address)
      if (cached) {
        setAbi(formatAbiCompact(cached.abi))
        const nameDisplay = cached.isProxy && cached.implContractName
          ? `${cached.contractName} → ${cached.implContractName}`
          : cached.contractName
        setContractName(nameDisplay)
        setAbiSource(cached.isProxy ? `cached (proxy → ${cached.implAddress?.slice(0, 10)}...)` : 'cached')
        return
      }
    }

    setFetchingAbi(true)
    setError(null)

    try {
      const params = new URLSearchParams({ address, chain })
      if (apiKeys.etherscan) {
        params.set('apiKey', apiKeys.etherscan)
      }
      // Pass custom RPC if configured for this chain
      if (rpcSettings[chain]) {
        params.set('rpcUrl', rpcSettings[chain])
      }
      // Pass chain ID for custom chains
      const chainIdForApi = getChainId(chain)
      if (chainIdForApi) {
        params.set('chainId', chainIdForApi.toString())
      }
      if (detectProxy) {
        params.set('detectProxy', 'true')
      }
      const response = await fetch(`/api/fetch-abi?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch ABI')
      }

      // Cache the fetched ABI
      setCachedAbi(chain, address, data.abi, data.isProxy, data.implAddress, data.contractName, data.implContractName)

      // Update cached addresses list
      setCachedAddresses(getCachedAddresses())

      setAbi(formatAbiCompact(data.abi))
      const nameDisplay = data.isProxy && data.implContractName
        ? `${data.contractName} → ${data.implContractName}`
        : data.contractName
      setContractName(nameDisplay)
      setAbiSource(data.isProxy ? `fetched (proxy → ${data.implAddress?.slice(0, 10)}...)` : 'fetched')
      // Expand ABI when first fetched from remote
      setAbiCollapsed(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setFetchingAbi(false)
    }
  }

  // Save current ABI to local cache
  const saveAbiToCache = () => {
    if (!address || !abi) return

    try {
      const parsedAbiToSave = JSON.parse(abi)
      // Get existing cached data to preserve proxy metadata
      const existingCache = getCachedAbi(chain, address)
      setCachedAbi(
        chain,
        address,
        parsedAbiToSave,
        existingCache?.isProxy || false,
        existingCache?.implAddress || null,
        existingCache?.contractName || contractName,
        existingCache?.implContractName || null
      )
      // Update cached addresses list
      setCachedAddresses(getCachedAddresses())
      // Show feedback
      setAbiSaved(true)
      setTimeout(() => setAbiSaved(false), 2000)
      // Update source to indicate it's now cached
      if (!abiSource?.includes('cached')) {
        setAbiSource('cached (manual)')
      }
    } catch (err) {
      setError('Failed to save ABI: Invalid JSON format')
    }
  }

  const saveToHistory = (callData, output, isWrite) => {
    // Create unique key for dedup (chain + address + function + args)
    const callKey = `${chain}-${address.toLowerCase()}-${selectedFunction}-${JSON.stringify(args)}`

    // Check if same call exists and update timestamp, or add new
    const existingIndex = history.findIndex(item => {
      const itemKey = `${item.chain}-${item.address.toLowerCase()}-${item.functionName}-${JSON.stringify(item.args)}`
      return itemKey === callKey
    })

    let newHistory
    if (existingIndex !== -1) {
      // Update existing item with new timestamp and output, move to top
      const updatedItem = {
        ...history[existingIndex],
        fromAddress,
        output,
        isWrite,
        timestamp: new Date().toISOString(),
      }
      newHistory = [
        updatedItem,
        ...history.slice(0, existingIndex),
        ...history.slice(existingIndex + 1)
      ]
    } else {
      // Add new item
      const historyItem = {
        id: Date.now(),
        chain,
        address,
        functionName: selectedFunction,
        args: [...args],
        fromAddress,
        output,
        contractName,
        isWrite,
        timestamp: new Date().toISOString(),
      }
      newHistory = [historyItem, ...history].slice(0, MAX_HISTORY_ITEMS)
    }

    setHistory(newHistory)

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
    } catch (err) {
      console.error('Failed to save history:', err)
    }
  }

  const loadFromHistory = (item) => {
    const historyArgs = item.args || []
    const sameContract = address && item.address && address.toLowerCase() === item.address.toLowerCase()
    const sameFunction = selectedFunction === item.functionName

    // If same contract and same function, directly set args
    if (sameContract && sameFunction) {
      setArgs(historyArgs)
      setChain(item.chain)
      setFromAddress(item.fromAddress || '')
      setResult(item.output)
      setError(null)
      return
    }

    // Store pending history for the useEffect to handle after state updates
    pendingHistoryRef.current = {
      functionName: item.functionName,
      args: historyArgs,
      timestamp: Date.now()
    }

    setChain(item.chain)
    setAddress(item.address)
    setFromAddress(item.fromAddress || '')
    setSelectedFunction(item.functionName)
    setResult(item.output)
    setError(null)
  }

  const clearHistory = () => {
    if (!window.confirm('Are you sure you want to clear all history?')) {
      return
    }
    setHistory([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (err) {
      console.error('Failed to clear history:', err)
    }
  }

  const saveTenderlySettings = (settings) => {
    setTenderlySettings(settings)
    try {
      localStorage.setItem(TENDERLY_SETTINGS_KEY, JSON.stringify(settings))
    } catch (err) {
      console.error('Failed to save Tenderly settings:', err)
    }
  }

  const saveApiKeys = (keys) => {
    setApiKeys(keys)
    try {
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys))
    } catch (err) {
      console.error('Failed to save API keys:', err)
    }
  }

  const saveRpcSettings = (settings) => {
    setRpcSettings(settings)
    try {
      localStorage.setItem(RPC_SETTINGS_KEY, JSON.stringify(settings))
    } catch (err) {
      console.error('Failed to save RPC settings:', err)
    }
  }

  const isTenderlyConfigured = () => {
    return tenderlySettings.accessKey && tenderlySettings.account && tenderlySettings.project
  }

  const isEtherscanConfigured = () => {
    return !!apiKeys.etherscan
  }

  const testEtherscanKey = async () => {
    if (!apiKeys.etherscan) return

    setTestingEtherscan(true)
    setEtherscanTestResult(null)

    try {
      // Test with a simple balance check using Etherscan V2 API
      const testAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
      const response = await fetch(
        `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${testAddress}&tag=latest&apikey=${apiKeys.etherscan}`
      )
      const data = await response.json()

      if (data.status === '1' || data.message === 'OK') {
        setEtherscanTestResult('success')
      } else {
        setEtherscanTestResult('error')
      }
    } catch (err) {
      setEtherscanTestResult('error')
    } finally {
      setTestingEtherscan(false)
      // Clear result after 3 seconds
      setTimeout(() => setEtherscanTestResult(null), 3000)
    }
  }

  const testTenderlyKey = async () => {
    if (!tenderlySettings.accessKey || !tenderlySettings.account || !tenderlySettings.project) return

    setTestingTenderly(true)
    setTenderlyTestResult(null)

    try {
      // Test by fetching project info
      const response = await fetch(
        `https://api.tenderly.co/api/v1/account/${tenderlySettings.account}/project/${tenderlySettings.project}`,
        {
          headers: {
            'X-Access-Key': tenderlySettings.accessKey,
          },
        }
      )

      if (response.ok) {
        setTenderlyTestResult('success')
      } else {
        setTenderlyTestResult('error')
      }
    } catch (err) {
      setTenderlyTestResult('error')
    } finally {
      setTestingTenderly(false)
      // Clear result after 3 seconds
      setTimeout(() => setTenderlyTestResult(null), 3000)
    }
  }

  const testRpcEndpoint = async (chainId) => {
    const rpcUrl = rpcSettings[chainId]
    if (!rpcUrl) return

    setTestingRpc(prev => ({ ...prev, [chainId]: true }))
    setRpcTestResult(prev => ({ ...prev, [chainId]: null }))

    try {
      // Call eth_chainId to validate the RPC endpoint
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        }),
      })

      if (!response.ok) {
        setRpcTestResult(prev => ({ ...prev, [chainId]: 'error' }))
        return
      }

      const data = await response.json()

      if (data.error) {
        setRpcTestResult(prev => ({ ...prev, [chainId]: 'error' }))
        return
      }

      // Validate chain ID matches expected
      const returnedChainId = parseInt(data.result, 16)
      const expectedChainId = getChainId(chainId)

      if (returnedChainId === expectedChainId) {
        setRpcTestResult(prev => ({ ...prev, [chainId]: 'success' }))
      } else {
        setRpcTestResult(prev => ({ ...prev, [chainId]: 'mismatch' }))
      }
    } catch (err) {
      setRpcTestResult(prev => ({ ...prev, [chainId]: 'error' }))
    } finally {
      setTestingRpc(prev => ({ ...prev, [chainId]: false }))
      // Clear result after 3 seconds
      setTimeout(() => setRpcTestResult(prev => ({ ...prev, [chainId]: null })), 3000)
    }
  }

  // Fetch chainlist data from chainlist.org
  const fetchChainlistData = async () => {
    if (chainlistData.length > 0) return // Already loaded

    setChainlistLoading(true)
    setChainlistError(null)

    try {
      const response = await fetch('https://chainlist.org/rpcs.json')
      if (!response.ok) {
        throw new Error('Failed to fetch chainlist data')
      }
      const data = await response.json()
      // Filter out testnets and sort by TVL (higher first)
      const mainnets = data
        .filter(chain => !chain.isTestnet && chain.chainId)
        .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
      setChainlistData(mainnets)
    } catch (err) {
      console.error('Failed to fetch chainlist:', err)
      setChainlistError('Failed to load chain data. Please try again.')
    } finally {
      setChainlistLoading(false)
    }
  }

  // Get the best RPC URL from a chain's RPC list
  const getBestRpcUrl = (rpcs) => {
    if (!rpcs || rpcs.length === 0) return null
    // Prefer RPCs with no tracking or limited tracking
    const sortedRpcs = [...rpcs].sort((a, b) => {
      const trackingOrder = { none: 0, limited: 1, yes: 2, undefined: 3 }
      const aTracking = typeof a === 'string' ? 'undefined' : (a.tracking || 'undefined')
      const bTracking = typeof b === 'string' ? 'undefined' : (b.tracking || 'undefined')
      return (trackingOrder[aTracking] || 3) - (trackingOrder[bTracking] || 3)
    })
    // Get the URL from the first valid RPC
    for (const rpc of sortedRpcs) {
      const url = typeof rpc === 'string' ? rpc : rpc.url
      // Skip RPCs that require API keys (contain ${...})
      if (url && !url.includes('${') && url.startsWith('http')) {
        return url
      }
    }
    return null
  }

  // Add a custom chain
  const addCustomChain = (chainData) => {
    const chainId = `chain-${chainData.chainId}`

    // Check if already added
    if (customChains.some(c => c.id === chainId)) {
      return false
    }

    // Check if it's a built-in chain
    if (CHAINS.some(c => c.id === chainId || BUILT_IN_CHAIN_IDS[c.id] === chainData.chainId)) {
      return false
    }

    const bestRpc = getBestRpcUrl(chainData.rpc)

    const newChain = {
      id: chainId,
      name: chainData.name,
      chainId: chainData.chainId,
      icon: chainData.icon
        ? `https://icons.llamao.fi/icons/chains/rsz_${chainData.icon}.jpg`
        : null,
      nativeCurrency: chainData.nativeCurrency,
      rpcUrl: bestRpc,
      explorers: chainData.explorers || [],
    }

    const updatedChains = [...customChains, newChain]
    setCustomChains(updatedChains)
    localStorage.setItem(CUSTOM_CHAINS_KEY, JSON.stringify(updatedChains))

    // Also save the RPC URL to rpcSettings
    if (bestRpc) {
      const newRpcSettings = { ...rpcSettings, [chainId]: bestRpc }
      setRpcSettings(newRpcSettings)
      localStorage.setItem(RPC_SETTINGS_KEY, JSON.stringify(newRpcSettings))
    }

    return true
  }

  // Remove a custom chain
  const removeCustomChain = (chainId) => {
    const updatedChains = customChains.filter(c => c.id !== chainId)
    setCustomChains(updatedChains)
    localStorage.setItem(CUSTOM_CHAINS_KEY, JSON.stringify(updatedChains))

    // Also remove RPC setting if exists
    if (rpcSettings[chainId]) {
      const newRpcSettings = { ...rpcSettings }
      delete newRpcSettings[chainId]
      setRpcSettings(newRpcSettings)
      localStorage.setItem(RPC_SETTINGS_KEY, JSON.stringify(newRpcSettings))
    }

    // If current chain is removed, switch to ethereum
    if (chain === chainId) {
      setChain('ethereum')
    }
  }

  // Filter chainlist data based on search
  const getFilteredChainlist = () => {
    if (!chainlistSearch.trim()) {
      return chainlistData.slice(0, 50) // Show top 50 by TVL
    }
    const search = chainlistSearch.toLowerCase()
    return chainlistData
      .filter(chain =>
        chain.name?.toLowerCase().includes(search) ||
        chain.chain?.toLowerCase().includes(search) ||
        String(chain.chainId).includes(search)
      )
      .slice(0, 50)
  }

  // Check if a chainlist chain is already added
  const isChainAdded = (chainData) => {
    const chainId = `chain-${chainData.chainId}`
    return customChains.some(c => c.id === chainId) ||
           Object.values(BUILT_IN_CHAIN_IDS).includes(chainData.chainId)
  }

  // Helper to get ETH value with unit info
  const getEthValueWithUnit = () => {
    if (!ethValue || ethValue.trim() === '') return { value: undefined, unit: 'ETH' }
    // Validate the value is a valid number
    try {
      if (ethValueUnit === 'Wei') {
        BigInt(ethValue) // Validate it's a valid integer for Wei
      } else {
        parseFloat(ethValue) // Validate it's a valid number for ETH
      }
    } catch {
      return { value: undefined, unit: ethValueUnit }
    }
    return { value: ethValue, unit: ethValueUnit }
  }

  const handleCall = async () => {
    // Clear previous field errors
    setFieldErrors({})

    if (!address || !selectedFunction || !parsedAbi) {
      const errors = {}
      if (!address || !isValidEthAddress(address)) errors.address = true
      setFieldErrors(errors)
      setError('Please fill in all required fields')
      return
    }

    const selectedFunc = getSelectedFunction()
    const isWrite = !isReadOnly(selectedFunc)

    // Check simulation configuration for write functions
    if (isWrite && !useLocalSimulation && !isTenderlyConfigured()) {
      setError('Please configure Tenderly API settings or enable Local Simulation to simulate write functions')
      setShowSettings(true)
      return
    }

    // Validate all input fields
    const errors = {}

    // Contract address validation
    if (!isValidEthAddress(address)) {
      errors.address = true
    }

    // From address validation for write functions
    if (isWrite && !isValidEthAddress(fromAddress)) {
      errors.fromAddress = true
    }

    // Fork block validation for simulation
    if (isWrite && forkBlockNumber && !isValidForkBlock(forkBlockNumber)) {
      errors.forkBlockNumber = true
    }

    // ETH value validation for payable functions
    if (selectedFunc && isPayable(selectedFunc) && ethValue && !isValidNumber(ethValue)) {
      errors.ethValue = true
    }

    // Cheatcode validation for local simulation
    if (isWrite && useLocalSimulation) {
      if (cheatcodes.deal.enabled) {
        if (cheatcodes.deal.address && !isValidEthAddress(cheatcodes.deal.address)) {
          errors.dealAddress = true
        }
        if (cheatcodes.deal.amount && !isValidNumber(cheatcodes.deal.amount)) {
          errors.dealAmount = true
        }
      }
      if (cheatcodes.prank.enabled && cheatcodes.prank.address && !isValidEthAddress(cheatcodes.prank.address)) {
        errors.prankAddress = true
      }
      if (cheatcodes.warp.enabled && cheatcodes.warp.timestamp && !isValidPositiveInteger(cheatcodes.warp.timestamp)) {
        errors.warpTimestamp = true
      }
    }

    // Validate function arguments (addresses in all types including tuples)
    if (selectedFunc && selectedFunc.inputs) {
      const argErrors = []
      selectedFunc.inputs.forEach((input, index) => {
        const argValue = args[index]
        validateAddressesInArg(argValue, input, errors, index, argErrors)
      })
      if (argErrors.length > 0) {
        errors.argErrors = argErrors
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const errorMessages = []
      if (errors.address) errorMessages.push('Contract Address must be a valid Ethereum address')
      if (errors.fromAddress) errorMessages.push('From Address must be a valid Ethereum address')
      if (errors.forkBlockNumber) errorMessages.push('Fork Block must be empty, "latest", or a valid block number')
      if (errors.ethValue) errorMessages.push('ETH Value must be a valid number')
      if (errors.dealAddress) errorMessages.push('Deal address must be a valid Ethereum address')
      if (errors.dealAmount) errorMessages.push('Deal amount must be a valid number')
      if (errors.prankAddress) errorMessages.push('Prank address must be a valid Ethereum address')
      if (errors.warpTimestamp) errorMessages.push('Warp timestamp must be a valid positive integer')
      if (errors.argErrors) errorMessages.push(...errors.argErrors)
      setError(errorMessages.join('; '))
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      let data

      // Use local Tevm simulation for write functions if enabled
      if (isWrite && useLocalSimulation) {
        // Build cheatcodes object
        const activeCheatcodes = {}
        if (cheatcodes.deal.enabled && cheatcodes.deal.address && cheatcodes.deal.amount) {
          activeCheatcodes.deal = {
            address: cheatcodes.deal.address,
            amount: cheatcodes.deal.amount,
          }
        }
        if (cheatcodes.prank.enabled && cheatcodes.prank.address) {
          activeCheatcodes.prank = {
            address: cheatcodes.prank.address,
          }
        }
        if (cheatcodes.warp.enabled && cheatcodes.warp.timestamp) {
          activeCheatcodes.warp = {
            timestamp: parseInt(cheatcodes.warp.timestamp),
          }
        }

        const ethValueInfo = getEthValueWithUnit()
        const chainIdForSimulation = getChainId(chain)

        // Build initial ABI cache from localStorage
        const initialAbiCache = buildAbiCacheFromStorage(chain)
        // Also add the current contract's ABI to the cache
        initialAbiCache.set(address.toLowerCase(), parsedAbi)

        const abortController = new AbortController()
        simAbortRef.current = abortController
        setSimProgress(0)

        data = await simulateWithTevm({
          chain,
          address,
          functionName: selectedFunction,
          args,
          abi: parsedAbi,
          fromAddress: fromAddress || undefined,
          value: ethValueInfo.value,
          valueUnit: ethValueInfo.unit,
          rpcUrl: rpcSettings[chain] || undefined,
          blockNumber: forkBlockNumber || 'latest',
          cheatcodes: activeCheatcodes,
          customChainId: chainIdForSimulation,
          abiCache: initialAbiCache,
          onProgress: (pct) => setSimProgress(pct),
          abortSignal: abortController.signal,
          rpcBatchSize,
        })
        setSimProgress(100)

        // If there are undecoded addresses, fetch their ABIs and re-decode
        if (data.undecodedAddresses && data.undecodedAddresses.length > 0) {
          // Filter out addresses we already have in cache
          const addressesToFetch = data.undecodedAddresses.filter(
            addr => !initialAbiCache.has(addr.toLowerCase())
          )

          if (addressesToFetch.length > 0) {
            // Fetch ABIs for undecoded addresses
            const newAbis = await fetchAbisForAddresses(
              chain,
              addressesToFetch,
              apiKeys.etherscan,
              rpcSettings[chain],
              chainIdForSimulation
            )

            // Merge new ABIs into cache
            for (const [addr, abi] of newAbis) {
              initialAbiCache.set(addr, abi)
            }

            // Re-decode logs with the updated cache
            if (newAbis.size > 0) {
              data.logs = redecodeLogs(data.logs, initialAbiCache)
              // Recursively re-decode logs in every frame of the call trace tree
              if (data.callTrace) {
                data.callTrace = redecodeCallTrace(data.callTrace, initialAbiCache)
                // Keep flat logs in sync with the re-decoded tree
                data.logs = redecodeLogs(data.logs, initialAbiCache)
              }
            }
          }
        }

        // Fall back to abi_server for any logs still undecoded after the ABI-fetch pass
        // (covers unverified contracts whose ABIs aren't on Etherscan)
        await decodeLogsViaServer(data.logs)
        if (data.callTrace) {
          await decodeCallTraceLogsViaServer(data.callTrace)
        }

        // Update the cached addresses list in state
        setCachedAddresses(getCachedAddresses())
      } else {
        // Use API for read functions or Tenderly for write functions
        const apiEndpoint = isWrite ? '/api/simulate' : '/api/call-contract'

        const requestBody = {
          chain,
          address,
          functionName: selectedFunction,
          args,
          abi: parsedAbi,
        }

        // Add chain ID for custom chains
        const chainIdForApi = getChainId(chain)
        if (chainIdForApi) {
          requestBody.chainId = chainIdForApi
        }

        // Add custom RPC if configured for this chain
        if (rpcSettings[chain]) {
          requestBody.rpcUrl = rpcSettings[chain]
        }

        // Add block number for read-only calls
        if (!isWrite && readBlockNumber) {
          requestBody.blockNumber = readBlockNumber
        }

        // Add Tenderly credentials for write functions
        if (isWrite) {
          requestBody.fromAddress = fromAddress || undefined
          requestBody.tenderlyAccessKey = tenderlySettings.accessKey
          requestBody.tenderlyAccount = tenderlySettings.account
          requestBody.tenderlyProject = tenderlySettings.project
          // Add block number for simulation
          if (forkBlockNumber) {
            requestBody.blockNumber = forkBlockNumber
          }
          // Add ETH value for payable functions
          const ethValueInfo = getEthValueWithUnit()
          if (ethValueInfo.value) {
            requestBody.value = ethValueInfo.value
            requestBody.valueUnit = ethValueInfo.unit
          }
          // Add state overrides for Tenderly simulation
          if (balanceOverrides.length > 0 || storageOverrides.length > 0) {
            requestBody.stateOverrides = {}
            if (balanceOverrides.length > 0) {
              requestBody.stateOverrides.balances = balanceOverrides.filter(o => o.address && o.balance)
            }
            if (storageOverrides.length > 0) {
              requestBody.stateOverrides.storage = storageOverrides.filter(o => o.address && o.slot && o.value)
            }
          }
          // Add block header overrides for Tenderly simulation
          if (timestampOverride) {
            requestBody.blockHeaderOverrides = {
              timestamp: timestampOverride
            }
          }
        }

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to call contract')
        }
      }

      // For simulation, check if it was successful
      if (isWrite && data.success === false) {
        setError(data.error || 'Simulation failed: transaction would revert')
        setResult(data) // Still show result for debugging
      } else {
        setResult(data)
      }
      // Auto-collapse event logs when there are many of them
      setSimLogsExpanded(!data.logs || data.logs.length <= 10)

      // Fetch token symbols for Transfer events (async, non-blocking)
      if (data.logs && data.logs.length > 0) {
        const chainIdForSymbols = getChainId(chain)
        fetchTokenSymbolsForLogs(data.logs, chainIdForSymbols)
      }

      saveToHistory({ chain, address, selectedFunction, args }, data, isWrite)
    } catch (err) {
      if (err.message === 'Simulation cancelled') {
        setError(null)
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
      setSimProgress(null)
      simAbortRef.current = null
    }
  }

  const getSelectedFunctionInputs = () => {
    if (!selectedFunction || !parsedAbi) return []
    const func = parsedAbi.find(
      (item) => item.type === 'function' && item.name === selectedFunction
    )
    return func?.inputs || []
  }

  const syntaxHighlight = (obj) => {
    const json = JSON.stringify(obj, null, 2)
    const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = styles.jsonNumber
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = styles.jsonKey
          } else {
            cls = styles.jsonString
          }
        } else if (/true|false/.test(match)) {
          cls = styles.jsonBoolean
        } else if (/null/.test(match)) {
          cls = styles.jsonNull
        }
        return `<span class="${cls}">${match}</span>`
      }
    )
  }

  const getDisplayContent = () => {
    if (!result) return ''
    if (isYaml) {
      const yamlStr = yaml.dump(result, { indent: 2, lineWidth: -1, noRefs: true })
      return yamlStr
    }
    return syntaxHighlight(result)
  }

  // Copy tooltip content to clipboard
  const copyTooltipContent = async (content) => {
    try {
      await navigator.clipboard.writeText(content)
      setHideTooltip(true)
      // Reset hide state after a short delay so tooltip can show again on next hover
      setTimeout(() => setHideTooltip(false), 300)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Format a value for display (truncate long strings, format arrays)
  const formatValue = (value) => {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'object') {
      const str = JSON.stringify(value)
      return str.length > 60 ? str.slice(0, 60) + '...' : str
    }
    const str = String(value)
    return str.length > 60 ? str.slice(0, 30) + '...' + str.slice(-20) : str
  }

  // Render call trace node recursively as a tree
  const renderCallTraceNode = (trace, depth) => {
    if (!trace) return null
    if (trace.type === 'STATICCALL') return null

    // Build function signature: ContractName.functionName(param1=value1, param2=value2)
    const contractName = trace.toName || trace.to?.slice(0, 10) + '...'
    const contractAddress = trace.to || ''
    const funcName = trace.functionName || trace.input?.slice(0, 10) || '()'
    const inputParams = trace.decodedInputs?.map(p => `${p.name}=${formatValue(p.value)}`).join(', ') || ''
    // For outputs: if name is empty or 'unknown', just show the value
    const outputParams = trace.decodedOutputs?.map(p => {
      const hasName = p.name && p.name !== 'unknown' && p.name !== ''
      return hasName ? `${p.name}=${formatValue(p.value)}` : formatValue(p.value)
    }).join(', ') || ''

    return (
      <div key={depth} className={styles.traceNode}>
        {/* Main call line */}
        <div className={`${styles.traceCall} ${trace.error ? styles.traceCallError : ''}`}>
          <span className={styles.traceType}>{trace.type}</span>
          <span className={styles.traceSignature}>
            <span className={styles.traceContractWrapper}>
              <span className={styles.traceContract}>{contractName}</span>
              {!hideTooltip && (
                <span className={styles.traceTooltip}>
                  <span className={styles.traceTooltipContent}>{contractAddress}</span>
                  <button
                    className={styles.traceTooltipCopy}
                    onClick={(e) => {
                      e.stopPropagation()
                      copyTooltipContent(contractAddress)
                    }}
                  >
                    Copy
                  </button>
                </span>
              )}
            </span>
            <span className={styles.traceDot}>.</span>
            <span className={styles.traceFuncWrapper}>
              <span className={styles.traceFuncName}>{funcName}</span>
              {trace.input && !hideTooltip && (
                <span className={styles.traceTooltip}>
                  <span className={styles.traceTooltipContent}>{trace.input}</span>
                  <button
                    className={styles.traceTooltipCopy}
                    onClick={(e) => {
                      e.stopPropagation()
                      copyTooltipContent(trace.input)
                    }}
                  >
                    Copy
                  </button>
                </span>
              )}
            </span>
            <span className={styles.traceParams}>({inputParams})</span>
            {outputParams && (
              <>
                <span className={styles.traceArrow}> → </span>
                <span className={styles.traceOutput}>({outputParams})</span>
              </>
            )}
          </span>
          {trace.gasUsed && (
            <span className={styles.traceGas}>{Number(trace.gasUsed).toLocaleString()} gas</span>
          )}
        </div>

        {/* Error message if any */}
        {trace.error && (
          <div className={styles.traceErrorMsg}>
            Error: {trace.errorReason || trace.error}
          </div>
        )}

        {/* Logs emitted during this call */}
        {trace.logs && trace.logs.length > 0 && (
          <div className={styles.traceLogsList}>
            {trace.logs.map((log, i) => (
              <div key={i} className={styles.traceLog}>
                <span className={styles.traceLogIcon}>📝</span>
                <span className={styles.traceLogName}>{log.name}</span>
                <span className={styles.traceLogParams}>
                  ({log.inputs?.map(p => `${p.name}=${formatValue(p.value)}`).join(', ')})
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Nested calls */}
        {trace.calls && trace.calls.length > 0 && (
          <div className={styles.traceChildren}>
            {trace.calls.map((child, i) => renderCallTraceNode(child, `${depth}-${i}`))}
          </div>
        )}
      </div>
    )
  }

  const handleCopy = async () => {
    try {
      const text = isYaml
        ? yaml.dump(result, { indent: 2, lineWidth: -1, noRefs: true })
        : JSON.stringify(result, null, 2)

      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleShareUrl = async () => {
    try {
      const params = new URLSearchParams()
      params.set('chain', chain)
      params.set('address', address)

      if (selectedFunction) {
        params.set('function', selectedFunction)
      }

      // Encode args as JSON if there are any non-empty args
      if (args.length > 0 && args.some(a => a !== '')) {
        params.set('args', JSON.stringify(args))
      }

      if (fromAddress) {
        params.set('from', fromAddress)
      }

      if (ethValue) {
        params.set('value', ethValue)
      }

      const shareUrl = `${window.location.origin}${window.location.pathname}?${params}`

      await navigator.clipboard.writeText(shareUrl)
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy share URL:', err)
    }
  }

  const handleCopyCalldata = async () => {
    if (!selectedFunction || !parsedAbi) {
      setError('Please select a function first')
      return
    }

    try {
      const func = getSelectedFunction()
      if (!func) {
        setError('Function not found in ABI')
        return
      }

      // Parse args based on their types
      const parsedArgs = func.inputs.map((input, index) => {
        const value = args[index] || ''

        // Handle array types
        if (input.type.includes('[]')) {
          try {
            return JSON.parse(value)
          } catch {
            return value.split(',').map(v => v.trim())
          }
        }

        // Handle tuple types
        if (input.type === 'tuple' || input.type.startsWith('tuple')) {
          try {
            return JSON.parse(value)
          } catch {
            return value
          }
        }

        // Handle boolean
        if (input.type === 'bool') {
          return value.toLowerCase() === 'true' || value === '1'
        }

        // Handle numbers - keep as string for BigInt compatibility
        if (input.type.startsWith('uint') || input.type.startsWith('int')) {
          return value
        }

        return value
      })

      const calldata = encodeFunctionData({
        abi: parsedAbi,
        functionName: selectedFunction,
        args: parsedArgs,
      })

      await navigator.clipboard.writeText(calldata)
      setCalldataCopied(true)
      setTimeout(() => setCalldataCopied(false), 2000)
    } catch (err) {
      console.error('Failed to encode calldata:', err)
      setError(`Failed to encode calldata: ${err.message}`)
    }
  }

  // Check if current address is bookmarked
  const isCurrentAddressBookmarked = () => {
    if (!isValidEthAddress(address)) return false
    return isAddressBookmarked(address)
  }

  // Open bookmark modal (for main contract or any address)
  const handleOpenBookmarkModal = (addr) => {
    const targetAddr = addr || address
    if (!isValidEthAddress(targetAddr)) return

    const existing = getBookmarkedAddress(targetAddr)
    if (existing) {
      setBookmarkLabel(existing.label || '')
      setBookmarkNotes(existing.notes || '')
    } else {
      // Only use contractName for main contract (when addr is not provided)
      setBookmarkLabel(addr ? '' : (contractName || ''))
      setBookmarkNotes('')
    }

    setBookmarkAddress(addr || '') // Empty string means main contract
    setShowBookmarkModal(true)
  }

  // Save bookmark
  const handleSaveBookmark = () => {
    const addrToSave = bookmarkAddress || address
    if (!addrToSave) return

    const updatedBook = addToAddressBook({
      address: addrToSave,
      label: bookmarkLabel,
      contractName: bookmarkAddress ? '' : (contractName || ''), // Only use contractName for main contract
      notes: bookmarkNotes,
    })

    setAddressBook(updatedBook)
    setShowBookmarkModal(false)
    setBookmarkAddress('')
    setBookmarkLabel('')
    setBookmarkNotes('')
  }

  // Remove bookmark (for main contract or modal)
  const handleRemoveBookmark = () => {
    const addrToRemove = bookmarkAddress || address
    const existing = getBookmarkedAddress(addrToRemove)
    if (existing) {
      const updatedBook = removeFromAddressBook(existing.id)
      setAddressBook(updatedBook)
    }
    setShowBookmarkModal(false)
    setBookmarkAddress('')
  }

  // Get combined suggestions (bookmarked addresses + cached addresses)
  const getCombinedSuggestions = () => {
    // Cached addresses, with bookmark info merged if also bookmarked
    const cached = cachedAddresses.map(item => {
      const bookmark = addressBook.find(b => b.address.toLowerCase() === item.address.toLowerCase())
      return {
        ...item,
        isBookmarked: !!bookmark,
        label: bookmark?.label || null,
      }
    })

    return cached
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Contract Caller</h1>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`${styles.settingsToggle} ${isEtherscanConfigured() && isTenderlyConfigured() ? styles.settingsConfigured : ''}`}
            type="button"
          >
            {isEtherscanConfigured() && isTenderlyConfigured()
              ? '✓ API Keys Configured'
              : `⚙ Settings ${isEtherscanConfigured() ? '(Etherscan ✓)' : ''} ${isTenderlyConfigured() ? '(Tenderly ✓)' : ''}`}
          </button>
        </div>

        {/* Settings Panel */}
        <div className={styles.settingsSection}>

          {showSettings && (
            <div className={styles.settingsPanel}>
              {/* Etherscan API Key */}
              <div className={styles.settingsGroup}>
                <h3 className={styles.settingsTitle}>
                  Etherscan API Key
                  {isEtherscanConfigured() && <span className={styles.settingsCheck}>✓</span>}
                </h3>
                <p className={styles.settingsDesc}>
                  Required for fetching contract ABIs. Get your free API key from{' '}
                  <a href="https://etherscan.io/myapikey" target="_blank" rel="noopener noreferrer">
                    Etherscan
                  </a>
                </p>
                <div className={styles.settingsFieldWithTest}>
                  <input
                    type="password"
                    value={apiKeys.etherscan}
                    onChange={(e) => saveApiKeys({ ...apiKeys, etherscan: e.target.value })}
                    placeholder="Enter your Etherscan API key..."
                    className={styles.settingsInput}
                  />
                  <button
                    onClick={testEtherscanKey}
                    disabled={!apiKeys.etherscan || testingEtherscan}
                    className={`${styles.testButton} ${etherscanTestResult === 'success' ? styles.testSuccess : ''} ${etherscanTestResult === 'error' ? styles.testError : ''}`}
                  >
                    {testingEtherscan ? 'Testing...' : etherscanTestResult === 'success' ? '✓ Valid' : etherscanTestResult === 'error' ? '✗ Invalid' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Simulation Mode */}
              <div className={styles.settingsGroup}>
                <h3 className={styles.settingsTitle}>
                  Simulation Mode
                  {useLocalSimulation && <span className={styles.settingsCheck}>✓ Local</span>}
                </h3>
                <p className={styles.settingsDesc}>
                  Choose between local browser-based simulation (Tevm) or Tenderly API.
                </p>
                <div className={styles.settingsFields}>
                  <div className={styles.settingRow}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={useLocalSimulation}
                        onChange={(e) => {
                          const useLocal = e.target.checked
                          setUseLocalSimulation(useLocal)
                          localStorage.setItem(SIMULATION_SETTINGS_KEY, JSON.stringify({ useLocalSimulation: useLocal, rpcBatchSize }))
                        }}
                      />
                      <span>Use Local Simulation (Tevm - no API keys required)</span>
                    </label>
                    <label className={styles.settingLabel}>
                      Batch Size
                      <span className={styles.settingHint}> (1 = no batching)</span>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={rpcBatchSize}
                        className={styles.settingInput}
                        onChange={(e) => {
                          const v = Math.max(1, parseInt(e.target.value) || 1)
                          setRpcBatchSize(v)
                          localStorage.setItem(SIMULATION_SETTINGS_KEY, JSON.stringify({ useLocalSimulation, rpcBatchSize: v }))
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Tenderly Settings */}
              <div className={styles.settingsGroup}>
                <h3 className={styles.settingsTitle}>
                  Tenderly API Settings
                  {isTenderlyConfigured() && <span className={styles.settingsCheck}>✓</span>}
                </h3>
                <p className={styles.settingsDesc}>
                  {useLocalSimulation ? 'Optional when using Local Simulation.' : 'Required for simulating write functions.'} Get your credentials from{' '}
                  <a href="https://dashboard.tenderly.co/account/authorization" target="_blank" rel="noopener noreferrer">
                    Tenderly Dashboard
                  </a>
                </p>
                <div className={styles.settingsFields}>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>Access Key</label>
                    <input
                      type="password"
                      value={tenderlySettings.accessKey}
                      onChange={(e) => saveTenderlySettings({ ...tenderlySettings, accessKey: e.target.value })}
                      placeholder="Enter your Tenderly access key..."
                      className={styles.settingsInput}
                    />
                  </div>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>Account Slug</label>
                    <input
                      type="text"
                      value={tenderlySettings.account}
                      onChange={(e) => saveTenderlySettings({ ...tenderlySettings, account: e.target.value })}
                      placeholder="Your account slug (from URL)"
                      className={styles.settingsInput}
                    />
                  </div>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>Project Slug</label>
                    <input
                      type="text"
                      value={tenderlySettings.project}
                      onChange={(e) => saveTenderlySettings({ ...tenderlySettings, project: e.target.value })}
                      placeholder="Your project slug (from URL)"
                      className={styles.settingsInput}
                    />
                  </div>
                </div>
                <button
                  onClick={testTenderlyKey}
                  disabled={!isTenderlyConfigured() || testingTenderly}
                  className={`${styles.testButton} ${tenderlyTestResult === 'success' ? styles.testSuccess : ''} ${tenderlyTestResult === 'error' ? styles.testError : ''}`}
                  style={{ marginTop: '1rem' }}
                >
                  {testingTenderly ? 'Testing...' : tenderlyTestResult === 'success' ? '✓ Valid' : tenderlyTestResult === 'error' ? '✗ Invalid' : 'Test Connection'}
                </button>
              </div>

              {/* Custom RPC Settings */}
              <div className={styles.settingsGroup}>
                <h3 className={styles.settingsTitle}>
                  Custom RPC Endpoints
                  <span className={styles.optional}>(optional)</span>
                </h3>
                <p className={styles.settingsDesc}>
                  Configure custom RPC endpoints for each chain. If not set, default public RPCs will be used.
                </p>
                <div className={styles.settingsFields}>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>Chain</label>
                    <div className={styles.chainSelectWithIcon}>
                      {allChains.find(c => c.id === selectedRpcChain)?.icon && (
                        <img
                          src={allChains.find(c => c.id === selectedRpcChain)?.icon}
                          alt=""
                          className={styles.chainIconSmall}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      )}
                      <select
                        value={selectedRpcChain}
                        onChange={(e) => setSelectedRpcChain(e.target.value)}
                        className={styles.select}
                      >
                        {[...allChains]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((c) => {
                            const chainIdNum = c.chainId || BUILT_IN_CHAIN_IDS[c.id]
                            return (
                              <option key={c.id} value={c.id}>
                                {c.name} ({chainIdNum}) {rpcSettings[c.id] ? '✓' : ''}
                              </option>
                            )
                          })}
                      </select>
                    </div>
                  </div>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>RPC URL</label>
                    <div className={styles.settingsFieldWithTest}>
                      <input
                        type="text"
                        value={rpcSettings[selectedRpcChain] || ''}
                        onChange={(e) => saveRpcSettings({ ...rpcSettings, [selectedRpcChain]: e.target.value })}
                        placeholder={`Custom RPC URL for ${allChains.find(c => c.id === selectedRpcChain)?.name}...`}
                        className={styles.settingsInput}
                      />
                      <button
                        onClick={() => testRpcEndpoint(selectedRpcChain)}
                        disabled={!rpcSettings[selectedRpcChain] || testingRpc[selectedRpcChain]}
                        className={`${styles.testButton} ${rpcTestResult[selectedRpcChain] === 'success' ? styles.testSuccess : ''} ${rpcTestResult[selectedRpcChain] === 'error' || rpcTestResult[selectedRpcChain] === 'mismatch' ? styles.testError : ''}`}
                      >
                        {testingRpc[selectedRpcChain] ? 'Testing...' : rpcTestResult[selectedRpcChain] === 'success' ? '✓ Valid' : rpcTestResult[selectedRpcChain] === 'mismatch' ? '✗ Wrong Chain' : rpcTestResult[selectedRpcChain] === 'error' ? '✗ Failed' : 'Test'}
                      </button>
                    </div>
                  </div>
                </div>
                {/* Show configured RPCs */}
                {Object.entries(rpcSettings).filter(([_, url]) => url).length > 0 && (
                  <div className={styles.configuredRpcList}>
                    <label className={styles.settingsLabel} style={{ marginTop: '1rem' }}>Configured RPCs:</label>
                    {Object.entries(rpcSettings)
                      .filter(([_, url]) => url)
                      .map(([chainId, url]) => {
                        const chainInfo = allChains.find(c => c.id === chainId)
                        return (
                          <div key={chainId} className={styles.configuredRpcItem}>
                            {chainInfo?.icon && (
                              <img src={chainInfo.icon} alt="" className={styles.chainIconTiny} />
                            )}
                            <span className={styles.configuredRpcChain}>
                              {chainInfo?.name || chainId}
                            </span>
                            <span className={styles.configuredRpcUrl} title={url}>
                              {url.length > 40 ? url.slice(0, 40) + '...' : url}
                            </span>
                            <button
                              className={styles.removeRpcButton}
                              onClick={() => saveRpcSettings({ ...rpcSettings, [chainId]: '' })}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              <p className={styles.settingsNote}>
                All settings are stored locally in your browser and never sent to our servers.
              </p>
            </div>
          )}
        </div>

        <div className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field} style={{ minWidth: '200px' }}>
              <label className={styles.label}>Network</label>
              <div className={styles.chainSelectRow}>
                <div className={styles.chainSelectWithIcon}>
                  {allChains.find(c => c.id === chain)?.icon && (
                    <img
                      src={allChains.find(c => c.id === chain)?.icon}
                      alt=""
                      className={styles.chainIconSmall}
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}
                  <select
                    value={chain}
                    onChange={(e) => setChain(e.target.value)}
                    className={styles.select}
                    disabled={loading}
                  >
                    {[...CHAINS, ...customChains]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => {
                        const chainIdNum = c.chainId || BUILT_IN_CHAIN_IDS[c.id]
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} ({chainIdNum})
                          </option>
                        )
                      })}
                  </select>
                </div>
                <button
                  onClick={() => {
                    setShowAddChainModal(true)
                    fetchChainlistData()
                  }}
                  className={styles.addChainButton}
                  title="Add more networks"
                  disabled={loading}
                >
                  +
                </button>
              </div>
            </div>

            <div className={styles.field} style={{ flex: 2 }}>
              <div className={styles.addressLabelRow}>
                <label className={styles.label}>Contract Address</label>
                {(() => {
                  const bookmark = addressBook.find(item => item.address.toLowerCase() === address.toLowerCase())
                  if (bookmark?.label) {
                    return <span className={styles.bookmarkName}>{bookmark.label}</span>
                  }
                  return null
                })()}
                {contractName && (
                  <span className={styles.contractName}>{contractName}</span>
                )}
              </div>
              <div className={styles.addressRow}>
                <div className={styles.addressInputWrapper}>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      setAddressFilter(e.target.value)
                      setShowAddressSuggestions(true)
                      if (fieldErrors.address) {
                        setFieldErrors(prev => ({ ...prev, address: false }))
                      }
                    }}
                    onFocus={() => setShowAddressSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                    placeholder="0x..."
                    className={`${styles.input} ${fieldErrors.address ? styles.inputError : ''}`}
                    disabled={loading}
                  />
                  {showAddressSuggestions && getCombinedSuggestions().length > 0 && (
                    <div className={styles.addressSuggestions}>
                      {getCombinedSuggestions()
                        .filter(item => {
                          // Show cached contracts from the selected chain + bookmarked addresses
                          if (!item.isBookmarked && item.chain !== chain) return false
                          const textMatch = addressFilter === '' ||
                            item.address.toLowerCase().includes(addressFilter.toLowerCase()) ||
                            (item.contractName && item.contractName.toLowerCase().includes(addressFilter.toLowerCase())) ||
                            (item.implContractName && item.implContractName.toLowerCase().includes(addressFilter.toLowerCase())) ||
                            (item.label && item.label.toLowerCase().includes(addressFilter.toLowerCase()))
                          return textMatch
                        })
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className={styles.addressSuggestionItem}
                            onClick={() => {
                              setAddress(item.address)
                              setShowAddressSuggestions(false)
                            }}
                          >
                            {item.isBookmarked && (
                              <span className={styles.bookmarkStar}>★</span>
                            )}
                            <span className={styles.suggestionName}>
                              {item.label || item.contractName || 'Unknown'}
                              {item.isProxy && item.implContractName && ` → ${item.implContractName}`}
                            </span>
                            <span className={styles.suggestionAddress}>
                              {item.address.slice(0, 10)}...{item.address.slice(-8)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleOpenBookmarkModal()}
                  className={`${styles.bookmarkButton} ${isCurrentAddressBookmarked() ? styles.bookmarked : ''}`}
                  disabled={loading || !isValidEthAddress(address)}
                  type="button"
                  title={isCurrentAddressBookmarked() ? 'Edit bookmark' : 'Add to address book'}
                >
                  {isCurrentAddressBookmarked() ? '★' : '☆'}
                </button>
                <label className={styles.detectProxyLabel} title="Use on-chain detection for proxy contracts not recognized by Etherscan (e.g. Safe, EIP-1167 clones)">
                  <input
                    type="checkbox"
                    checked={detectProxy}
                    onChange={(e) => setDetectProxy(e.target.checked)}
                  />
                  Detect proxy
                </label>
                <button
                  onClick={() => fetchAbi(false)}
                  className={styles.fetchButton}
                  disabled={loading || fetchingAbi}
                  data-fetch-abi="true"
                >
                  {fetchingAbi ? 'Fetching...' : 'Fetch ABI'}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.abiLabelRow}>
              <label className={styles.label}>ABI (JSON)</label>
              <button
                onClick={() => setAbiCollapsed(!abiCollapsed)}
                className={styles.abiCollapseBtn}
                type="button"
              >
                {abiCollapsed ? '▶ Expand' : '▼ Collapse'}
              </button>
              {address && abi && (
                <button
                  onClick={saveAbiToCache}
                  className={`${styles.abiSaveBtn} ${abiSaved ? styles.saved : ''}`}
                  type="button"
                  title="Save ABI to local cache"
                  disabled={loading}
                >
                  {abiSaved ? '✓ Saved' : 'Save'}
                </button>
              )}
              {abiSource && (
                <span className={styles.abiSource}>
                  {abiSource}
                  <button
                    onClick={() => fetchAbi(true)}
                    className={styles.refreshButton}
                    disabled={loading || fetchingAbi}
                    title="Refresh ABI from explorer"
                  >
                    ↻
                  </button>
                </span>
              )}
            </div>
            {!abiCollapsed && (
              <div className={styles.abiContent}>
                {/* View mode toggle and search */}
                <div className={styles.abiToolbar}>
                  <div className={styles.abiViewToggle}>
                    <button
                      type="button"
                      className={`${styles.abiViewBtn} ${abiViewMode === 'list' ? styles.active : ''}`}
                      onClick={() => setAbiViewMode('list')}
                    >
                      List
                    </button>
                    <button
                      type="button"
                      className={`${styles.abiViewBtn} ${abiViewMode === 'raw' ? styles.active : ''}`}
                      onClick={() => setAbiViewMode('raw')}
                    >
                      Raw
                    </button>
                  </div>
                  {abiViewMode === 'list' && parsedAbi && (
                    <input
                      type="text"
                      value={abiFilter}
                      onChange={(e) => setAbiFilter(e.target.value)}
                      placeholder="Search functions, events, types..."
                      className={styles.abiSearchInput}
                    />
                  )}
                </div>

                {/* List view */}
                {abiViewMode === 'list' && parsedAbi && (
                  <div className={styles.abiListView}>
                    {(() => {
                      const entries = getFilteredAbiEntries()
                      const totalCount = entries.functions.length + entries.events.length + entries.errors.length + entries.other.length
                      if (totalCount === 0) {
                        return <div className={styles.abiEmptyState}>{abiFilter ? 'No matching entries' : 'No ABI entries'}</div>
                      }
                      return (
                        <>
                          {entries.functions.length > 0 && (
                            <div className={styles.abiCategory}>
                              <div className={styles.abiCategoryHeader}>
                                <span className={styles.abiCategoryLabel}>Functions</span>
                                <span className={styles.abiCategoryCount}>{entries.functions.length}</span>
                              </div>
                              <div className={styles.abiCategoryItems}>
                                {entries.functions.map((item, idx) => {
                                  const itemKey = `func-${item.name}-${idx}`
                                  return (
                                    <div
                                      key={idx}
                                      className={`${styles.abiItem} ${styles.abiClickable} ${isReadOnly(item) ? styles.abiRead : styles.abiWrite} ${abiCopiedItem === itemKey ? styles.abiCopied : ''}`}
                                      onClick={() => copyAbiEntry(item, itemKey)}
                                      title={`Click to copy ${item.name}`}
                                    >
                                      <span className={styles.abiItemBadge}>{isReadOnly(item) ? 'R' : 'W'}</span>
                                      <span className={styles.abiItemSignature}>{formatAbiSignature(item)}</span>
                                      {abiCopiedItem === itemKey && <span className={styles.abiCopiedBadge}>Copied!</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {entries.events.length > 0 && (
                            <div className={styles.abiCategory}>
                              <div className={styles.abiCategoryHeader}>
                                <span className={styles.abiCategoryLabel}>Events</span>
                                <span className={styles.abiCategoryCount}>{entries.events.length}</span>
                              </div>
                              <div className={styles.abiCategoryItems}>
                                {entries.events.map((item, idx) => {
                                  const itemKey = `event-${item.name}-${idx}`
                                  return (
                                    <div
                                      key={idx}
                                      className={`${styles.abiItem} ${styles.abiEvent} ${styles.abiClickable} ${abiCopiedItem === itemKey ? styles.abiCopied : ''}`}
                                      onClick={() => copyAbiEntry(item, itemKey)}
                                      title={`Click to copy ${item.name}`}
                                    >
                                      <span className={styles.abiItemBadge}>E</span>
                                      <span className={styles.abiItemSignature}>{formatAbiSignature(item)}</span>
                                      {abiCopiedItem === itemKey && <span className={styles.abiCopiedBadge}>Copied!</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {entries.errors.length > 0 && (
                            <div className={styles.abiCategory}>
                              <div className={styles.abiCategoryHeader}>
                                <span className={styles.abiCategoryLabel}>Errors</span>
                                <span className={styles.abiCategoryCount}>{entries.errors.length}</span>
                              </div>
                              <div className={styles.abiCategoryItems}>
                                {entries.errors.map((item, idx) => {
                                  const itemKey = `error-${item.name}-${idx}`
                                  return (
                                    <div
                                      key={idx}
                                      className={`${styles.abiItem} ${styles.abiError} ${styles.abiClickable} ${abiCopiedItem === itemKey ? styles.abiCopied : ''}`}
                                      onClick={() => copyAbiEntry(item, itemKey)}
                                      title={`Click to copy ${item.name}`}
                                    >
                                      <span className={styles.abiItemBadge}>!</span>
                                      <span className={styles.abiItemSignature}>{formatAbiSignature(item)}</span>
                                      {abiCopiedItem === itemKey && <span className={styles.abiCopiedBadge}>Copied!</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {entries.other.length > 0 && (
                            <div className={styles.abiCategory}>
                              <div className={styles.abiCategoryHeader}>
                                <span className={styles.abiCategoryLabel}>Other</span>
                                <span className={styles.abiCategoryCount}>{entries.other.length}</span>
                              </div>
                              <div className={styles.abiCategoryItems}>
                                {entries.other.map((item, idx) => {
                                  const itemKey = `other-${item.type}-${idx}`
                                  return (
                                    <div
                                      key={idx}
                                      className={`${styles.abiItem} ${styles.abiOther} ${styles.abiClickable} ${abiCopiedItem === itemKey ? styles.abiCopied : ''}`}
                                      onClick={() => copyAbiEntry(item, itemKey)}
                                      title={`Click to copy ${item.type}`}
                                    >
                                      <span className={styles.abiItemBadge}>{item.type?.[0]?.toUpperCase() || '?'}</span>
                                      <span className={styles.abiItemSignature}>{item.type}{item.name ? `: ${item.name}` : ''}</span>
                                      {abiCopiedItem === itemKey && <span className={styles.abiCopiedBadge}>Copied!</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* Raw view */}
                {(abiViewMode === 'raw' || !parsedAbi) && (
                  <textarea
                    value={abi}
                    onChange={(e) => {
                      setAbi(e.target.value)
                      setAbiSource(null)
                    }}
                    placeholder="Paste contract ABI here or use Fetch ABI button..."
                    className={styles.textarea}
                    disabled={loading}
                    rows={6}
                  />
                )}
              </div>
            )}
          </div>

          {(functions.length > 0 || getEvents().length > 0) && (
            <div className={styles.tabSection}>
              {/* Tab Switcher */}
              <div className={styles.tabContainer}>
                <button
                  className={`${styles.tab} ${activeTab === 'functions' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('functions')}
                >
                  Functions ({functions.length})
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'events' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('events')}
                >
                  Events ({getEvents().length})
                </button>
              </div>

              {/* Functions Tab */}
              {activeTab === 'functions' && functions.length > 0 && (
              <>
              <div className={styles.field}>
                <div className={styles.functionLabelRow}>
                  <label className={styles.label}>Function</label>
                  {selectedFunction && getSelectedFunction() && (
                    <>
                      <span className={isReadOnly(getSelectedFunction()) ? styles.readBadge : styles.writeBadge}>
                        {isReadOnly(getSelectedFunction()) ? 'read' : 'write'}
                      </span>
                      {getFunctionSelector(getSelectedFunction()) && (
                        <span
                          className={`${styles.funcSelector} ${copiedItem === 'selector' ? styles.copied : ''}`}
                          onClick={async () => {
                            const selector = getFunctionSelector(getSelectedFunction())
                            if (selector) {
                              await navigator.clipboard.writeText(selector)
                              setCopiedItem('selector')
                              setTimeout(() => setCopiedItem(null), 1500)
                            }
                          }}
                          title="Click to copy selector"
                        >
                          {copiedItem === 'selector' ? 'Copied!' : getFunctionSelector(getSelectedFunction())}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className={styles.functionSelectWrapper}>
                  {selectedFunction && getSelectedFunction() ? (
                    <div className={styles.selectedFunctionDisplay}>
                      <button
                        className={styles.changeFunctionBtnLeft}
                        onClick={() => setShowFunctionList(!showFunctionList)}
                        title="Change function"
                      >
                        ▼
                      </button>
                      <span
                        className={`${styles.selectedFunctionText} ${copiedItem === 'signature' ? styles.copiedText : ''}`}
                        onClick={async () => {
                          const func = getSelectedFunction()
                          const outputs = func.outputs && func.outputs.length > 0 ? ` → ${func.outputs.map(o => o.type).join(', ')}` : ''
                          const sig = `${selectedFunction}(${func.inputs.map(i => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')})${outputs}`
                          await navigator.clipboard.writeText(sig)
                          setCopiedItem('signature')
                          setTimeout(() => setCopiedItem(null), 1500)
                        }}
                        title="Click to copy function signature"
                      >
                        {copiedItem === 'signature' ? '✓ Copied!' : (() => {
                          const func = getSelectedFunction()
                          const outputs = func.outputs && func.outputs.length > 0 ? ` → ${func.outputs.map(o => o.type).join(', ')}` : ''
                          return `${selectedFunction}(${func.inputs.map(i => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')})${outputs}`
                        })()}
                      </span>
                      <button
                        className={styles.clearFunctionBtn}
                        onClick={() => {
                          setSelectedFunction('')
                          setFunctionFilter('')
                        }}
                        title="Clear selection"
                      >
                        ×
                      </button>
                      <button
                        className={styles.changeFunctionBtn}
                        onClick={() => setShowFunctionList(!showFunctionList)}
                        title="Change function"
                      >
                        ▼
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={functionFilter}
                      onChange={(e) => {
                        setFunctionFilter(e.target.value)
                        setShowFunctionList(true)
                      }}
                      onFocus={() => setShowFunctionList(true)}
                      onBlur={() => setTimeout(() => setShowFunctionList(false), 200)}
                      placeholder="Search or select a function..."
                      className={styles.input}
                      disabled={loading}
                    />
                  )}
                  {showFunctionList && (
                    <div className={styles.functionList}>
                      {selectedFunction && (
                        <div className={styles.functionListSearch}>
                          <input
                            type="text"
                            value={functionFilter}
                            onChange={(e) => setFunctionFilter(e.target.value)}
                            placeholder="Search functions..."
                            className={styles.functionSearchInput}
                            autoFocus
                          />
                        </div>
                      )}
                      {getFilteredFunctions().map((func) => (
                        <div
                          key={func.name}
                          className={`${styles.functionItem} ${selectedFunction === func.name ? styles.functionItemSelected : ''}`}
                          onClick={() => {
                            setSelectedFunction(func.name)
                            setFunctionFilter('')
                            setShowFunctionList(false)
                          }}
                        >
                          <span className={isReadOnly(func) ? styles.funcReadTag : styles.funcWriteTag}>
                            {isReadOnly(func) ? 'R' : 'W'}
                          </span>
                          <span className={styles.funcName}>{func.name}</span>
                          <span className={styles.funcParams}>
                            ({func.inputs.map((i) => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')})
                          </span>
                          {func.outputs && func.outputs.length > 0 && (
                            <span className={styles.funcReturns}>
                              → {func.outputs.map((o) => o.type).join(', ')}
                            </span>
                          )}
                        </div>
                      ))}
                      {getFilteredFunctions().length === 0 && (
                        <div className={styles.functionItemEmpty}>No matching functions</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Simulation Options - From Address, Fork Block, Cheatcodes in one row */}
              {selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction()) && (
                <div className={styles.simOptionsSection}>
                  <div className={styles.simOptionsHeader}>
                    <span className={styles.simOptionsLabel}>Simulation Options</span>
                    <button
                      onClick={() => setSimOptionsExpanded(!simOptionsExpanded)}
                      className={styles.simOptionsToggle}
                      type="button"
                    >
                      {simOptionsExpanded ? '▼' : '▶'}
                    </button>
                    <div className={styles.simOptionsInline}>
                      <input
                        type="text"
                        value={forkBlockNumber}
                        onChange={(e) => {
                          setForkBlockNumber(e.target.value)
                          if (fieldErrors.forkBlockNumber) {
                            setFieldErrors(prev => ({ ...prev, forkBlockNumber: false }))
                          }
                        }}
                        placeholder="Block # (latest)"
                        className={`${styles.simOptionInputSmall} ${fieldErrors.forkBlockNumber ? styles.inputError : ''}`}
                        disabled={loading}
                      />
                      <div className={styles.simOptionFromAddress} title="Sender address to impersonate (prank) - simulates msg.sender">
                        <AddressArgInput
                          value={fromAddress}
                          onChange={(value) => {
                            setFromAddress(value)
                            if (fieldErrors.fromAddress) {
                              setFieldErrors(prev => ({ ...prev, fromAddress: false }))
                            }
                          }}
                          addressBook={addressBook}
                          disabled={loading}
                          placeholder="From (prank)"
                          onBookmarkClick={handleOpenBookmarkModal}
                          error={fieldErrors.fromAddress}
                        />
                      </div>
                      {useLocalSimulation && (
                        <div className={styles.cheatcodesInline}>
                          <label className={styles.cheatcodeInlineItem} title="vm.deal - Set ETH balance">
                            <input
                              type="checkbox"
                              checked={cheatcodes.deal.enabled}
                              onChange={(e) => setCheatcodes(prev => ({ ...prev, deal: { ...prev.deal, enabled: e.target.checked } }))}
                            />
                            <span>deal</span>
                          </label>
                          <label className={styles.cheatcodeInlineItem} title="vm.prank - Impersonate address">
                            <input
                              type="checkbox"
                              checked={cheatcodes.prank.enabled}
                              onChange={(e) => setCheatcodes(prev => ({ ...prev, prank: { ...prev.prank, enabled: e.target.checked } }))}
                            />
                            <span>prank</span>
                          </label>
                          <label className={styles.cheatcodeInlineItem} title="vm.warp - Set timestamp">
                            <input
                              type="checkbox"
                              checked={cheatcodes.warp.enabled}
                              onChange={(e) => setCheatcodes(prev => ({ ...prev, warp: { ...prev.warp, enabled: e.target.checked } }))}
                            />
                            <span>warp</span>
                          </label>
                        </div>
                      )}
                      {!useLocalSimulation && (
                        <>
                          <button
                            type="button"
                            className={styles.addOverrideBtn}
                            onClick={() => setBalanceOverrides(prev => [...prev, { address: '', balance: '' }])}
                            title="Add balance override"
                          >
                            + Balance
                          </button>
                          <button
                            type="button"
                            className={styles.addOverrideBtn}
                            onClick={() => setStorageOverrides(prev => [...prev, { address: '', slot: '', value: '' }])}
                            title="Add storage override"
                          >
                            + Storage
                          </button>
                          <input
                            type="text"
                            value={timestampOverride}
                            onChange={(e) => setTimestampOverride(e.target.value)}
                            placeholder="Timestamp (unix)"
                            className={styles.simOptionInputSmall}
                            disabled={loading}
                            title="Override block timestamp"
                          />
                        </>
                      )}
                    </div>
                  </div>
                  {simOptionsExpanded && (cheatcodes.deal.enabled || cheatcodes.prank.enabled || cheatcodes.warp.enabled) && (
                    <div className={styles.simOptionsExpanded}>
                      {cheatcodes.deal.enabled && (
                        <div className={styles.cheatcodeExpandedRow}>
                          <span className={styles.cheatcodeLabel}>vm.deal:</span>
                          <input
                            type="text"
                            value={cheatcodes.deal.address}
                            onChange={(e) => {
                              setCheatcodes(prev => ({ ...prev, deal: { ...prev.deal, address: e.target.value } }))
                              if (fieldErrors.dealAddress) {
                                setFieldErrors(prev => ({ ...prev, dealAddress: false }))
                              }
                            }}
                            placeholder="Address"
                            className={`${styles.simOptionInput} ${fieldErrors.dealAddress ? styles.inputError : ''}`}
                          />
                          <input
                            type="text"
                            value={cheatcodes.deal.amount}
                            onChange={(e) => {
                              setCheatcodes(prev => ({ ...prev, deal: { ...prev.deal, amount: e.target.value } }))
                              if (fieldErrors.dealAmount) {
                                setFieldErrors(prev => ({ ...prev, dealAmount: false }))
                              }
                            }}
                            placeholder="ETH Amount"
                            className={`${styles.simOptionInputSmall} ${fieldErrors.dealAmount ? styles.inputError : ''}`}
                          />
                        </div>
                      )}
                      {cheatcodes.prank.enabled && (
                        <div className={styles.cheatcodeExpandedRow}>
                          <span className={styles.cheatcodeLabel}>vm.prank:</span>
                          <input
                            type="text"
                            value={cheatcodes.prank.address}
                            onChange={(e) => {
                              setCheatcodes(prev => ({ ...prev, prank: { ...prev.prank, address: e.target.value } }))
                              if (fieldErrors.prankAddress) {
                                setFieldErrors(prev => ({ ...prev, prankAddress: false }))
                              }
                            }}
                            placeholder="Impersonate Address"
                            className={`${styles.simOptionInput} ${fieldErrors.prankAddress ? styles.inputError : ''}`}
                          />
                        </div>
                      )}
                      {cheatcodes.warp.enabled && (
                        <div className={styles.cheatcodeExpandedRow}>
                          <span className={styles.cheatcodeLabel}>vm.warp:</span>
                          <input
                            type="text"
                            value={cheatcodes.warp.timestamp}
                            onChange={(e) => {
                              setCheatcodes(prev => ({ ...prev, warp: { ...prev.warp, timestamp: e.target.value } }))
                              if (fieldErrors.warpTimestamp) {
                                setFieldErrors(prev => ({ ...prev, warpTimestamp: false }))
                              }
                            }}
                            placeholder="Unix Timestamp"
                            className={`${styles.simOptionInputSmall} ${fieldErrors.warpTimestamp ? styles.inputError : ''}`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {/* Balance overrides for Tenderly simulation */}
                  {!useLocalSimulation && balanceOverrides.length > 0 && (
                    <div className={styles.simOptionsExpanded}>
                      <div className={styles.overridesLabel}>Balance Overrides:</div>
                      {balanceOverrides.map((override, index) => (
                        <div key={index} className={styles.cheatcodeExpandedRow}>
                          <input
                            type="text"
                            value={override.address}
                            onChange={(e) => {
                              const newOverrides = [...balanceOverrides]
                              newOverrides[index].address = e.target.value
                              setBalanceOverrides(newOverrides)
                            }}
                            placeholder="Address (0x...)"
                            className={styles.simOptionInput}
                          />
                          <input
                            type="text"
                            value={override.balance}
                            onChange={(e) => {
                              const newOverrides = [...balanceOverrides]
                              newOverrides[index].balance = e.target.value
                              setBalanceOverrides(newOverrides)
                            }}
                            placeholder="ETH Balance"
                            className={styles.simOptionInputSmall}
                          />
                          <button
                            type="button"
                            className={styles.removeOverrideBtn}
                            onClick={() => {
                              const newOverrides = balanceOverrides.filter((_, i) => i !== index)
                              setBalanceOverrides(newOverrides)
                            }}
                            title="Remove override"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Storage overrides for Tenderly simulation */}
                  {!useLocalSimulation && storageOverrides.length > 0 && (
                    <div className={styles.simOptionsExpanded}>
                      <div className={styles.overridesLabel}>Storage Overrides:</div>
                      {storageOverrides.map((override, index) => (
                        <div key={index} className={styles.cheatcodeExpandedRow}>
                          <input
                            type="text"
                            value={override.address}
                            onChange={(e) => {
                              const newOverrides = [...storageOverrides]
                              newOverrides[index].address = e.target.value
                              setStorageOverrides(newOverrides)
                            }}
                            placeholder="Contract (0x...)"
                            className={styles.simOptionInput}
                          />
                          <input
                            type="text"
                            value={override.slot}
                            onChange={(e) => {
                              const newOverrides = [...storageOverrides]
                              newOverrides[index].slot = e.target.value
                              setStorageOverrides(newOverrides)
                            }}
                            placeholder="Slot (0x...)"
                            className={styles.simOptionInputSmall}
                          />
                          <input
                            type="text"
                            value={override.value}
                            onChange={(e) => {
                              const newOverrides = [...storageOverrides]
                              newOverrides[index].value = e.target.value
                              setStorageOverrides(newOverrides)
                            }}
                            placeholder="Value (0x...)"
                            className={styles.simOptionInputSmall}
                          />
                          <button
                            type="button"
                            className={styles.removeOverrideBtn}
                            onClick={() => {
                              const newOverrides = storageOverrides.filter((_, i) => i !== index)
                              setStorageOverrides(newOverrides)
                            }}
                            title="Remove override"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ETH Value for payable functions */}
              {selectedFunction && getSelectedFunction() && isPayable(getSelectedFunction()) && (
                <div className={styles.field}>
                  <label className={styles.label}>
                    ETH Value <span className={styles.payableBadge}>payable</span>
                  </label>
                  <div className={styles.ethValueWrapper}>
                    <input
                      type="text"
                      value={ethValue}
                      onChange={(e) => {
                        setEthValue(e.target.value)
                        if (fieldErrors.ethValue) {
                          setFieldErrors(prev => ({ ...prev, ethValue: false }))
                        }
                      }}
                      placeholder={ethValueUnit === 'ETH' ? '0.0' : '0'}
                      className={`${styles.ethValueInput} ${fieldErrors.ethValue ? styles.inputError : ''}`}
                      disabled={loading}
                    />
                    <div className={styles.ethValueUnitToggle}>
                      <button
                        type="button"
                        className={`${styles.ethValueUnitBtn} ${ethValueUnit === 'Wei' ? styles.active : ''}`}
                        onClick={() => setEthValueUnit('Wei')}
                      >
                        Wei
                      </button>
                      <button
                        type="button"
                        className={`${styles.ethValueUnitBtn} ${ethValueUnit === 'ETH' ? styles.active : ''}`}
                        onClick={() => setEthValueUnit('ETH')}
                      >
                        ETH
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedFunction && getSelectedFunctionInputs().length > 0 && (
                <div className={styles.argsSection}>
                  <div className={styles.argsSectionHeader}>
                    <label className={styles.label}>Arguments</label>
                    {/* Block number for read-only functions */}
                    {isReadOnly(getSelectedFunction()) && (
                      <div className={styles.readBlockInline}>
                        <label className={styles.readBlockLabel}>Block</label>
                        <input
                          type="text"
                          value={readBlockNumber}
                          onChange={(e) => setReadBlockNumber(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="latest"
                          className={styles.readBlockInput}
                          disabled={loading}
                        />
                      </div>
                    )}
                  </div>
                  {getSelectedFunctionInputs().map((input, index) => (
                    <div key={index} className={styles.argField}>
                      <label className={styles.argLabel}>
                        {input.name || `arg${index}`} ({input.type})
                      </label>
                      <ArgInput
                        input={input}
                        value={args[index]}
                        onChange={(value) => {
                          const newArgs = [...args]
                          newArgs[index] = value
                          setArgs(newArgs)
                          if (fieldErrors[`arg_${index}`]) {
                            setFieldErrors(prev => ({ ...prev, [`arg_${index}`]: false }))
                          }
                        }}
                        addressBook={addressBook}
                        disabled={loading}
                        onBookmarkClick={handleOpenBookmarkModal}
                        error={fieldErrors[`arg_${index}`]}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Block number for read-only functions with no arguments */}
              {selectedFunction && getSelectedFunction() && isReadOnly(getSelectedFunction()) && getSelectedFunctionInputs().length === 0 && (
                <div className={styles.readBlockStandalone}>
                  <label className={styles.readBlockLabel}>Block</label>
                  <input
                    type="text"
                    value={readBlockNumber}
                    onChange={(e) => setReadBlockNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="latest"
                    className={styles.readBlockInput}
                    disabled={loading}
                  />
                </div>
              )}
              </>
              )}

              {/* Events Tab */}
              {activeTab === 'events' && getEvents().length > 0 && (
              <div className={styles.eventsSection}>
                {/* Collapsible Event Selection */}
                <div className={styles.eventSelectionSection}>
                  <div
                    className={styles.eventSelectionHeader}
                    onClick={() => setEventListCollapsed(!eventListCollapsed)}
                  >
                    <span className={styles.eventSelectionToggle}>
                      {eventListCollapsed ? '▶' : '▼'}
                    </span>
                    <span className={styles.eventSelectionTitle}>
                      Select Events ({selectedEvents.length} of {getEvents().length} selected)
                    </span>
                  </div>
                  {!eventListCollapsed && (
                    <>
                      <div className={styles.eventListHeader}>
                        <input
                          type="text"
                          value={eventFilter}
                          onChange={(e) => setEventFilter(e.target.value)}
                          placeholder="Search events..."
                          className={styles.eventSearchInput}
                        />
                        <button
                          onClick={selectAllEvents}
                          className={styles.eventSelectBtn}
                          type="button"
                        >
                          Select All
                        </button>
                        <button
                          onClick={clearEventSelection}
                          className={styles.eventSelectBtn}
                          type="button"
                        >
                          Clear
                        </button>
                      </div>
                      <div className={styles.eventList}>
                        {getFilteredEvents().map((event) => (
                          <label key={event.name} className={styles.eventItem}>
                            <input
                              type="checkbox"
                              checked={selectedEvents.includes(event.name)}
                              onChange={() => toggleEventSelection(event.name)}
                            />
                            <span className={styles.eventTag}>E</span>
                            <span className={styles.eventName}>{event.name}</span>
                            <span className={styles.eventParams}>
                              ({event.inputs?.map(i => `${i.indexed ? 'indexed ' : ''}${i.type}`).join(', ')})
                            </span>
                          </label>
                        ))}
                        {getFilteredEvents().length === 0 && (
                          <div className={styles.eventItemEmpty}>No matching events</div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Fetch Controls */}
                <div className={styles.logsControls}>
                  <div className={styles.blockRangeControls}>
                    <label>
                      From:
                      <input
                        type="text"
                        value={logsFromBlock}
                        onChange={(e) => setLogsFromBlock(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder={latestBlockCache ? `${Math.max(0, latestBlockCache - 10000)}` : 'latest-10k'}
                        className={styles.blockRangeInput}
                        title="Leave empty to auto-fetch last 10,000 blocks"
                      />
                    </label>
                    <label>
                      To:
                      <input
                        type="text"
                        value={logsToBlock}
                        onChange={(e) => setLogsToBlock(e.target.value)}
                        placeholder="latest"
                        className={styles.blockRangeInput}
                      />
                    </label>
                  </div>
                  <div className={styles.paginationControls}>
                    <label>
                      Page:
                      <input
                        type="number"
                        value={logsPage}
                        onChange={(e) => setLogsPage(Math.max(1, parseInt(e.target.value) || 1))}
                        min="1"
                        className={styles.paginationInput}
                      />
                    </label>
                    <label>
                      Per page:
                      <select
                        value={logsOffset}
                        onChange={(e) => setLogsOffset(parseInt(e.target.value))}
                        className={styles.paginationSelect}
                      >
                        <option value="100">100</option>
                        <option value="500">500</option>
                        <option value="1000">1000</option>
                      </select>
                    </label>
                  </div>
                  <button
                    onClick={fetchLogs}
                    className={styles.fetchLogsButton}
                    disabled={fetchingLogs || selectedEvents.length === 0}
                    type="button"
                  >
                    {fetchingLogs ? 'Fetching...' : `Fetch Logs (${selectedEvents.length} selected)`}
                  </button>
                </div>

                {logsError && (
                  <div className={styles.logsErrorBox}>
                    <strong>Error:</strong> {logsError}
                  </div>
                )}

                {logsFetched && eventLogs.length === 0 && !logsError && (
                  <div className={styles.logsEmptyBox}>
                    No logs found in the specified block range.
                  </div>
                )}

                {eventLogs.length > 0 && (
                  <div className={styles.logsResults}>
                    <div className={styles.logsResultsHeader}>
                      <span>
                        {logsFilter.trim()
                          ? `Showing ${getFilteredLogs().length} of ${eventLogs.length} logs`
                          : `Found ${eventLogs.length} logs`
                        }
                      </span>
                      <div className={styles.logsHeaderActions}>
                        <div className={styles.filterInputWrapper}>
                          <input
                            type="text"
                            value={logsFilter}
                            onChange={(e) => setLogsFilter(e.target.value)}
                            placeholder="event = Transfer and args.to = 0x..."
                            className={styles.logsFilterInput}
                          />
                          <span className={styles.filterHelpIcon}>
                            ?
                            <div className={styles.filterHelpPopup}>
                              <div className={styles.filterHelpTitle}>Filter Syntax</div>
                              <div className={styles.filterHelpRow}>
                                <span className={styles.filterHelpLabel}>Fields:</span>
                                <code>event</code> <code>args.*</code> <code>topic0-3</code> <code>data</code> <code>block</code> <code>tx</code>
                              </div>
                              <div className={styles.filterHelpRow}>
                                <span className={styles.filterHelpLabel}>Operators:</span>
                                <code>=</code> <code>!=</code> <code>&gt;</code> <code>&lt;</code> <code>contains</code>
                              </div>
                              <div className={styles.filterHelpRow}>
                                <span className={styles.filterHelpLabel}>Boolean:</span>
                                <code>and</code> <code>or</code>
                              </div>
                              <div className={styles.filterHelpExample}>
                                Example: event = Transfer and args.value &gt; 1000
                              </div>
                            </div>
                          </span>
                        </div>
                        <button
                          onClick={downloadLogsAsCsv}
                          className={styles.downloadCsvButton}
                          type="button"
                        >
                          Download CSV
                        </button>
                      </div>
                    </div>
                    <div className={styles.logsTableContainer}>
                      <table className={styles.logsTable}>
                        <thead>
                          <tr>
                            <th>Block</th>
                            <th>Tx Hash</th>
                            <th>Event</th>
                            <th>Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getFilteredLogs().map((log, idx) => (
                            <tr key={idx} className={styles.logRow}>
                              <td className={styles.logBlockCell}>
                                <div className={styles.logBlockNumber}>{parseInt(log.blockNumber, 16)}</div>
                                {log.timeStamp && (
                                  <div className={styles.logTimestamp}>
                                    {new Date(parseInt(log.timeStamp, 16) * 1000).toLocaleString()}
                                  </div>
                                )}
                              </td>
                              <td className={styles.logTxHash}>
                                <a
                                  href={`https://etherscan.io/tx/${log.transactionHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {log.transactionHash.slice(0, 10)}...
                                </a>
                              </td>
                              <td className={styles.logEventName}>{log.decodedName || 'Unknown'}</td>
                              <td className={styles.logDataCell}>
                                {log.decodedArgs ? (
                                  <pre className={styles.logDecodedArgs}>
                                    {JSON.stringify(log.decodedArgs, (key, value) =>
                                      typeof value === 'bigint' ? value.toString() : value
                                    , 2)}
                                  </pre>
                                ) : (
                                  <span className={styles.logRawData}>{log.data?.slice(0, 20)}...</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {activeTab === 'functions' && (
            <div className={styles.buttonGroup}>
              <button
                onClick={handleCall}
                className={`${styles.button} ${selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction()) ? styles.simulateButton : ''}`}
                disabled={loading || !selectedFunction}
              >
                {loading
                  ? (selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction()) ? 'Simulating...' : 'Calling...')
                  : (selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction())
                      ? <>Simulate Call <span className={styles.simModeTag}>{useLocalSimulation ? 'L' : 'T'}</span></>
                      : 'Call Contract')
                }
              </button>
              {simProgress !== null && (
                <button
                  type="button"
                  className={styles.cancelSimBtn}
                  onClick={() => simAbortRef.current?.abort()}
                >
                  Cancel
                </button>
              )}
              {address && selectedFunction && (
                <>
                  <button
                    onClick={handleCopyCalldata}
                    className={styles.calldataButton}
                    disabled={loading}
                    type="button"
                  >
                    {calldataCopied ? 'Copied!' : 'Copy Calldata'}
                  </button>
                  <button
                    onClick={handleShareUrl}
                    className={styles.shareButton}
                    disabled={loading}
                    type="button"
                  >
                    {urlCopied ? 'Copied!' : 'Share URL'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {simProgress !== null && (
          <div className={styles.simProgressWrapper}>
            <div className={styles.simProgressBar}>
              <div
                className={styles.simProgressFill}
                style={{ width: `${simProgress}%` }}
              />
            </div>
            <span className={styles.simProgressLabel}>
              {simProgress < 100 ? `Simulating… ${simProgress}%` : 'Finalizing…'}
            </span>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <div className={styles.resultTitle}>
                <button
                  onClick={() => setResultCollapsed(!resultCollapsed)}
                  className={styles.collapseButton}
                  type="button"
                >
                  {resultCollapsed ? '▶' : '▼'}
                </button>
                <h2>Result:</h2>
                {result.simulated && (
                  <span className={styles.simulatedBadge}>Simulated</span>
                )}
                {result.success === false && (
                  <span className={styles.failedBadge}>Failed</span>
                )}
              </div>
              <div className={styles.resultActions}>
                <button
                  onClick={() => setResultCollapsed(!resultCollapsed)}
                  className={styles.actionButton}
                  type="button"
                >
                  {resultCollapsed ? 'Expand' : 'Collapse'}
                </button>
                {!resultCollapsed && (
                  <>
                    <button
                      onClick={() => setShowFullResponse(!showFullResponse)}
                      className={`${styles.actionButton} ${showFullResponse ? styles.actionButtonActive : ''}`}
                      type="button"
                    >
                      {showFullResponse ? 'Hide Full' : 'Show Full'}
                    </button>
                    {showFullResponse && (
                      <>
                        <button
                          onClick={() => setIsYaml(!isYaml)}
                          className={styles.actionButton}
                          type="button"
                        >
                          {isYaml ? 'JSON' : 'YAML'}
                        </button>
                        <button
                          onClick={handleCopy}
                          className={styles.actionButton}
                          type="button"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {!resultCollapsed && (
            <>
            {/* Transaction Info (simulation only) */}
            {result.simulated && (
              <div className={styles.txInfoSection}>
                <h3 className={styles.txInfoTitle}>Transaction Info</h3>
                <div className={styles.txInfoGrid}>
                  <div className={styles.txInfoRow}>
                    <span className={styles.txInfoLabel}>From:</span>
                    <span className={styles.txInfoValue}>{result.callTrace?.from || fromAddress || '0x0000000000000000000000000000000000000001'}</span>
                  </div>
                  <div className={styles.txInfoRow}>
                    <span className={styles.txInfoLabel}>To:</span>
                    <span className={styles.txInfoValue}>{result.callTrace?.to || address}</span>
                  </div>
                  {result.callTrace?.input && (
                    <div className={styles.txInfoRow}>
                      <span className={styles.txInfoLabel}>Input:</span>
                      {result.callTrace.input.length > 40 ? (
                        <span className={styles.txInfoInputWrapper}>
                          <span className={styles.txInfoValueMono}>
                            {result.callTrace.input.slice(0, 10)}...{result.callTrace.input.slice(-10)}
                          </span>
                          {!hideTooltip && (
                            <span className={styles.txInfoTooltip}>
                              <span className={styles.traceTooltipContent}>{result.callTrace.input}</span>
                              <button
                                className={styles.traceTooltipCopy}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyTooltipContent(result.callTrace.input)
                                }}
                              >
                                Copy
                              </button>
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className={styles.txInfoValueMono}>{result.callTrace.input}</span>
                      )}
                    </div>
                  )}
                  {result.gasUsed && (
                    <div className={styles.txInfoRow}>
                      <span className={styles.txInfoLabel}>Gas Used:</span>
                      <span className={styles.txInfoValue}>{result.gasUsed.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Event logs (simulation only) */}
            {result.simulated && result.logs && result.logs.length > 0 && (
              <div className={styles.logsSection}>
                <h3 className={styles.logsTitle}>
                  Event Logs ({result.logs.length})
                  <button
                    className={styles.logsToggleBtn}
                    onClick={() => setSimLogsExpanded(v => !v)}
                  >
                    {simLogsExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </h3>
                {(simLogsExpanded ? result.logs : result.logs.slice(0, 5)).map((log, index) => {
                  const contractName = getContractNameFromCache(chain, log.address)
                  const logAddress = log.address?.toLowerCase()
                  const symbol = log.name === 'Transfer' ? (tokenSymbols[logAddress] || getCachedTokenSymbol(chain, logAddress)) : null
                  return (
                  <div key={index} className={styles.logItem}>
                    <div className={styles.logHeader}>
                      <span className={styles.logName}>
                        {log.name || 'Unknown Event'}
                        {symbol && <span className={styles.logTokenSymbol}>[{symbol}]</span>}
                      </span>
                      <span className={styles.logAddress}>
                        {contractName && <span className={styles.logContractName}>{contractName}</span>}
                        {log.address}
                      </span>
                    </div>
                    {log.inputs && log.inputs.length > 0 && (
                      <div className={styles.logInputs}>
                        {log.inputs.map((input, i) => (
                          <div key={i} className={styles.logInput}>
                            <span className={styles.logInputName}>{input.name || `arg${i}`}</span>
                            <span className={styles.logInputType}>({input.type})</span>
                            {input.indexed && <span className={styles.logIndexed}>indexed</span>}
                            <span className={styles.logInputValue}>
                              {typeof input.value === 'object'
                                ? JSON.stringify(input.value)
                                : String(input.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(!log.inputs || log.inputs.length === 0) && log.topics && log.topics.length > 0 && (
                      <div className={styles.logTopics}>
                        <div className={styles.logTopicsLabel}>Topics:</div>
                        {log.topics.map((topic, i) => (
                          <div key={i} className={styles.logTopic}>
                            [{i}] {topic}
                          </div>
                        ))}
                        {log.data && log.data !== '0x' && (
                          <div className={styles.logData}>
                            <span className={styles.logDataLabel}>Data:</span> {log.data}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )})}
                {!simLogsExpanded && result.logs.length > 5 && (
                  <div className={styles.logsMoreIndicator}>
                    … {result.logs.length - 5} more —{' '}
                    <button className={styles.logsToggleBtn} onClick={() => setSimLogsExpanded(true)}>
                      show all
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Call Trace Tree (simulation only) */}
            {result.simulated && result.callTrace && (
              <div className={styles.traceSection}>
                <h3 className={styles.traceTitle}>Call Trace</h3>
                <div className={styles.traceTree}>
                  {renderCallTraceNode(result.callTrace, 0)}
                </div>
              </div>
            )}

            {/* Asset Changes (simulation only) */}
            {result.simulated && result.assetChanges && result.assetChanges.length > 0 && (
              <div className={styles.assetSection}>
                <h3 className={styles.assetTitle}>Asset Changes ({result.assetChanges.length})</h3>
                <div className={styles.assetList}>
                  {result.assetChanges.map((change, index) => (
                    <div key={index} className={styles.assetItem}>
                      <div className={styles.assetHeader}>
                        <span className={styles.assetType}>{change.type || 'TRANSFER'}</span>
                        <span className={styles.assetToken}>
                          {change.token_info?.symbol || change.token_info?.name || 'Unknown Token'}
                          {change.token_info?.contract_address && (
                            <span className={styles.assetTokenAddress}>({change.token_info.contract_address})</span>
                          )}
                        </span>
                      </div>
                      <div className={styles.assetDetails}>
                        {change.from && (
                          <span className={styles.assetFrom}>{change.from}</span>
                        )}
                        {change.from && change.to && (
                          <span className={styles.assetArrow}>→</span>
                        )}
                        {change.to && (
                          <span className={styles.assetTo}>{change.to}</span>
                        )}
                        <span className={styles.assetAmount}>
                          {change.amount || change.raw_amount}
                          {change.dollar_value && (
                            <span className={styles.assetUsd}> (${Number(change.dollar_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Balance changes (simulation only) */}
            {result.simulated && result.balanceChanges && result.balanceChanges.length > 0 && (
              <div className={styles.balanceSection}>
                <h3 className={styles.balanceTitle}>Balance Changes ({result.balanceChanges.length})</h3>
                {result.balanceChanges.map((change, index) => (
                  <div key={index} className={styles.balanceItem}>
                    <div className={styles.balanceAddress}>
                      {change.address?.slice(0, 10)}...{change.address?.slice(-8)}
                    </div>
                    <div className={styles.balanceValues}>
                      <span className={styles.balanceBefore}>
                        {change.before != null ? (BigInt(change.before) / BigInt(10 ** 18)).toString() : '?'} ETH
                      </span>
                      <span className={styles.balanceArrow}>→</span>
                      <span className={styles.balanceAfter}>
                        {change.after != null ? (BigInt(change.after) / BigInt(10 ** 18)).toString() : '?'} ETH
                      </span>
                      {change.diff != null && (
                        <span className={`${styles.balanceDiff} ${BigInt(change.diff) >= 0n ? styles.balanceDiffPositive : styles.balanceDiffNegative}`}>
                          ({BigInt(change.diff) >= 0n ? '+' : ''}{(BigInt(change.diff) / BigInt(10 ** 18)).toString()} ETH)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* State/Storage changes (simulation only) */}
            {result.simulated && result.stateChanges && result.stateChanges.length > 0 && (
              <div className={styles.stateSection}>
                <h3 className={styles.stateTitle}>Storage Access ({result.stateChanges.length})</h3>
                {result.stateChanges.map((change, index) => (
                  <div key={index} className={styles.stateItem}>
                    <div className={styles.stateAddress}>
                      {change.address?.slice(0, 10)}...{change.address?.slice(-8)}
                    </div>
                    {/* Tenderly format: change.changes */}
                    {change.changes && change.changes.length > 0 && (
                      <div className={styles.stateChanges}>
                        {change.changes.map((c, i) => (
                          <div key={i} className={styles.stateChange}>
                            <div className={styles.stateSlot}>
                              <span className={styles.stateSlotLabel}>Slot:</span> {c.key || c.slot}
                            </div>
                            {c.original !== undefined && (
                              <div className={styles.stateOriginal}>
                                <span className={styles.stateLabel}>Before:</span> {c.original}
                              </div>
                            )}
                            {c.dirty !== undefined && (
                              <div className={styles.stateDirty}>
                                <span className={styles.stateLabel}>After:</span> {c.dirty}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Tevm format: change.storage */}
                    {change.storage && change.storage.length > 0 && (
                      <div className={styles.stateChanges}>
                        {change.storage.map((s, i) => (
                          <div key={i} className={styles.stateChange}>
                            <div className={styles.stateSlot}>
                              <span className={styles.stateSlotLabel}>Slot:</span> {s.slot}
                            </div>
                            <div className={styles.stateDirty}>
                              <span className={styles.stateLabel}>Value:</span> {s.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Decoded outputs - always show for Call, show on "Show Full" for Simulate */}
            {(!result.simulated || showFullResponse) && (
              <>
                {/* Decoded outputs */}
                {result.decoded && result.decoded.length > 0 && (
                  <div className={styles.decodedSection}>
                    <h3 className={styles.decodedTitle}>Decoded Output</h3>
                    {result.decoded.map((output, index) => (
                      <div key={index} className={styles.decodedItem}>
                        <div className={styles.decodedHeader}>
                          <span className={styles.decodedName}>{output.name}</span>
                          <span className={styles.decodedType}>{output.type}</span>
                        </div>
                        <div className={styles.decodedValue}>
                          {typeof output.value === 'object'
                            ? JSON.stringify(output.value, null, 2)
                            : String(output.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Raw data and Full JSON/YAML output - only shown when Show Full is clicked */}
            {showFullResponse && (
              <>
                {/* Raw data */}
                {result.rawData && (
                  <div className={styles.rawSection}>
                    <h3 className={styles.rawTitle}>Raw Response</h3>
                    <div className={styles.rawData}>{result.rawData}</div>
                  </div>
                )}
              </>
            )}

            {/* Full JSON/YAML output - only shown when Show Full is clicked */}
            {showFullResponse && (
              <div className={styles.fullOutput}>
                <pre
                  className={styles.json}
                  dangerouslySetInnerHTML={{ __html: getDisplayContent() }}
                />
              </div>
            )}
            </>
            )}
          </div>
        )}

        {history.filter(item => item.chain === chain).length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h3>Recent Calls ({history.filter(item => item.chain === chain).length})</h3>
              <div className={styles.historyActions}>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={styles.historyToggle}
                  type="button"
                >
                  {showHistory ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={clearHistory}
                  className={styles.historyClear}
                  type="button"
                >
                  Clear All
                </button>
              </div>
            </div>

            {showHistory && (
              <div className={styles.historyList}>
                {history.filter(item => item.chain === chain).map((item) => (
                  <div
                    key={item.id}
                    className={styles.historyItem}
                    onClick={() => loadFromHistory(item)}
                  >
                    <div className={styles.historyTop}>
                      <div className={styles.historyChain}>{getChainInfo(item.chain)?.name || item.chain}</div>
                      <span className={item.isWrite ? styles.historyWriteBadge : styles.historyReadBadge}>
                        {item.isWrite ? 'W' : 'R'}
                      </span>
                      <div className={styles.historyFunc} title={(() => {
                        const argsStr = (item.args || []).join(', ')
                        const funcCall = `${item.functionName}(${argsStr})`
                        const decoded = item.output?.decoded || []
                        const outputStr = decoded.length > 0
                          ? `(${decoded.map(d => d.value).join(', ')})`
                          : ''
                        return outputStr ? `${funcCall} -> ${outputStr}` : funcCall
                      })()}>
                        {(() => {
                          const argsStr = (item.args || []).join(', ')
                          const funcCall = `${item.functionName}(${argsStr})`
                          const decoded = item.output?.decoded || []
                          const outputStr = decoded.length > 0
                            ? `(${decoded.map(d => d.value).join(', ')})`
                            : ''
                          const fullStr = outputStr ? `${funcCall} -> ${outputStr}` : funcCall
                          const maxLen = 90
                          return fullStr.length > maxLen ? fullStr.slice(0, maxLen) + '...' : fullStr
                        })()}
                      </div>
                    </div>
                    <div className={styles.historyContract}>
                      {item.contractName || 'Unknown Contract'}
                    </div>
                    <div className={styles.historyAddress}>
                      {item.address}
                    </div>
                    <div className={styles.historyTime}>
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bookmark Modal */}
      {showBookmarkModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => { setShowBookmarkModal(false); setBookmarkAddress(''); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowBookmarkModal(false); setBookmarkAddress(''); } }}
          tabIndex={-1}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              {(bookmarkAddress || address) && getBookmarkedAddress(bookmarkAddress || address) ? 'Edit Bookmark' : 'Add to Address Book'}
            </h3>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Address</label>
                <div className={styles.modalAddress}>{bookmarkAddress || address}</div>
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Label</label>
                <input
                  type="text"
                  ref={bookmarkInputRef}
                  value={bookmarkLabel}
                  onChange={(e) => setBookmarkLabel(e.target.value)}
                  placeholder="e.g., USDC Token, Uniswap Router..."
                  className={styles.modalInput}
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Notes (optional)</label>
                <textarea
                  value={bookmarkNotes}
                  onChange={(e) => setBookmarkNotes(e.target.value)}
                  placeholder="Add any notes..."
                  className={styles.modalTextarea}
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              {(bookmarkAddress || address) && getBookmarkedAddress(bookmarkAddress || address) && (
                <button
                  onClick={handleRemoveBookmark}
                  className={styles.modalDeleteButton}
                  type="button"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => { setShowBookmarkModal(false); setBookmarkAddress(''); }}
                className={styles.modalCancelButton}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBookmark}
                className={styles.modalSaveButton}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Chain Modal */}
      {showAddChainModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => { setShowAddChainModal(false); setChainlistSearch(''); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowAddChainModal(false); setChainlistSearch(''); } }}
          tabIndex={-1}
        >
          <div className={styles.chainModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add Network</h3>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <input
                  type="text"
                  ref={chainSearchRef}
                  value={chainlistSearch}
                  onChange={(e) => setChainlistSearch(e.target.value)}
                  placeholder="Search networks by name or chain ID..."
                  className={styles.modalInput}
                />
              </div>

              {/* Added chains section - collapsible */}
              {customChains.length > 0 && (
                <div className={styles.addedChainsSection}>
                  <button
                    className={styles.addedChainsHeader}
                    onClick={() => setAddedChainsCollapsed(!addedChainsCollapsed)}
                  >
                    <span className={styles.collapseIcon}>{addedChainsCollapsed ? '▶' : '▼'}</span>
                    <span className={styles.modalLabel}>Added Networks ({customChains.length})</span>
                  </button>
                  {!addedChainsCollapsed && (
                    <div className={styles.addedChainsList}>
                      {customChains.map((c) => (
                        <div key={c.id} className={styles.addedChainItem}>
                          {c.icon && (
                            <img src={c.icon} alt="" className={styles.chainIconTiny} />
                          )}
                          <span className={styles.addedChainName}>{c.name}</span>
                          <span className={styles.addedChainId}>#{c.chainId}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removeCustomChain(c.id)
                            }}
                            className={styles.removeChainButton}
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Chainlist results */}
              <div className={styles.chainlistSection}>
                <label className={styles.modalLabel}>
                  Available Networks
                  {chainlistLoading && <span className={styles.loadingText}> (Loading...)</span>}
                </label>
                {chainlistError && (
                  <div className={styles.chainlistError}>{chainlistError}</div>
                )}
                {!chainlistLoading && !chainlistError && (
                  <div className={styles.chainlistResults}>
                    {getFilteredChainlist().map((chainData) => {
                      const added = isChainAdded(chainData)
                      return (
                        <div
                          key={chainData.chainId}
                          className={`${styles.chainlistItem} ${added ? styles.chainlistItemAdded : ''}`}
                          onClick={() => {
                            if (!added) {
                              addCustomChain(chainData)
                            }
                          }}
                        >
                          {chainData.icon && (
                            <img
                              src={`https://icons.llamao.fi/icons/chains/rsz_${chainData.icon}.jpg`}
                              alt=""
                              className={styles.chainIconSmall}
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          )}
                          <div className={styles.chainlistItemInfo}>
                            <span className={styles.chainlistItemName}>{chainData.name}</span>
                            <span className={styles.chainlistItemMeta}>
                              Chain ID: {chainData.chainId}
                              {chainData.nativeCurrency && ` • ${chainData.nativeCurrency.symbol}`}
                            </span>
                          </div>
                          {added ? (
                            <span className={styles.chainlistItemAdded}>Added</span>
                          ) : (
                            <button className={styles.addChainItemButton}>+ Add</button>
                          )}
                        </div>
                      )
                    })}
                    {getFilteredChainlist().length === 0 && !chainlistLoading && (
                      <div className={styles.chainlistEmpty}>
                        {chainlistSearch ? 'No networks found matching your search.' : 'No networks available.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => { setShowAddChainModal(false); setChainlistSearch(''); }}
                className={styles.modalCancelButton}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
