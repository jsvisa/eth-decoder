'use client'

import { useState, useEffect } from 'react'
import styles from './page.module.css'

const ABI_CACHE_PREFIX = 'abi-'
const CUSTOM_CHAINS_KEY = 'custom_chains'

// Built-in chains for display
const BUILT_IN_CHAINS = {
  ethereum: { name: 'Ethereum', chainId: 1, icon: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg' },
  arbitrum: { name: 'Arbitrum', chainId: 42161, icon: 'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg' },
  base: { name: 'Base', chainId: 8453, icon: 'https://icons.llamao.fi/icons/chains/rsz_base.jpg' },
  polygon: { name: 'Polygon', chainId: 137, icon: 'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg' },
  bsc: { name: 'BSC', chainId: 56, icon: 'https://icons.llamao.fi/icons/chains/rsz_binance.jpg' },
}

// Load custom chains from localStorage
const loadCustomChains = () => {
  try {
    const stored = localStorage.getItem(CUSTOM_CHAINS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (err) {
    console.error('Failed to load custom chains:', err)
  }
  return []
}

// Parse the ABI cache key to extract chain and address
// Key format: abi-{chain}-{address} where chain could be "ethereum" or "chain-1"
const parseAbiCacheKey = (key) => {
  if (!key.startsWith(ABI_CACHE_PREFIX)) return null

  const withoutPrefix = key.substring(ABI_CACHE_PREFIX.length)

  // Check if it's a custom chain (starts with "chain-")
  if (withoutPrefix.startsWith('chain-')) {
    // Format: chain-{chainId}-{address}
    // Find the address part (starts with 0x)
    const addressIndex = withoutPrefix.indexOf('-0x')
    if (addressIndex === -1) return null

    const chain = withoutPrefix.substring(0, addressIndex)
    const address = withoutPrefix.substring(addressIndex + 1)
    return { chain, address }
  } else {
    // Format: {chainName}-{address}
    // Built-in chain names don't contain hyphens
    const firstDash = withoutPrefix.indexOf('-')
    if (firstDash === -1) return null

    const chain = withoutPrefix.substring(0, firstDash)
    const address = withoutPrefix.substring(firstDash + 1)
    return { chain, address }
  }
}

// Get all cached contracts from localStorage
const getCachedContracts = (customChains) => {
  const contracts = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ABI_CACHE_PREFIX)) {
        const parsed = parseAbiCacheKey(key)
        if (!parsed) continue

        const { chain, address } = parsed
        const cached = JSON.parse(localStorage.getItem(key))

        // Get chain info
        let chainInfo = BUILT_IN_CHAINS[chain]
        if (!chainInfo && chain.startsWith('chain-')) {
          // Look up custom chain
          const customChain = customChains.find(c => c.id === chain)
          if (customChain) {
            chainInfo = {
              name: customChain.name,
              chainId: customChain.chainId,
              icon: customChain.icon,
            }
          } else {
            // Extract chain ID from the chain key
            const chainIdMatch = chain.match(/^chain-(\d+)$/)
            const chainId = chainIdMatch ? parseInt(chainIdMatch[1], 10) : null
            chainInfo = {
              name: chain,
              chainId: chainId,
              icon: null,
            }
          }
        }

        contracts.push({
          key,
          chain,
          chainInfo,
          address,
          contractName: cached.contractName,
          implContractName: cached.implContractName,
          implAddress: cached.implAddress,
          isProxy: cached.isProxy,
          timestamp: cached.timestamp,
          functionCount: cached.abi?.filter(item => item.type === 'function').length || 0,
          eventCount: cached.abi?.filter(item => item.type === 'event').length || 0,
        })
      }
    }
  } catch (err) {
    console.error('Failed to get cached contracts:', err)
  }
  // Sort by timestamp (most recent first)
  return contracts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}

// Delete a cached contract
const deleteCachedContract = (key) => {
  try {
    localStorage.removeItem(key)
    return true
  } catch (err) {
    console.error('Failed to delete cached contract:', err)
    return false
  }
}

