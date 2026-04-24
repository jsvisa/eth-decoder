// desktop/pages/ContractCallerPage.jsx
import { useState, useCallback, useEffect } from 'react'
import { callContract, simulate, fetchAbi } from '../platform'
import { parseArg } from '../utils/argParser'
import { getCachedAbi, setCachedAbi } from '@app/utils/abiCache'
import { shortenAddress } from '../utils/valueFormat'
import FunctionList from './contract-caller/FunctionList'
import ArgumentsPanel from './contract-caller/ArgumentsPanel'
import ResultPanel from './contract-caller/ResultPanel'
import styles from './ContractCallerPage.module.css'

const CHAINS = ['ethereum', 'arbitrum', 'base', 'polygon', 'bsc']

function getSettings(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}

export default function ContractCallerPage() {
  const [address, setAddress]           = useState('')
  const [addressInput, setAddressInput] = useState('')
  const [editingAddr, setEditingAddr]   = useState(false)
  const [chain, setChain]               = useState('ethereum')
  const [abi, setAbi]                   = useState([])
  const [contractName, setContractName] = useState('')
  const [selectedFn, setSelectedFn]     = useState(null)
  const [args, setArgs]                 = useState({})
  const [simulationOn, setSimulationOn] = useState(false)
  const [isLoading, setIsLoading]       = useState(false)
  const [result, setResult]             = useState(null)
  const [error, setError]               = useState(null)
  const [logs, setLogs]                 = useState([])
  const [trace, setTrace]               = useState(null)
  const [stateDiff, setStateDiff]       = useState(null)

  // Load cached ABI when address + chain change
  useEffect(() => {
    if (!address) return
    const cached = getCachedAbi(chain, address)
    if (cached) {
      setAbi(cached.abi || [])
      setContractName(cached.contractName || '')
    }
  }, [address, chain])

  const handleCall = useCallback(async () => {
    if (!selectedFn || !address) return
    setIsLoading(true)
    setError(null)
    setResult(null)
    setLogs([])
    setTrace(null)
    setStateDiff(null)

    try {
      const parsedArgs = (selectedFn.inputs || [])
        .map(inp => parseArg(args[inp.name] ?? '', inp.type))
        .filter(v => v !== undefined)

      const isWrite = !['view', 'pure'].includes(selectedFn.stateMutability)
      const rpcSettings = getSettings('rpc_settings')

      if (!isWrite || !simulationOn) {
        const resp = await callContract({
          chain,
          address,
          functionName: selectedFn.name,
          args: parsedArgs,
          abi,
          rpcUrl: rpcSettings[chain],
          blockNumber: args._blockNumber || undefined,
        })
        setResult(resp.result ?? resp)
      } else {
        const tenderly = getSettings('tenderly_settings')
        const resp = await simulate({
          chain,
          address,
          functionName: selectedFn.name,
          args: parsedArgs,
          abi,
          tenderlyAccessKey: tenderly.accessKey,
          tenderlyAccount: tenderly.account,
          tenderlyProject: tenderly.project,
          fromAddress: args._from,
          blockNumber: args._blockNumber,
        })
        setResult(resp.result ?? null)
        setLogs(resp.logs || [])
        setTrace(resp.callTrace || null)
        setStateDiff(resp.stateChanges || null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [selectedFn, address, chain, abi, args, simulationOn])

  // Cmd+Enter
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleCall()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleCall])

  async function handleLoadAbi() {
    if (!address) return
    setError(null)
    try {
      const apiKeys = getSettings('api_keys_settings')
      const rpcSettings = getSettings('rpc_settings')
      const data = await fetchAbi(address, chain, apiKeys.etherscan, {
        rpcUrl: rpcSettings[chain],
        detectProxy: true,
      })
      setAbi(data.abi || [])
      setContractName(data.name || '')
      setCachedAbi(chain, address, data.abi, data.proxyImplementation != null,
        data.proxyImplementation, data.name)
    } catch (err) {
      setError(`Failed to load ABI: ${err.message}`)
    }
  }

  function commitAddress() {
    setAddress(addressInput)
    setEditingAddr(false)
    setSelectedFn(null)
    setArgs({})
    setResult(null)
    setError(null)
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        {editingAddr ? (
          <div className={styles.addrEditWrap}>
            <input
              className={styles.addrInput}
              autoFocus
              value={addressInput}
              onChange={e => setAddressInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitAddress()
                if (e.key === 'Escape') setEditingAddr(false)
              }}
              placeholder="0x… contract address"
            />
            <select
              className={styles.chainSelect}
              value={chain}
              onChange={e => setChain(e.target.value)}
            >
              {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className={styles.tbarBtn} onClick={commitAddress}>Go</button>
          </div>
        ) : (
          <button
            className={styles.addrChip}
            onClick={() => { setAddressInput(address); setEditingAddr(true) }}
          >
            <span className={styles.chainBadge}>{chain.slice(0, 3).toUpperCase()}</span>
            <span className={styles.addrMono}>
              {address ? shortenAddress(address) : 'Enter address…'}
            </span>
            {contractName && (
              <span style={{ fontSize: 11, color: 'var(--accent)' }}>{contractName}</span>
            )}
          </button>
        )}

        <div className={styles.spacer} />

        <button
          className={`${styles.simBtn} ${simulationOn ? styles.simBtnActive : ''}`}
          onClick={() => setSimulationOn(v => !v)}
        >
          ⚡ {simulationOn ? 'Simulation on' : 'Simulation off'}
        </button>
        <button className={styles.tbarBtn} onClick={handleLoadAbi}>+ Load ABI</button>
      </div>

      <div className={styles.columns}>
        <FunctionList
          abi={abi}
          selectedFunction={selectedFn}
          onSelect={fn => { setSelectedFn(fn); setArgs({}) }}
        />
        <ArgumentsPanel
          selectedFunction={selectedFn}
          args={args}
          onChange={setArgs}
          onCall={handleCall}
          isLoading={isLoading}
        />
        <ResultPanel
          result={result}
          logs={logs}
          trace={trace}
          stateDiff={stateDiff}
          error={error}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
