// desktop/pages/contract-caller/ArgumentsPanel.jsx
import { useState } from 'react'
import styles from './ArgumentsPanel.module.css'

export default function ArgumentsPanel({ selectedFunction, args, onChange, onCall, isLoading }) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  if (!selectedFunction) {
    return (
      <div className={styles.root}>
        <div className={styles.noFn}>Select a function from the list</div>
      </div>
    )
  }

  const isRead = ['view', 'pure'].includes(selectedFunction.stateMutability)
  const isPayable = selectedFunction.stateMutability === 'payable'
  const mainInputs = selectedFunction.inputs || []

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <div className={styles.fnTitle}>{selectedFunction.name}</div>
        <div className={styles.fnDesc}>
          {isRead ? 'Read-only call' : 'Write / simulation required'}
        </div>

        {mainInputs.map(inp => (
          <div key={inp.name} className={styles.field}>
            <div className={styles.fieldLabel}>
              {inp.name || 'value'}
              <span className={styles.typeTag}>{inp.type}</span>
            </div>
            <input
              className={styles.input}
              placeholder={inp.type === 'address' ? '0x…' : inp.type}
              value={args[inp.name] ?? ''}
              onChange={e => onChange({ ...args, [inp.name]: e.target.value })}
            />
          </div>
        ))}

        <button className={styles.disclosure} onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '⌄' : '›'} Advanced
        </button>

        {showAdvanced && (
          <>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Block number <span className={styles.typeTag}>optional</span></div>
              <input
                className={styles.input}
                placeholder="latest"
                value={args._blockNumber ?? ''}
                onChange={e => onChange({ ...args, _blockNumber: e.target.value })}
              />
            </div>
            {!isRead && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>From address <span className={styles.typeTag}>optional</span></div>
                <input
                  className={styles.input}
                  placeholder="0x… (sender for simulation)"
                  value={args._from ?? ''}
                  onChange={e => onChange({ ...args, _from: e.target.value })}
                />
              </div>
            )}
            {isPayable && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>ETH value <span className={styles.typeTag}>optional</span></div>
                <input
                  className={styles.input}
                  placeholder="0 (wei)"
                  value={args._value ?? ''}
                  onChange={e => onChange({ ...args, _value: e.target.value })}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.footer}>
        <button
          className={`${styles.callBtn} ${isRead ? styles.callBtnRead : styles.callBtnWrite}`}
          onClick={onCall}
          disabled={isLoading}
        >
          {isLoading ? 'Running…' : (isRead ? 'Call' : 'Simulate')}
          {!isLoading && <kbd>⌘↵</kbd>}
        </button>
      </div>
    </div>
  )
}
