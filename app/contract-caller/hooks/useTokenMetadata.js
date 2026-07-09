"use client";

import { useState } from "react";
import {
  TRANSFER_TOPIC,
  ERC20_TRANSFER_TOPIC,
  DEPOSIT_TOPIC,
  WITHDRAWAL_TOPIC,
} from "../../utils/tokenTransfers";

const TOKEN_SYMBOL_CACHE_PREFIX = "token-symbol-";
const TOKEN_DECIMALS_CACHE_PREFIX = "token-decimals-";

const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

const TOKEN_TRANSFER_TOPICS = new Set([
  TRANSFER_TOPIC,
  ERC20_TRANSFER_TOPIC,
  DEPOSIT_TOPIC,
  WITHDRAWAL_TOPIC,
]);

const ERC20_SYMBOL_ABI = [
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
];

const ERC20_DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
];

// localStorage helpers for token symbol cache
const getCachedTokenSymbol = (chain, address) => {
  if (!address) return null;
  try {
    const key = `${TOKEN_SYMBOL_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setCachedTokenSymbol = (chain, address, symbol) => {
  if (!address) return;
  try {
    const key = `${TOKEN_SYMBOL_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
    localStorage.setItem(key, symbol);
  } catch {
    // Ignore cache errors
  }
};

// localStorage helpers for token decimals cache
const getCachedTokenDecimals = (chain, address) => {
  if (!address) return null;
  try {
    const key = `${TOKEN_DECIMALS_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
    const val = localStorage.getItem(key);
    return val !== null ? Number(val) : null;
  } catch {
    return null;
  }
};

const setCachedTokenDecimals = (chain, address, decimals) => {
  if (!address) return;
  try {
    const key = `${TOKEN_DECIMALS_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
    localStorage.setItem(key, String(decimals));
  } catch {
    // Ignore cache errors
  }
};

/**
 * Resolves and caches token symbols, decimals, and prices for addresses
 * appearing in logs or simulation results.
 *
 * @param {string} chain - Chain slug (e.g. "ethereum")
 * @param {Object} rpcSettings - Map of chain slug -> custom RPC URL
 */
export function useTokenMetadata(chain, rpcSettings = {}) {
  const [tokenSymbols, setTokenSymbols] = useState({});
  const [tokenDecimals, setTokenDecimals] = useState({});
  const [tokenPrices, setTokenPrices] = useState({});

  /**
   * Fetch token symbols for Transfer-type logs.
   *
   * @param {Array} logs - Array of decoded/raw log objects
   * @param {number} chainId - Numeric chain ID
   */
  const fetchTokenSymbolsForLogs = async (logs, chainId) => {
    if (!logs || logs.length === 0) return;

    const transferAddresses = new Set();
    const newSymbols = {};
    for (const log of logs) {
      if (
        log.address &&
        log.topics?.[0] &&
        TOKEN_TRANSFER_TOPICS.has(log.topics[0])
      ) {
        const addr = log.address.toLowerCase();
        const cachedSymbol = getCachedTokenSymbol(chain, addr);
        if (cachedSymbol) {
          newSymbols[addr] = cachedSymbol;
        } else {
          transferAddresses.add(addr);
        }
      }
    }

    if (transferAddresses.size === 0) {
      if (Object.keys(newSymbols).length > 0) {
        setTokenSymbols((prev) => ({ ...prev, ...newSymbols }));
      }
      return;
    }

    const fetchPromises = Array.from(transferAddresses).map(async (addr) => {
      try {
        const response = await fetch("/api/call-contract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chain,
            address: addr,
            functionName: "symbol",
            args: [],
            abi: ERC20_SYMBOL_ABI,
            rpcUrl: rpcSettings[chain] || undefined,
            chainId,
          }),
        });
        const data = await response.json();
        if (response.ok && data.decoded && data.decoded.length > 0) {
          const symbol = data.decoded[0].value;
          newSymbols[addr] = symbol;
          setCachedTokenSymbol(chain, addr, symbol);
        }
      } catch {
        // Ignore errors for individual symbol fetches
      }
    });

    await Promise.all(fetchPromises);
    setTokenSymbols((prev) => ({ ...prev, ...newSymbols }));
  };

  /**
   * Fetch decimals and prices for all tokens involved in a simulation result.
   *
   * @param {Array|null} logs - Raw log objects
   * @param {number} chainNumericId - Numeric chain ID
   */
  const fetchTokenDataForSimulation = async (
    logs,
    balanceChanges,
    chainNumericId,
  ) => {
    const tokenAddresses = new Set();

    if (logs) {
      for (const log of logs) {
        if (
          log.address &&
          log.topics?.[0] &&
          TOKEN_TRANSFER_TOPICS.has(log.topics[0])
        ) {
          tokenAddresses.add(log.address.toLowerCase());
        }
      }
    }

    const newDecimals = {};
    const newPrices = {};

    const decimalFetches = Array.from(tokenAddresses)
      .filter((addr) => {
        const cached = getCachedTokenDecimals(chain, addr);
        if (cached !== null) {
          newDecimals[addr] = cached;
          return false;
        }
        return true;
      })
      .map(async (addr) => {
        try {
          const response = await fetch("/api/call-contract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chain,
              address: addr,
              functionName: "decimals",
              args: [],
              abi: ERC20_DECIMALS_ABI,
              rpcUrl: rpcSettings[chain] || undefined,
              chainId: chainNumericId,
            }),
          });
          const data = await response.json();
          if (response.ok && data.decoded && data.decoded.length > 0) {
            const dec = Number(data.decoded[0].value);
            newDecimals[addr] = dec;
            setCachedTokenDecimals(chain, addr, dec);
          }
        } catch {
          // Ignore individual fetch errors
        }
      });

    const allPriceAddresses = [...tokenAddresses];
    if (balanceChanges && balanceChanges.length > 0) {
      allPriceAddresses.push(NATIVE_TOKEN_ADDRESS);
    }

    const priceFetches = allPriceAddresses.map(async (addr) => {
      try {
        const response = await fetch(
          `/api/token-price?token=${addr}&chainId=${chainNumericId}`,
        );
        const data = await response.json();
        if (data.price !== null && data.price !== undefined) {
          newPrices[addr] = data.price;
        }
      } catch {
        // Ignore individual fetch errors
      }
    });

    await Promise.all([...decimalFetches, ...priceFetches]);
    setTokenDecimals((prev) => ({ ...prev, ...newDecimals }));
    setTokenPrices((prev) => ({ ...prev, ...newPrices }));
  };

  return {
    tokenSymbols,
    tokenDecimals,
    tokenPrices,
    setTokenSymbols,
    setTokenDecimals,
    setTokenPrices,
    fetchTokenSymbolsForLogs,
    fetchTokenDataForSimulation,
  };
}
