'use client'

import { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import styles from './page.module.css'

const CHAINS = [
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'base', name: 'Base' },
  { id: 'polygon', name: 'Polygon' },
  { id: 'bsc', name: 'BSC' },
]

const STORAGE_KEY = 'contract_caller_history'
const ABI_CACHE_PREFIX = 'abi-'
const TENDERLY_SETTINGS_KEY = 'tenderly_settings'
const API_KEYS_STORAGE_KEY = 'api_keys_settings'
const MAX_HISTORY_ITEMS = 50

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
  const [resultCollapsed, setResultCollapsed] = useState(false)

  // Helper to check if function is read-only
  const isReadOnly = (func) => {
    return func?.stateMutability === 'view' || func?.stateMutability === 'pure'
  }

  // Get selected function object
  const getSelectedFunction = () => {
    if (!selectedFunction || !parsedAbi) return null
    return parsedAbi.find(
      (item) => item.type === 'function' && item.name === selectedFunction
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
    } catch (err) {
      console.error('Failed to load history:', err)
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
      setAbi(JSON.stringify(cached.abi, null, 2))
      const nameDisplay = cached.isProxy && cached.implContractName
        ? `${cached.contractName} → ${cached.implContractName}`
        : cached.contractName
      setContractName(nameDisplay)
      setAbiSource(cached.isProxy ? `cached (proxy → ${cached.implAddress?.slice(0, 10)}...)` : 'cached')
    } else {
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
      setArgs([])
      return
    }

    const func = parsedAbi.find(
      (item) => item.type === 'function' && item.name === selectedFunction
    )

    if (func && func.inputs) {
      setArgs(func.inputs.map(() => ''))
    } else {
      setArgs([])
    }
  }, [selectedFunction, parsedAbi])

  const fetchAbi = async (forceRefresh = false) => {
    if (!address.trim()) {
      setError('Please enter a contract address')
      return
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedAbi(chain, address)
      if (cached) {
        setAbi(JSON.stringify(cached.abi, null, 2))
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
      const response = await fetch(`/api/fetch-abi?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch ABI')
      }

      // Cache the fetched ABI
      setCachedAbi(chain, address, data.abi, data.isProxy, data.implAddress, data.contractName, data.implContractName)

      // Update cached addresses list
      setCachedAddresses(getCachedAddresses())

      setAbi(JSON.stringify(data.abi, null, 2))
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
    setChain(item.chain)
    setAddress(item.address)
    setSelectedFunction(item.functionName)
    setArgs(item.args)
    setResult(item.output)
    setError(null)
  }

  const clearHistory = () => {
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

  const isTenderlyConfigured = () => {
    return tenderlySettings.accessKey && tenderlySettings.account && tenderlySettings.project
  }

  const isEtherscanConfigured = () => {
    return !!apiKeys.etherscan
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

      // Add Tenderly credentials for write functions
      if (isWrite) {
        requestBody.fromAddress = fromAddress || undefined
        requestBody.tenderlyAccessKey = tenderlySettings.accessKey
        requestBody.tenderlyAccount = tenderlySettings.account
        requestBody.tenderlyProject = tenderlySettings.project
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
              <span className={styles.traceTooltip}>{contractAddress}</span>
            </span>
            <span className={styles.traceDot}>.</span>
            <span className={styles.traceFuncWrapper}>
              <span className={styles.traceFuncName}>{funcName}</span>
              {trace.input && <span className={styles.traceTooltip}>{trace.input}</span>}
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

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Contract Caller</h1>

        {/* Settings Panel */}
        <div className={styles.settingsSection}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`${styles.settingsToggle} ${isEtherscanConfigured() && isTenderlyConfigured() ? styles.settingsConfigured : ''}`}
            type="button"
          >
            {isEtherscanConfigured() && isTenderlyConfigured()
              ? '✓ API Keys Configured'
              : `⚙ Settings ${isEtherscanConfigured() ? '(Etherscan ✓)' : ''} ${isTenderlyConfigured() ? '(Tenderly ✓)' : ''}`}
          </button>

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
                <div className={styles.settingsField}>
                  <input
                    type="password"
                    value={apiKeys.etherscan}
                    onChange={(e) => saveApiKeys({ ...apiKeys, etherscan: e.target.value })}
                    placeholder="Enter your Etherscan API key..."
                    className={styles.settingsInput}
                  />
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
                    <span className={isReadOnly(getSelectedFunction()) ? styles.readBadge : styles.writeBadge}>
                      {isReadOnly(getSelectedFunction()) ? 'read' : 'write'}
                    </span>
                  )}
                </div>
                <select
                  value={selectedFunction}
                  onChange={(e) => setSelectedFunction(e.target.value)}
                  className={styles.select}
                  disabled={loading}
                >
                  <option value="">Select a function...</option>
                  {functions.map((func) => (
                    <option key={func.name} value={func.name}>
                      [{isReadOnly(func) ? 'R' : 'W'}] {func.name}({func.inputs.map((i) => `${i.type} ${i.name}`).join(', ')})
                    </option>
                  ))}
                </select>
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

            {/* Gas used (simulation only) */}
            {result.simulated && result.gasUsed && (
              <div className={styles.gasSection}>
                <h3 className={styles.gasTitle}>Gas Used</h3>
                <div className={styles.gasValue}>{result.gasUsed.toLocaleString()}</div>
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
                        </span>
                      </div>
                      <div className={styles.assetDetails}>
                        {change.from && (
                          <div className={styles.assetFrom}>
                            From: {change.from}
                          </div>
                        )}
                        {change.to && (
                          <div className={styles.assetTo}>
                            To: {change.to}
                          </div>
                        )}
                        <div className={styles.assetAmount}>
                          {change.amount || change.raw_amount}
                        </div>
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

            {/* Raw data */}
            {result.rawData && (
              <div className={styles.rawSection}>
                <h3 className={styles.rawTitle}>Raw Response</h3>
                <div className={styles.rawData}>{result.rawData}</div>
              </div>
            )}

            {/* Full JSON/YAML output - collapsible */}
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
                      <div className={styles.historyFunc}>{item.functionName}</div>
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
