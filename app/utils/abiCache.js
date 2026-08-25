/**
 * ABI Caching Utility
 *
 * Centralizes ABI caching logic for reuse across the application.
 * Stores ABIs in localStorage with chain-address keys.
 */

const ABI_CACHE_PREFIX = "abi-";
const SOURCE_CACHE_PREFIX = "src-";

/**
 * Generate localStorage key for ABI cache
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @returns {string} Cache key
 */
export const getAbiCacheKey = (chain, address) => {
  return `${ABI_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
};

/**
 * Retrieve cached ABI from localStorage
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @returns {object|null} Cached ABI data or null if not found
 */
export const getCachedAbi = (chain, address) => {
  if (typeof window === "undefined") return null;

  try {
    const key = getAbiCacheKey(chain, address);
    const cached = localStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error("Failed to load cached ABI:", err);
  }
  return null;
};

/**
 * Store ABI in localStorage cache
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @param {Array} abi - The ABI array
 * @param {boolean} isProxy - Whether this is a proxy contract
 * @param {string|null} implAddress - Implementation address if proxy
 * @param {string|null} contractName - Contract name
 * @param {string|null} implContractName - Implementation contract name if proxy
 * @param {string|null} source - Provider the ABI came from (etherscan/sourcify/routescan)
 * @param {string|null} implSource - Provider the implementation ABI came from, if proxy
 * @param {string[]} [facetAddresses] - Facet addresses if this is an EIP-2535 diamond
 * @param {Array<{address:string,name:string|null}>} [facets] - Facets with names
 */
export const setCachedAbi = (
  chain,
  address,
  abi,
  isProxy = false,
  implAddress = null,
  contractName = null,
  implContractName = null,
  source = null,
  implSource = null,
  facetAddresses = null,
  facets = null,
) => {
  if (typeof window === "undefined") return;

  try {
    const key = getAbiCacheKey(chain, address);
    localStorage.setItem(
      key,
      JSON.stringify({
        abi,
        isProxy,
        implAddress,
        contractName,
        implContractName,
        source,
        implSource,
        facetAddresses,
        facets,
        timestamp: Date.now(),
      }),
    );
  } catch (err) {
    console.error("Failed to cache ABI:", err);
  }
};

/**
 * Build an ABI cache map from localStorage for a given chain
 * @param {string} chain - Chain identifier
 * @returns {Map<string, Array>} Map of lowercase address -> ABI array
 */
export const buildAbiCacheFromStorage = (chain) => {
  const cache = new Map();

  if (typeof window === "undefined") return cache;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ABI_CACHE_PREFIX)) {
        const [, chainAndAddress] = key.split(ABI_CACHE_PREFIX);
        const dashIndex = chainAndAddress.indexOf("-");
        if (dashIndex === -1) continue;

        const cachedChain = chainAndAddress.substring(0, dashIndex);
        const cachedAddress = chainAndAddress.substring(dashIndex + 1);

        // Only include ABIs for the requested chain
        if (cachedChain === chain) {
          const cached = JSON.parse(localStorage.getItem(key));
          if (cached && cached.abi) {
            cache.set(cachedAddress.toLowerCase(), cached.abi);
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to build ABI cache from storage:", err);
  }

  return cache;
};

/**
 * Fetch ABI from API and cache it
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @param {string} rpcUrl - Optional custom RPC URL
 * @param {number|string} chainId - Optional chain ID for custom chains
 * @param {Object} opts
 * @param {boolean} opts.detectProxy
 * @param {string} opts.etherscanApiKey - Etherscan API key
 * @param {string} opts.routescanApiKey - RouteScan API key (fallback)
 * @returns {Promise<Array|null>} The ABI array or null if fetch failed
 */

/** True if the source code map contains at least one Solidity file entry */
function hasSolFiles(sourceCode) {
  return (
    sourceCode &&
    typeof sourceCode === "object" &&
    Object.keys(sourceCode).some((k) => k.endsWith(".sol"))
  );
}

export const fetchAndCacheAbi = async (
  chain,
  address,
  rpcUrl,
  chainId,
  { detectProxy = false, etherscanApiKey = "", routescanApiKey = "" } = {},
) => {
  try {
    // Check cache first
    const cached = getCachedAbi(chain, address);
    if (cached && cached.abi) {
      return cached.abi;
    }

    const response = await fetch(`/api/fetch-abi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        chain,
        etherscanApiKey: etherscanApiKey || undefined,
        routescanApiKey: routescanApiKey || undefined,
        rpcUrl: rpcUrl || undefined,
        chainId: chainId || undefined,
        detectProxy: detectProxy || undefined,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.abi) {
      return null;
    }

    // Cache the fetched ABI
    setCachedAbi(
      chain,
      address,
      data.abi,
      data.isProxy || false,
      data.implAddress || null,
      data.contractName || null,
      data.implContractName || null,
      data.source || null,
      data.implSource || null,
      data.facetAddresses || null,
      data.facets || null,
    );

    // Also cache source code so the source viewer loads instantly
    // Only cache when the source code actually contains Solidity file entries
    // (not just Standard JSON Input metadata like {language, sources, settings})
    if (data.sourceCode && hasSolFiles(data.sourceCode)) {
      setCachedSource(
        chain,
        address,
        data.sourceCode,
        data.compilerVersion || null,
      );
      // For diamond proxies, also cache source under each facet address
      if (data.facetAddresses) {
        for (const facet of data.facetAddresses) {
          setCachedSource(
            chain,
            facet,
            data.sourceCode,
            data.compilerVersion || null,
          );
        }
      }
    }

    return data.abi;
  } catch (err) {
    console.error(`Failed to fetch ABI for ${address}:`, err);
    return null;
  }
};

