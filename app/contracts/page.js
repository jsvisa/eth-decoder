'use client'

import { useState, useEffect } from 'react'
import styles from './page.module.css'

const ABI_CACHE_PREFIX = 'abi-'

// Built-in chains for display
const CHAIN_INFO = {
  ethereum: { name: 'Ethereum', icon: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg' },
  arbitrum: { name: 'Arbitrum', icon: 'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg' },
  base: { name: 'Base', icon: 'https://icons.llamao.fi/icons/chains/rsz_base.jpg' },
  polygon: { name: 'Polygon', icon: 'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg' },
  bsc: { name: 'BSC', icon: 'https://icons.llamao.fi/icons/chains/rsz_binance.jpg' },
}

// Get all cached contracts from localStorage
const getCachedContracts = () => {
  const contracts = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ABI_CACHE_PREFIX)) {
        const [, chainAndAddress] = key.split(ABI_CACHE_PREFIX)
        const dashIndex = chainAndAddress.indexOf('-')
        if (dashIndex === -1) continue

        const chain = chainAndAddress.substring(0, dashIndex)
        const address = chainAndAddress.substring(dashIndex + 1)
        const cached = JSON.parse(localStorage.getItem(key))

        contracts.push({
          key,
          chain,
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
  const [searchFilter, setSearchFilter] = useState('')
  const [chainFilter, setChainFilter] = useState('')
  const [success, setSuccess] = useState(null)

  // Load contracts on mount
  useEffect(() => {
    setContracts(getCachedContracts())
  }, [])

  // Get unique chains from contracts
  const uniqueChains = [...new Set(contracts.map(c => c.chain))]

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
      setContracts(getCachedContracts())
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
  const handleCopyAddress = async (address) => {
    try {
      await navigator.clipboard.writeText(address)
      setSuccess('Address copied to clipboard')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Get chain display info
  const getChainDisplay = (chainId) => {
    const info = CHAIN_INFO[chainId]
    if (info) {
      return { name: info.name, icon: info.icon }
    }
    // Custom chain
    return { name: chainId, icon: null }
  }

  // Format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown'
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
              <option key={chain} value={chain}>
                {getChainDisplay(chain).name}
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
          <div className={styles.contractList}>
            {filteredContracts.map((contract) => {
              const chainDisplay = getChainDisplay(contract.chain)
              return (
                <div key={contract.key} className={styles.contractItem}>
                  <div className={styles.contractHeader}>
                    <div className={styles.chainBadge}>
                      {chainDisplay.icon && (
                        <img
                          src={chainDisplay.icon}
                          alt={chainDisplay.name}
                          className={styles.chainIcon}
                        />
                      )}
                      <span className={styles.chainName}>{chainDisplay.name}</span>
                    </div>
                    {contract.isProxy && (
                      <span className={styles.proxyBadge}>Proxy</span>
                    )}
                  </div>

                  <div className={styles.contractName}>
                    {contract.isProxy && contract.implContractName ? (
                      <>
                        <span className={styles.proxyName}>{contract.contractName}</span>
                        <span className={styles.arrow}> → </span>
                        <span className={styles.implName}>{contract.implContractName}</span>
                      </>
                    ) : (
                      contract.contractName || 'Unknown Contract'
                    )}
                  </div>

                  <div
                    className={styles.address}
                    onClick={() => handleCopyAddress(contract.address)}
                    title="Click to copy"
                  >
                    {contract.address}
                  </div>

                  {contract.isProxy && contract.implAddress && (
                    <div className={styles.implAddressRow}>
                      <span className={styles.implLabel}>Implementation:</span>
                      <span
                        className={styles.implAddress}
                        onClick={() => handleCopyAddress(contract.implAddress)}
                        title="Click to copy"
                      >
                        {contract.implAddress}
                      </span>
                    </div>
                  )}

                  <div className={styles.stats}>
                    <span className={styles.stat}>
                      <span className={styles.statValue}>{contract.functionCount}</span> functions
                    </span>
                    <span className={styles.stat}>
                      <span className={styles.statValue}>{contract.eventCount}</span> events
                    </span>
                    <span className={styles.stat}>
                      Cached: {formatDate(contract.timestamp)}
                    </span>
                  </div>

                  <div className={styles.actions}>
                    <a
                      href={`/contract-caller?chain=${contract.chain}&address=${contract.address}`}
                      className={styles.useButton}
                    >
                      Open in Contract Caller
                    </a>
                    <button
                      onClick={() => handleDelete(contract)}
                      className={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
