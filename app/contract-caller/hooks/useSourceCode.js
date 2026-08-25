"use client";

import { useState, useRef, useEffect } from "react";
import { getCachedSource, setCachedSource } from "../../utils/abiCache";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";

const FETCHING = new Map();

export function useSourceCode(chain, address) {
  const [state, setState] = useState(() => {
    if (!address) {
      return {
        sources: null,
        compilerVersion: null,
        loading: false,
        error: null,
      };
    }
    const cached = getCachedSource(chain, address);
    if (cached) {
      return {
        sources: cached.sources,
        compilerVersion: cached.compilerVersion,
        loading: false,
        error: null,
      };
    }
    return {
      sources: null,
      compilerVersion: null,
      loading: false,
      error: null,
    };
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!address) {
      setState({
        sources: null,
        compilerVersion: null,
        loading: false,
        error: null,
      });
      return;
    }

    const cached = getCachedSource(chain, address);
    if (cached) {
      setState({
        sources: cached.sources,
        compilerVersion: cached.compilerVersion,
        loading: false,
        error: null,
      });
      return;
    }

    const key = `${chain}-${address.toLowerCase()}`;

    // Resolve state from the shared fetch result. Guarded by mountedRef so an
    // unmounted instance never calls setState, but the fetch/cache side effects
    // always run (they live in the shared promise below, not here).
    const applyData = (data) => {
      if (!mountedRef.current) return;
      if (data instanceof Error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: data.message,
        }));
      } else if (data && data.sourceCode) {
        setState({
          sources: data.sourceCode,
          compilerVersion: data.compilerVersion || null,
          loading: false,
          error: null,
        });
      } else {
        setState({
          sources: null,
          compilerVersion: null,
          loading: false,
          error: "No source code available",
        });
      }
    };

    setState((prev) => ({ ...prev, loading: true, error: null }));

    if (FETCHING.has(key)) {
      FETCHING.get(key).then(applyData);
      return;
    }

    const params = new URLSearchParams({ address, chain });
    const apiKeys = (() => {
      try {
        return JSON.parse(localStorage.getItem("api_keys_settings") || "{}");
      } catch {
        return {};
      }
    })();
    if (apiKeys.etherscan) params.set("etherscanApiKey", apiKeys.etherscan);
    if (apiKeys.routescan) params.set("routescanApiKey", apiKeys.routescan);
    const rpcSettings = (() => {
      try {
        return JSON.parse(localStorage.getItem("rpc_settings") || "{}");
      } catch {
        return {};
      }
    })();
    if (rpcSettings[chain]) params.set("rpcUrl", rpcSettings[chain]);
    const chainId =
      BUILT_IN_CHAIN_IDS[chain] ||
      (() => {
        try {
          const custom = JSON.parse(
            localStorage.getItem("custom_chains") || "[]",
          );
          return custom.find((c) => c.id === chain)?.chainId;
        } catch {
          return null;
        }
      })();
    if (chainId) params.set("chainId", chainId.toString());

    const promise = fetch(`/api/fetch-source?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Source code not found");
        return res.json();
      })
      .then((data) => {
        // Cache side effect must run regardless of mount status so other
        // subscribers (and future mounts) get the data.
        if (data && data.sourceCode) {
          setCachedSource(
            chain,
            address,
            data.sourceCode,
            data.compilerVersion || null,
          );
        }
        return data;
      })
      .catch((err) => {
        if (err instanceof SyntaxError) {
          return new Error("Failed to parse server response");
        }
        return err;
      })
      .finally(() => {
        FETCHING.delete(key);
      });

    FETCHING.set(key, promise);
    promise.then(applyData);
  }, [chain, address]);

  return state;
}
