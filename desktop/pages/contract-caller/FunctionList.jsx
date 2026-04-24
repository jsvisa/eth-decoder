// desktop/pages/contract-caller/FunctionList.jsx
import { useState, useEffect, useRef } from 'react'
import { groupFunctions, filterFunctions } from '../../utils/functionGroup'
import styles from './FunctionList.module.css'

export default function FunctionList({ abi, selectedFunction, onSelect }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const { read, write } = groupFunctions(abi)
  const filteredRead  = filterFunctions(read, query)
  const filteredWrite = filterFunctions(write, query)

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function renderItem(fn) {
    const isRead = ['view', 'pure'].includes(fn.stateMutability)
    const isActive = selectedFunction?.name === fn.name
    return (
      <button
        key={fn.name}
        className={`${styles.fnItem} ${isActive ? styles.fnItemActive : ''}`}
        onClick={() => onSelect(fn)}
      >
        <span className={`${styles.badge} ${isRead ? styles.badgeRead : styles.badgeWrite}`}>
          {isRead ? 'R' : 'W'}
        </span>
        {fn.name}
      </button>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.searchWrap}>
        <input
          ref={searchRef}
          className={styles.search}
          placeholder="Filter functions…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.list}>
        {filteredRead.length > 0 && (
          <>
            <div className={styles.groupLabel}>Read</div>
            {filteredRead.map(renderItem)}
          </>
        )}
        {filteredWrite.length > 0 && (
          <>
            <div className={styles.groupLabel}>Write</div>
            {filteredWrite.map(renderItem)}
          </>
        )}
        {filteredRead.length === 0 && filteredWrite.length === 0 && query && (
          <div className={styles.empty}>No functions match "{query}"</div>
        )}
        {abi.length === 0 && !query && (
          <div className={styles.empty}>Load an ABI to see functions</div>
        )}
      </div>
    </div>
  )
}
