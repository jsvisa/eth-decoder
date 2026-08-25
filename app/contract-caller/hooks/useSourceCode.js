"use client";

import { useState, useRef, useEffect } from "react";
import { getCachedSource, setCachedSource } from "../../utils/abiCache";

const FETCHING = new Set();

export function useSourceCode(chain, address) {
  const [state, setState] = useState(() => {
    if (!address)
      return {
        sources: null,
        compilerVersion: null,
        loading: false,
        error: null,
      };
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
    if (FETCHING.has(key)) return;
    FETCHING.add(key);

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const params = new URLSearchParams({ address, chain });
    const etherscanApiKey = localStorage.getItem("etherscanApiKey") || "";
    if (etherscanApiKey) params.set("etherscanApiKey", etherscanApiKey);

    fetch(`/api/fetch-abi?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!mountedRef.current) return;
        if (data.sourceCode) {
          setCachedSource(
            chain,
            address,
            data.sourceCode,
            data.compilerVersion || null,
          );
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
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err.message || "Failed to fetch source code",
        }));
      })
      .finally(() => {
        FETCHING.delete(key);
      });
  }, [chain, address]);

  return state;
}
