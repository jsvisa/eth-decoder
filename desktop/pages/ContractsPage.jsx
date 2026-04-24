// desktop/pages/ContractsPage.jsx
import { useState, useEffect, useMemo } from 'react'
import { buildAbiCacheFromStorage } from '@app/utils/abiCache'
import { shortenAddress } from '../utils/valueFormat'
import styles from './ContractsPage.module.css'

const CHAINS = ['ethereum', 'arbitrum', 'base', 'polygon', 'bsc']

export default function ContractsPage({ onNavigate }) {
  const [query, setQuery] = useState('')
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    const all = []
    for (const chain of CHAINS) {
      const cache = buildAbiCacheFromStorage(chain)
      for (const [addr, entry] of Object.entries(cache)) {
        all.push({
          chain,
          address: addr,
          name: entry.contractName || '—',
          fnCount: (entry.abi || []).filter(i => i.type === 'function').length,
        })
      }
    }
    setContracts(all)
  }, [])

  const filtered = useMemo(() => {
    if (!query) return contracts
    const q = query.toLowerCase()
    return contracts.filter(c =>
      c.address.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    )
  }, [contracts, query])

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Contracts</span>
        <div className={styles.spacer} />
        <input
          className={styles.search}
          placeholder="Search by name or address…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.content}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {contracts.length === 0 ? 'No cached contracts yet' : `No results for "${query}"`}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Chain</th>
                <th>Functions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={i} onClick={() => onNavigate?.('contract-caller')}>
                  <td>{c.name}</td>
                  <td><span className={styles.mono}>{shortenAddress(c.address)}</span></td>
                  <td><span className={styles.chainTag}>{c.chain.slice(0, 3).toUpperCase()}</span></td>
                  <td>{c.fnCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
