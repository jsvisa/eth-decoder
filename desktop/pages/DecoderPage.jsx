// desktop/pages/DecoderPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { decode } from '../platform'
import { valueColorClass, formatNumericHint } from '../utils/valueFormat'
import styles from './DecoderPage.module.css'

const HISTORY_KEY = 'evm_decoder_history'
const MAX_HISTORY = 5

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') }
  catch { return [] }
}

function addToHistory(entry, current) {
  const next = [entry, ...current.filter(h => h.data !== entry.data)].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  return next
}

export default function DecoderPage({ onRecentChange }) {
  const [inputData, setInputData] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isDecoding, setIsDecoding] = useState(false)
  const [multicall, setMulticall] = useState(false)
  const [history, setHistory] = useState(loadHistory)

  useEffect(() => {
    onRecentChange?.(history.map(h => ({
      label: `${h.selector} — ${h.func?.split('(')[0] ?? '?'}`,
      data: h.data,
      onClick: () => {
        setInputData(h.data)
        handleDecode(h.data)
      },
    })))
  }, [history]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDecode = useCallback(async (data) => {
    const d = (data ?? inputData).trim()
    if (!d) return
    setIsDecoding(true)
    setError(null)
    setResult(null)
    try {
      const res = await decode(d, { count: 3, multicall, withAbi: true })
      if (res.msg === 'ok' && res.data?.length > 0) {
        const item = res.data[0]
        setResult(item)
        setHistory(prev => addToHistory({
          data: d,
          selector: d.slice(0, 10),
          func: item.func,
        }, prev))
      } else {
        setError('Unknown selector — not found in local database')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDecoding(false)
    }
  }, [inputData, multicall])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault(); handleDecode()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault()
        document.getElementById('decoder-input')?.focus()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        if (result) navigator.clipboard.writeText(JSON.stringify(result, null, 2))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleDecode, result])

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Decoder</span>
        <label className={styles.toggleLabel}>
          <input type="checkbox" checked={multicall} onChange={e => setMulticall(e.target.checked)} />
          <span className={styles.togglePill} />
          Multicall
        </label>
        <div className={styles.spacer} />
        <button className={styles.hintBtn}><kbd>⌘K</kbd> Quick open</button>
      </div>

      <div className={styles.split}>
        <div className={styles.paneInput}>
          <div className={styles.paneLabel}>
            <span>Input</span>
            <span>hex calldata</span>
          </div>
          <textarea
            id="decoder-input"
            className={styles.hexInput}
            value={inputData}
            onChange={e => setInputData(e.target.value)}
            placeholder="Paste hex calldata… (0x…)"
            spellCheck={false}
          />
          <div className={styles.inputFooter}>
            <button
              className={styles.decodeBtn}
              onClick={() => handleDecode()}
              disabled={isDecoding}
            >
              {isDecoding ? 'Decoding…' : 'Decode'} <kbd>⌘↵</kbd>
            </button>
            <span className={styles.charCount}>{inputData.length} chars</span>
          </div>
        </div>

        <div className={styles.paneOutput}>
          {!result && !error && !isDecoding && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>⬡</span>
              <span>Decode a transaction to see results</span>
            </div>
          )}
          {isDecoding && (
            <div className={styles.emptyState}><span>Decoding…</span></div>
          )}
          {error && <div className={styles.errorCard}>{error}</div>}
          {result && <ResultOutput result={result} styles={styles} />}
        </div>
      </div>
    </div>
  )
}

function ResultOutput({ result, styles }) {
  const inputs = result.abi?.inputs || []
  const typeMap = Object.fromEntries(inputs.map(inp => [inp.name, inp.type]))

  function copyJSON() {
    navigator.clipboard.writeText(JSON.stringify({ func: result.func, args: result.args }, null, 2))
  }
  function copyYAML() {
    const lines = [`func: ${result.func}`, 'args:',
      ...Object.entries(result.args || {}).map(([k, v]) => `  ${k}: ${v}`)]
    navigator.clipboard.writeText(lines.join('\n'))
  }

  return (
    <div className={styles.result}>
      <div className={styles.resultHeader}>
        <span className={styles.funcSig}>{result.func}</span>
      </div>
      <div className={styles.argList}>
        {Object.entries(result.args || {}).map(([name, value]) => {
          const type = typeMap[name] || 'unknown'
          const hint = formatNumericHint(String(value), type)
          return (
            <div key={name} className={styles.argRow}>
              <span className={`${styles.argName} ${styles[valueColorClass(type)]}`}>{name}</span>
              <span className={styles.argType}>{type}</span>
              <div className={styles.argValueWrap}>
                <div className={styles.argValue}>{String(value)}</div>
                {hint && <div className={styles.argHint}>{hint}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className={styles.copyRow}>
        <button className={styles.copyBtn} onClick={copyJSON}>Copy JSON</button>
        <button className={styles.copyBtn} onClick={copyYAML}>Copy YAML</button>
      </div>
    </div>
  )
}
