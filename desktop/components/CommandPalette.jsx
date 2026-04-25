// desktop/components/CommandPalette.jsx
import { useState, useEffect, useRef } from 'react'
import styles from './CommandPalette.module.css'

function buildCommands(onNavigate) {
  return [
    { id: 'go-decoder',         label: 'Go to Decoder',        icon: '⬡', action: () => onNavigate('decoder') },
    { id: 'go-contract-caller', label: 'Go to Contract Caller', icon: '⚙', action: () => onNavigate('contract-caller') },
    { id: 'go-contracts',       label: 'Go to Contracts',       icon: '📄', action: () => onNavigate('contracts') },
    { id: 'go-address-book',    label: 'Go to Address Book',    icon: '📖', action: () => onNavigate('address-book') },
  ]
}

export default function CommandPalette({ onNavigate, onClose }) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const commands = buildCommands(onNavigate)

  const filtered = query
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  function handleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIdx]) { filtered[activeIdx].action(); onClose() }
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.inputWrap}>
          <span className={styles.searchIcon}>⌘</span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Jump to page, load contract, decode tx…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>
        <div className={styles.results}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No results for "{query}"</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
              onClick={() => { cmd.action(); onClose() }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={styles.itemIcon}>{cmd.icon}</span>
              <span className={styles.itemLabel}>{cmd.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
