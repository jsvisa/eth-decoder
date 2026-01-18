'use client'

import { useState, useEffect, useRef } from 'react'
import { toFunctionSelector, encodeFunctionData } from 'viem'
import yaml from 'js-yaml'
import styles from './page.module.css'

const CHAINS = [
  { id: 'ethereum', name: 'Ethereum', icon: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg' },
  { id: 'arbitrum', name: 'Arbitrum', icon: 'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg' },
  { id: 'base', name: 'Base', icon: 'https://icons.llamao.fi/icons/chains/rsz_base.jpg' },
  { id: 'polygon', name: 'Polygon', icon: 'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg' },
  { id: 'bsc', name: 'BSC', icon: 'https://icons.llamao.fi/icons/chains/rsz_binance.jpg' },
]

const STORAGE_KEY = 'contract_caller_history'
const ABI_CACHE_PREFIX = 'abi-'
const TENDERLY_SETTINGS_KEY = 'tenderly_settings'
const API_KEYS_STORAGE_KEY = 'api_keys_settings'
const RPC_SETTINGS_KEY = 'rpc_settings'
const MAX_HISTORY_ITEMS = 50

// Expected chain IDs for validation
const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
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

// Get all cached contract addresses
const getCachedAddresses = () => {
  const addresses = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ABI_CACHE_PREFIX)) {
        const [, chainAndAddress] = key.split(ABI_CACHE_PREFIX)
        const [chain, address] = chainAndAddress.split('-')
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

export default function ContractCaller() {
  const [chain, setChain] = useState('ethereum')
  const [address, setAddress] = useState('')
  const [abi, setAbi] = useState('')
  const [parsedAbi, setParsedAbi] = useState(null)
  const [functions, setFunctions] = useState([])
  const [selectedFunction, setSelectedFunction] = useState('')
  const [args, setArgs] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetchingAbi, setFetchingAbi] = useState(false)
  const [error, setError] = useState(null)
  const [isYaml, setIsYaml] = useState(false)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(true)
  const [abiSource, setAbiSource] = useState(null) // 'cached', 'fetched', or null
  const [contractName, setContractName] = useState(null)
  const [showFullResponse, setShowFullResponse] = useState(false)
  const [cachedAddresses, setCachedAddresses] = useState([])
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
  const [urlCopied, setUrlCopied] = useState(false) // For share URL feedback
  const [calldataCopied, setCalldataCopied] = useState(false) // For copy calldata feedback
  const [testingEtherscan, setTestingEtherscan] = useState(false)
  const [etherscanTestResult, setEtherscanTestResult] = useState(null) // 'success' | 'error' | null
  const [testingTenderly, setTestingTenderly] = useState(false)
  const [tenderlyTestResult, setTenderlyTestResult] = useState(null) // 'success' | 'error' | null
  const [testingRpc, setTestingRpc] = useState({}) // { [chain]: boolean }
  const [rpcTestResult, setRpcTestResult] = useState({}) // { [chain]: 'success' | 'error' | null }
  const [selectedRpcChain, setSelectedRpcChain] = useState('ethereum') // For RPC settings dropdown
  // Store pending args with context to handle race conditions when switching contracts
  const pendingHistoryRef = useRef(null) // { functionName, args, timestamp }

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

  // Load history, cached addresses, and Tenderly settings on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
      setCachedAddresses(getCachedAddresses())

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
      // Set chain first if provided
      if (urlChain && CHAINS.some(c => c.id === urlChain)) {
        setChain(urlChain)
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
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
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
      setSelectedFunction('')
      setArgs([])
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
      setArgs(func.inputs.map(() => ''))
    } else {
      setArgs([])
    }
  }, [selectedFunction, parsedAbi, address])

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
    } catch (err) {
      setError(err.message)
    } finally {
      setFetchingAbi(false)
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
      const expectedChainId = CHAIN_IDS[chainId]

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

  const handleCall = async () => {
    if (!address || !selectedFunction || !parsedAbi) {
      setError('Please fill in all required fields')
      return
    }

    const selectedFunc = getSelectedFunction()
    const isWrite = !isReadOnly(selectedFunc)

    // Check Tenderly configuration for write functions
    if (isWrite && !isTenderlyConfigured()) {
      setError('Please configure Tenderly API settings to simulate write functions')
      setShowSettings(true)
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Use different API for read vs write functions
      const apiEndpoint = isWrite ? '/api/simulate' : '/api/call-contract'

      const requestBody = {
        chain,
        address,
        functionName: selectedFunction,
        args,
        abi: parsedAbi,
      }

      // Add custom RPC if configured for this chain
      if (rpcSettings[chain]) {
        requestBody.rpcUrl = rpcSettings[chain]
      }

      // Add Tenderly credentials for write functions
      if (isWrite) {
        requestBody.fromAddress = fromAddress || undefined
        requestBody.tenderlyAccessKey = tenderlySettings.accessKey
        requestBody.tenderlyAccount = tenderlySettings.account
        requestBody.tenderlyProject = tenderlySettings.project
        // Add ETH value for payable functions
        if (ethValue && parseFloat(ethValue) > 0) {
          requestBody.value = ethValue
        }
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to call contract')
      }

      // For simulation, check if it was successful
      if (isWrite && data.success === false) {
        setError(data.error || 'Simulation failed: transaction would revert')
        setResult(data) // Still show result for debugging
      } else {
        setResult(data)
      }

      saveToHistory({ chain, address, selectedFunction, args }, data, isWrite)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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

              {/* Tenderly Settings */}
              <div className={styles.settingsGroup}>
                <h3 className={styles.settingsTitle}>
                  Tenderly API Settings
                  {isTenderlyConfigured() && <span className={styles.settingsCheck}>✓</span>}
                </h3>
                <p className={styles.settingsDesc}>
                  Required for simulating write functions. Get your credentials from{' '}
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
                      <img
                        src={CHAINS.find(c => c.id === selectedRpcChain)?.icon}
                        alt=""
                        className={styles.chainIconSmall}
                      />
                      <select
                        value={selectedRpcChain}
                        onChange={(e) => setSelectedRpcChain(e.target.value)}
                        className={styles.select}
                      >
                        {CHAINS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {rpcSettings[c.id] ? '✓' : ''}
                          </option>
                        ))}
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
                        placeholder={`Custom RPC URL for ${CHAINS.find(c => c.id === selectedRpcChain)?.name}...`}
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
                        const chainInfo = CHAINS.find(c => c.id === chainId)
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
            <div className={styles.field}>
              <label className={styles.label}>Network</label>
              <div className={styles.chainSelectWithIcon}>
                <img
                  src={CHAINS.find(c => c.id === chain)?.icon}
                  alt=""
                  className={styles.chainIconSmall}
                />
                <select
                  value={chain}
                  onChange={(e) => setChain(e.target.value)}
                  className={styles.select}
                  disabled={loading}
                >
                  {CHAINS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field} style={{ flex: 2 }}>
              <div className={styles.addressLabelRow}>
                <label className={styles.label}>Contract Address</label>
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
                    }}
                    onFocus={() => setShowAddressSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                    placeholder="0x..."
                    className={styles.input}
                    disabled={loading}
                  />
                  {showAddressSuggestions && cachedAddresses.length > 0 && (
                    <div className={styles.addressSuggestions}>
                      {cachedAddresses
                        .filter(item =>
                          item.chain === chain &&
                          (addressFilter === '' ||
                           item.address.toLowerCase().includes(addressFilter.toLowerCase()) ||
                           (item.contractName && item.contractName.toLowerCase().includes(addressFilter.toLowerCase())))
                        )
                        .slice(0, 10)
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className={styles.addressSuggestionItem}
                            onClick={() => {
                              setAddress(item.address)
                              setShowAddressSuggestions(false)
                            }}
                          >
                            <span className={styles.suggestionName}>
                              {item.contractName || 'Unknown'}
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
          </div>

          {functions.length > 0 && (
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
                      <span
                        className={`${styles.selectedFunctionText} ${copiedItem === 'signature' ? styles.copiedText : ''}`}
                        onClick={async () => {
                          const func = getSelectedFunction()
                          const sig = `${selectedFunction}(${func.inputs.map(i => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')})`
                          await navigator.clipboard.writeText(sig)
                          setCopiedItem('signature')
                          setTimeout(() => setCopiedItem(null), 1500)
                        }}
                        title="Click to copy function signature"
                      >
                        {copiedItem === 'signature' ? '✓ Copied!' : `${selectedFunction}(${getSelectedFunction().inputs.map(i => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')})`}
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
                        </div>
                      ))}
                      {getFilteredFunctions().length === 0 && (
                        <div className={styles.functionItemEmpty}>No matching functions</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* From Address for write functions (optional) */}
              {selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction()) && (
                <div className={styles.field}>
                  <label className={styles.label}>
                    From Address <span className={styles.optional}>(optional, for simulation)</span>
                  </label>
                  <input
                    type="text"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    placeholder="0x... (sender address for simulation)"
                    className={styles.input}
                    disabled={loading}
                  />
                </div>
              )}

              {/* ETH Value for payable functions */}
              {selectedFunction && getSelectedFunction() && isPayable(getSelectedFunction()) && (
                <div className={styles.field}>
                  <label className={styles.label}>
                    ETH Value <span className={styles.payableBadge}>payable</span>
                  </label>
                  <input
                    type="text"
                    value={ethValue}
                    onChange={(e) => setEthValue(e.target.value)}
                    placeholder="0.0 (ETH to send with transaction)"
                    className={styles.input}
                    disabled={loading}
                  />
                </div>
              )}

              {selectedFunction && getSelectedFunctionInputs().length > 0 && (
                <div className={styles.argsSection}>
                  <label className={styles.label}>Arguments</label>
                  {getSelectedFunctionInputs().map((input, index) => (
                    <div key={index} className={styles.argField}>
                      <label className={styles.argLabel}>
                        {input.name || `arg${index}`} ({input.type})
                      </label>
                      <input
                        type="text"
                        value={args[index] || ''}
                        onChange={(e) => {
                          const newArgs = [...args]
                          newArgs[index] = e.target.value
                          setArgs(newArgs)
                        }}
                        placeholder={`Enter ${input.type}...`}
                        className={styles.input}
                        disabled={loading}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className={styles.buttonGroup}>
            <button
              onClick={handleCall}
              className={`${styles.button} ${selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction()) ? styles.simulateButton : ''}`}
              disabled={loading || !selectedFunction}
            >
              {loading
                ? (selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction()) ? 'Simulating...' : 'Calling...')
                : (selectedFunction && getSelectedFunction() && !isReadOnly(getSelectedFunction()) ? 'Simulate Call' : 'Call Contract')
              }
            </button>
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
        </div>

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
                <h3 className={styles.logsTitle}>Event Logs ({result.logs.length})</h3>
                {result.logs.map((log, index) => (
                  <div key={index} className={styles.logItem}>
                    <div className={styles.logHeader}>
                      <span className={styles.logName}>{log.name || 'Unknown Event'}</span>
                      <span className={styles.logAddress}>
                        {log.address?.slice(0, 10)}...{log.address?.slice(-8)}
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
                ))}
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

            {/* State changes (simulation only) */}
            {result.simulated && result.stateChanges && result.stateChanges.length > 0 && (
              <div className={styles.stateSection}>
                <h3 className={styles.stateTitle}>State Changes ({result.stateChanges.length})</h3>
                {result.stateChanges.map((change, index) => (
                  <div key={index} className={styles.stateItem}>
                    <div className={styles.stateAddress}>
                      {change.address?.slice(0, 10)}...{change.address?.slice(-8)}
                    </div>
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
                  </div>
                ))}
              </div>
            )}

            {/* Decoded outputs and Raw data - always show for Call, show on "Show Full" for Simulate */}
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

        {history.length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h3>Recent Calls ({history.length})</h3>
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
                {history.map((item) => (
                  <div
                    key={item.id}
                    className={styles.historyItem}
                    onClick={() => loadFromHistory(item)}
                  >
                    <div className={styles.historyTop}>
                      <div className={styles.historyChain}>{item.chain}</div>
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
    </main>
  )
}
