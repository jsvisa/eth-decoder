// desktop/pages/contract-caller/ResultPanel.jsx
import { useState } from 'react'
import styles from './ResultPanel.module.css'

const TABS = ['result', 'logs', 'trace', 'state']

export default function ResultPanel({ result, logs, trace, stateDiff, error, isLoading }) {
  const [activeTab, setActiveTab] = useState('result')

  function copyTab() {
    const data = { result, logs, trace, state: stateDiff }[activeTab]
    navigator.clipboard.writeText(JSON.stringify(data ?? null, null, 2))
  }

  const tabLabels = {
    result: 'Result',
    logs:   `Logs${logs?.length ? ` (${logs.length})` : ''}`,
    trace:  'Trace',
    state:  'State Diff',
  }

  return (
    <div className={styles.root}>
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t}
            className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
        <button className={styles.copyTabBtn} onClick={copyTab}>Copy JSON</button>
      </div>

      <div className={styles.scroll}>
        {isLoading && <div className={styles.emptyTab}>Running…</div>}

        {!isLoading && activeTab === 'result' && (
          <>
            {error && <div className={styles.errorCard}>{error}</div>}
            {result != null && !error && (
              <div className={styles.successCard}>
                <div className={styles.resultValue}>{JSON.stringify(result)}</div>
              </div>
            )}
            {result == null && !error && (
              <div className={styles.emptyTab}>Call a function to see results</div>
            )}
          </>
        )}

        {!isLoading && activeTab === 'logs' && (
          <>
            {(!logs || logs.length === 0) && <div className={styles.emptyTab}>No logs</div>}
            {logs?.map((log, i) => (
              <div key={i} className={styles.logCard}>
                <div className={styles.logHeader}>
                  <span className={styles.logEvent}>{log.event || log.name || 'Event'}</span>
                  <span className={styles.logContract}>
                    {log.address ? `${log.address.slice(0,6)}…${log.address.slice(-4)}` : ''}
                  </span>
                </div>
                {log.args && (
                  <div className={styles.logArgs}>
                    {Object.entries(log.args).map(([k, v]) => (
                      <div key={k} className={styles.logArg}>
                        <span className={styles.logArgName}>{k}</span>
                        <span className={styles.logArgValue}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {!isLoading && activeTab === 'trace' && (
          <>
            {!trace && <div className={styles.emptyTab}>No trace available</div>}
            {trace && <TraceTree node={trace} depth={0} />}
          </>
        )}

        {!isLoading && activeTab === 'state' && (
          <>
            {(!stateDiff || stateDiff.length === 0) && (
              <div className={styles.emptyTab}>No state changes</div>
            )}
            {stateDiff?.length > 0 && (
              <table className={styles.diffTable}>
                <thead>
                  <tr><th>Contract</th><th>Slot</th><th>Before</th><th>After</th></tr>
                </thead>
                <tbody>
                  {stateDiff.map((row, i) => (
                    <tr key={i}>
                      <td>{row.address ? `${row.address.slice(0,6)}…${row.address.slice(-4)}` : '—'}</td>
                      <td>{row.slot}</td>
                      <td>{row.before}</td>
                      <td>{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TraceTree({ node, depth }) {
  const [open, setOpen] = useState(depth < 2)
  if (!node) return null
  const label = `${'  '.repeat(depth)}${node.type || 'CALL'} ${node.to || ''}.${node.function || ''}()`
  return (
    <div>
      <div className={styles.traceNode} onClick={() => setOpen(v => !v)}>
        {node.calls?.length ? (open ? '▼ ' : '▶ ') : '  '}{label}
      </div>
      {open && node.calls?.map((child, i) => (
        <TraceTree key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}