export default function Contracts() {
  const [contracts, setContracts] = useState([])
  const [customChains, setCustomChains] = useState([])
  const [searchFilter, setSearchFilter] = useState('')
  const [chainFilter, setChainFilter] = useState('')
  const [success, setSuccess] = useState(null)

  // Load contracts and custom chains on mount
  useEffect(() => {
    const chains = loadCustomChains()
    setCustomChains(chains)
    setContracts(getCachedContracts(chains))
  }, [])

  // Get unique chains from contracts for filter dropdown
  const uniqueChains = [...new Set(contracts.map(c => c.chain))]
    .map(chain => {
      const contract = contracts.find(c => c.chain === chain)
      return {
        id: chain,
        name: contract?.chainInfo?.name || chain,
        chainId: contract?.chainInfo?.chainId,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // Filter contracts
  const filteredContracts = contracts.filter(contract => {
    // Chain filter
    if (chainFilter && contract.chain !== chainFilter) {
      return false
    }

    // Search filter
    if (searchFilter.trim()) {
      const search = searchFilter.toLowerCase()
      return (
        contract.address.toLowerCase().includes(search) ||
        (contract.contractName && contract.contractName.toLowerCase().includes(search)) ||
        (contract.implContractName && contract.implContractName.toLowerCase().includes(search))
      )
    }

    return true
  })

  // Delete a contract
  const handleDelete = (contract) => {
    const name = contract.implContractName || contract.contractName || contract.address.slice(0, 10) + '...'
    if (!window.confirm(`Are you sure you want to delete the cached ABI for "${name}"?`)) {
      return
    }

    if (deleteCachedContract(contract.key)) {
      setContracts(getCachedContracts(customChains))
      setSuccess('Contract ABI deleted successfully')
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  // Delete all contracts
  const handleDeleteAll = () => {
    if (!window.confirm(`Are you sure you want to delete all ${contracts.length} cached contract ABIs? This cannot be undone.`)) {
      return
    }

    contracts.forEach(contract => {
      deleteCachedContract(contract.key)
    })
    setContracts([])
    setSuccess('All cached ABIs deleted successfully')
    setTimeout(() => setSuccess(null), 3000)
  }

  // Copy address to clipboard
  const handleCopyAddress = async (address, e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(address)
      setSuccess('Address copied to clipboard')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Get display name for contract
  const getContractDisplayName = (contract) => {
    if (contract.isProxy && contract.implContractName) {
      return `${contract.contractName || 'Proxy'} → ${contract.implContractName}`
    }
    return contract.contractName || '-'
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Cached Contracts</h1>
          <div className={styles.headerActions}>
            <button
              onClick={handleDeleteAll}
              className={styles.deleteAllButton}
              disabled={contracts.length === 0}
            >
              Delete All
            </button>
          </div>
        </div>

        {success && (
          <div className={styles.success}>
            {success}
            <button onClick={() => setSuccess(null)} className={styles.dismissButton}>x</button>
          </div>
        )}

        <div className={styles.filterRow}>
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search by address or contract name..."
            className={styles.searchInput}
          />
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            className={styles.chainSelect}
          >
            <option value="">All Chains</option>
            {uniqueChains.map(chain => (
              <option key={chain.id} value={chain.id}>
                {chain.name}{chain.chainId ? ` (${chain.chainId})` : ''}
              </option>
            ))}
          </select>
          <span className={styles.count}>
            {filteredContracts.length} of {contracts.length} contracts
          </span>
        </div>

        {contracts.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>&#128196;</div>
            <h2>No Cached Contracts</h2>
            <p>Contracts will appear here after you fetch their ABIs in the Contract Caller.</p>
            <a href="/contract-caller" className={styles.goToCallerButton}>
              Go to Contract Caller
            </a>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No contracts match your search.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thChain}>Chain</th>
                  <th className={styles.thAddress}>Address</th>
                  <th className={styles.thName}>Name</th>
                  <th className={styles.thStats}>Functions</th>
                  <th className={styles.thStats}>Events</th>
                  <th className={styles.thDate}>Cached</th>
                  <th className={styles.thActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract) => (
                  <tr key={contract.key} className={styles.row}>
                    <td className={styles.tdChain}>
                      <div className={styles.chainCell}>
                        {contract.chainInfo?.icon && (
                          <img
                            src={contract.chainInfo.icon}
                            alt={contract.chainInfo.name}
                            className={styles.chainIcon}
                          />
                        )}
                        <div className={styles.chainInfo}>
                          <span className={styles.chainName}>{contract.chainInfo?.name || contract.chain}</span>
                          {contract.chainInfo?.chainId && (
                            <span className={styles.chainId}>ID: {contract.chainInfo.chainId}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={styles.tdAddress}>
                      <span
                        className={styles.address}
                        onClick={(e) => handleCopyAddress(contract.address, e)}
                        title="Click to copy"
                      >
                        {contract.address.slice(0, 10)}...{contract.address.slice(-8)}
                      </span>
                    </td>
                    <td className={styles.tdName}>
                      <div className={styles.nameCell}>
                        <span className={styles.contractName}>{getContractDisplayName(contract)}</span>
                        {contract.isProxy && <span className={styles.proxyBadge}>Proxy</span>}
                      </div>
                    </td>
                    <td className={styles.tdStats}>{contract.functionCount}</td>
                    <td className={styles.tdStats}>{contract.eventCount}</td>
                    <td className={styles.tdDate}>{formatDate(contract.timestamp)}</td>
                    <td className={styles.tdActions}>
                      <a
                        href={`/contract-caller?chain=${contract.chain}&address=${contract.address}`}
                        className={styles.openButton}
                        title="Open in Contract Caller"
                      >
                        Open
                      </a>
                      <button
                        onClick={() => handleDelete(contract)}
                        className={styles.deleteButton}
                        title="Delete cached ABI"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