/**
 * Fetch ABIs for multiple addresses in parallel
 * @param {string} chain - Chain identifier
 * @param {string[]} addresses - Array of contract addresses
 * @param {string} rpcUrl - Optional custom RPC URL
 * @param {number|string} chainId - Optional chain ID for custom chains
 * @param {Object} opts
 * @param {boolean} opts.detectProxy
 * @param {string} opts.etherscanApiKey - Etherscan API key
 * @param {string} opts.routescanApiKey - RouteScan API key (fallback)
 * @returns {Promise<Map<string, Array>>} Map of lowercase address -> ABI array
 */
export const fetchAbisForAddresses = async (
  chain,
  addresses,
  rpcUrl,
  chainId,
  { detectProxy = true, etherscanApiKey = "", routescanApiKey = "" } = {},
) => {
  const results = new Map();

  // Fetch all ABIs in parallel
  const fetchPromises = addresses.map(async (address) => {
    const normalizedAddress = address.toLowerCase();
    const abi = await fetchAndCacheAbi(chain, address, rpcUrl, chainId, {
      detectProxy,
      etherscanApiKey,
      routescanApiKey,
    });
    if (abi) {
      results.set(normalizedAddress, abi);
    }
  });

  await Promise.all(fetchPromises);

  return results;
};

/**
 * Generate localStorage key for source code cache
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @returns {string} Cache key
 */
export const getSourceCacheKey = (chain, address) => {
  return `${SOURCE_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
};

/**
 * Retrieve cached source code from localStorage
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @returns {{sources:Object<string,string>, compilerVersion:string|null}|null}
 */
export const getCachedSource = (chain, address) => {
  if (typeof window === "undefined") return null;

  try {
    const key = getSourceCacheKey(chain, address);
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.sources && hasSolFiles(parsed.sources)) {
        return parsed;
      }
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.error("Failed to load cached source:", err);
  }
  return null;
};

/**
 * Store source code in localStorage cache
 * @param {string} chain - Chain identifier
 * @param {string} address - Contract address
 * @param {Object<string,string>} sources - Map of file name to source content
 * @param {string|null} compilerVersion - Solidity compiler version
 */
export const setCachedSource = (
  chain,
  address,
  sources,
  compilerVersion = null,
) => {
  if (typeof window === "undefined") return;

  try {
    const key = getSourceCacheKey(chain, address);
    localStorage.setItem(
      key,
      JSON.stringify({
        sources,
        compilerVersion,
        timestamp: Date.now(),
      }),
    );
  } catch (err) {
    console.error("Failed to cache source:", err);
  }
};
