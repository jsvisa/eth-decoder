/**
 * ABI Caching Utility
 *
 * Centralizes ABI caching logic for reuse across the application.
 * Stores ABIs in localStorage with chain-address keys.
 */

const ABI_CACHE_PREFIX = 'abi-'

/**
 * Generate localStorage key for ABI cache
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @returns {string} Cache key
 */
export const getAbiCacheKey = (chain, address) => {
  return `${ABI_CACHE_PREFIX}${chain}-${address.toLowerCase()}`
}

/**
 * Retrieve cached ABI from localStorage
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @returns {object|null} Cached ABI data or null if not found
 */
export const getCachedAbi = (chain, address) => {
  if (typeof window === 'undefined') return null

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

/**
 * Store ABI in localStorage cache
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @param {Array} abi - The ABI array
 * @param {boolean} isProxy - Whether this is a proxy contract
 * @param {string|null} implAddress - Implementation address if proxy
 * @param {string|null} contractName - Contract name
 * @param {string|null} implContractName - Implementation contract name if proxy
 */
export const setCachedAbi = (chain, address, abi, isProxy = false, implAddress = null, contractName = null, implContractName = null) => {
  if (typeof window === 'undefined') return

  try {
    const key = getAbiCacheKey(chain, address)
    localStorage.setItem(key, JSON.stringify({
      abi,
      isProxy,
      implAddress,
      contractName,
      implContractName,
      timestamp: Date.now()
    }))
  } catch (err) {
    console.error('Failed to cache ABI:', err)
  }
}

/**
 * Build an ABI cache map from localStorage for a given chain
 * @param {string} chain - Chain identifier
 * @returns {Map<string, Array>} Map of lowercase address -> ABI array
 */
export const buildAbiCacheFromStorage = (chain) => {
  const cache = new Map()

  if (typeof window === 'undefined') return cache

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ABI_CACHE_PREFIX)) {
        const [, chainAndAddress] = key.split(ABI_CACHE_PREFIX)
        const dashIndex = chainAndAddress.indexOf('-')
        if (dashIndex === -1) continue

        const cachedChain = chainAndAddress.substring(0, dashIndex)
        const cachedAddress = chainAndAddress.substring(dashIndex + 1)

        // Only include ABIs for the requested chain
        if (cachedChain === chain) {
          const cached = JSON.parse(localStorage.getItem(key))
          if (cached && cached.abi) {
            cache.set(cachedAddress.toLowerCase(), cached.abi)
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to build ABI cache from storage:', err)
  }

  return cache
}

/**
 * Fetch ABI from API and cache it
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @param {string} apiKey - Etherscan API key
 * @param {string} rpcUrl - Optional custom RPC URL
 * @param {number|string} chainId - Optional chain ID for custom chains
 * @returns {Promise<Array|null>} The ABI array or null if fetch failed
 */
export const fetchAndCacheAbi = async (chain, address, apiKey, rpcUrl, chainId) => {
  try {
    // Check cache first
    const cached = getCachedAbi(chain, address)
    if (cached && cached.abi) {
      return cached.abi
    }

    // Build API params
    const params = new URLSearchParams({ address, chain })
    if (apiKey) {
      params.set('apiKey', apiKey)
    }
    if (rpcUrl) {
      params.set('rpcUrl', rpcUrl)
    }
    if (chainId) {
      params.set('chainId', chainId.toString())
    }

    const response = await fetch(`/api/fetch-abi?${params}`)
    const data = await response.json()

    if (!response.ok || !data.abi) {
      return null
    }

    // Cache the fetched ABI
    setCachedAbi(
      chain,
      address,
      data.abi,
      data.isProxy || false,
      data.implAddress || null,
      data.contractName || null,
      data.implContractName || null
    )

    return data.abi
  } catch (err) {
    console.error(`Failed to fetch ABI for ${address}:`, err)
    return null
  }
}

/**
 * Fetch ABIs for multiple addresses in parallel
 * @param {string} chain - Chain identifier
 * @param {string[]} addresses - Array of contract addresses
 * @param {string} apiKey - Etherscan API key
 * @param {string} rpcUrl - Optional custom RPC URL
 * @param {number|string} chainId - Optional chain ID for custom chains
 * @returns {Promise<Map<string, Array>>} Map of lowercase address -> ABI array
 */
export const fetchAbisForAddresses = async (chain, addresses, apiKey, rpcUrl, chainId) => {
  const results = new Map()

  // Fetch all ABIs in parallel
  const fetchPromises = addresses.map(async (address) => {
    const normalizedAddress = address.toLowerCase()
    const abi = await fetchAndCacheAbi(chain, address, apiKey, rpcUrl, chainId)
    if (abi) {
      results.set(normalizedAddress, abi)
    }
  })

  await Promise.all(fetchPromises)

  return results
}
