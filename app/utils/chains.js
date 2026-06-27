import { mainnet, arbitrum, base, polygon, bsc } from "viem/chains";

// Canonical ordered list for UI dropdowns: { id, name, icon }
export const CHAINS = [
  {
    id: "ethereum",
    name: "Ethereum",
    icon: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    icon: "https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg",
  },
  {
    id: "base",
    name: "Base",
    icon: "https://icons.llamao.fi/icons/chains/rsz_base.jpg",
  },
  {
    id: "polygon",
    name: "Polygon",
    icon: "https://icons.llamao.fi/icons/chains/rsz_polygon.jpg",
  },
  {
    id: "bsc",
    name: "BSC",
    icon: "https://icons.llamao.fi/icons/chains/rsz_binance.jpg",
  },
];

// Numeric chain IDs by built-in slug
export const BUILT_IN_CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
};

// viem chain objects for createPublicClient (server-side / API routes)
export const VIEM_CHAINS = {
  ethereum: mainnet,
  arbitrum,
  base,
  polygon,
  bsc,
};

// Default public RPC URLs for API-route read/simulate calls.
// Used by call-contract and fetch-abi routes.
export const DEFAULT_RPC_URLS = {
  ethereum: "https://eth.llamarpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  polygon: "https://polygon-rpc.com",
  bsc: "https://bsc-dataseed.binance.org",
};

// Fork RPC URLs for in-browser tevm simulation.
// publicnode endpoints have proven more reliable for state-heavy fork reads
// (eth_getStorageAt / eth_createAccessList) than the default RPC URLs above.
// Kept separate to avoid changing tevm forking behaviour.
export const FORK_RPC_URLS = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
};

// Composite chain metadata { name, chainId, icon } indexed by slug.
// Replaces the BUILT_IN_CHAINS map duplicated in app/contracts/page.js.
export const CHAIN_META = Object.freeze(
  CHAINS.reduce((acc, c) => {
    acc[c.id] = {
      name: c.name,
      chainId: BUILT_IN_CHAIN_IDS[c.id],
      icon: c.icon,
    };
    return acc;
  }, {}),
);

/**
 * Returns full config for a built-in chain slug, or undefined.
 * Shape: { id, name, icon, chainId, rpcUrl, forkRpcUrl, viemChain }
 */
export function getChainConfig(id) {
  const meta = CHAIN_META[id];
  if (!meta) return undefined;
  return {
    id,
    name: meta.name,
    icon: meta.icon,
    chainId: meta.chainId,
    rpcUrl: DEFAULT_RPC_URLS[id],
    forkRpcUrl: FORK_RPC_URLS[id],
    viemChain: VIEM_CHAINS[id],
  };
}

/**
 * Returns full config for a numeric chain ID, or undefined.
 * Same shape as getChainConfig: { id, name, icon, chainId, rpcUrl, forkRpcUrl, viemChain }
 */
export function getChainConfigByChainId(numericId) {
  const slug = Object.keys(BUILT_IN_CHAIN_IDS).find(
    (s) => BUILT_IN_CHAIN_IDS[s] === numericId,
  );
  return slug ? getChainConfig(slug) : undefined;
}

/** True iff `id` is a built-in chain slug. */
export function isBuiltInChain(id) {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_CHAIN_IDS, id);
}

// Block explorer base URLs by built-in chain slug.
// Used to build "view on explorer" links for addresses and transactions.
export const EXPLORER_URLS = {
  ethereum: "https://etherscan.io",
  arbitrum: "https://arbiscan.io",
  base: "https://basescan.org",
  polygon: "https://polygonscan.com",
  bsc: "https://bscscan.com",
};

// CoinGecko asset-platform slugs keyed by numeric EVM chain ID.
// Full list: https://api.coingecko.com/api/v3/asset_platforms
export const CGC_CHAIN_SLUGS = {
  1: "ethereum",
  10: "optimistic-ethereum",
  25: "cronos",
  56: "binance-smart-chain",
  100: "xdai",
  137: "polygon-pos",
  250: "fantom",
  324: "zksync",
  1088: "metis-andromeda",
  1284: "moonbeam",
  1285: "moonriver",
  2222: "kava",
  5000: "mantle",
  8453: "base",
  34443: "mode",
  42161: "arbitrum-one",
  42220: "celo",
  43114: "avalanche",
  59144: "linea",
  81457: "blast",
  534352: "scroll",
  1313161554: "aurora",
};

// Chain IDs whose native token is ETH — used to fetch the "ethereum" CoinGecko
// price for native tokens instead of the chain-specific CoinGecko platform slug.
export const ETH_NATIVE_CHAIN_IDS = new Set([
  1, 10, 42161, 8453, 324, 59144, 534352, 81457, 34443, 1088,
]);
