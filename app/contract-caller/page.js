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

  // Load history and cached addresses on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
      setCachedAddresses(getCachedAddresses())
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

      // Filter for read-only functions (view/pure)
      const readFunctions = parsed.filter(
        (item) =>
          item.type === 'function' &&
          (item.stateMutability === 'view' || item.stateMutability === 'pure')
      )

      setFunctions(readFunctions)
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

  const saveToHistory = (callData, output) => {
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

  const handleCall = async () => {
    if (!address || !selectedFunction || !parsedAbi) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/call-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain,
          address,
          functionName: selectedFunction,
          args,
          abi: parsedAbi,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to call contract')
      }

      setResult(data)
      saveToHistory({ chain, address, selectedFunction, args }, data)
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
                <label className={styles.label}>Function</label>
                <select
                  value={selectedFunction}
                  onChange={(e) => setSelectedFunction(e.target.value)}
                  className={styles.select}
                  disabled={loading}
                >
                  <option value="">Select a function...</option>
                  {functions.map((func) => (
                    <option key={func.name} value={func.name}>
                      {func.name}({func.inputs.map((i) => `${i.type} ${i.name}`).join(', ')})
                    </option>
                  ))}
                </select>
              </div>

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
            className={styles.button}
            disabled={loading || !selectedFunction}
          >
            {loading ? 'Calling...' : 'Call Contract'}
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
              <h2>Result:</h2>
              <div className={styles.resultActions}>
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
              </div>
            </div>

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

            {/* Full JSON/YAML output - collapsible */}
            {showFullResponse && (
              <div className={styles.fullOutput}>
                <pre
                  className={styles.json}
                  dangerouslySetInnerHTML={{ __html: getDisplayContent() }}
                />
              </div>
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
                      <div className={styles.historyFunc}>{item.functionName}</div>
                    </div>
                    <div className={styles.historyContract}>
                      {item.contractName || `${item.address.slice(0, 10)}...${item.address.slice(-8)}`}
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
