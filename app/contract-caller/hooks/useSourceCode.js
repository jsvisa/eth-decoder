"use client";

import { useState, useRef, useEffect } from "react";
import { getCachedSource, setCachedSource } from "../../utils/abiCache";

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

    if (FETCHING.has(key)) {
      FETCHING.get(key).then((data) => {
        if (!mountedRef.current) return;
        if (data) {
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
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const params = new URLSearchParams({ address, chain });
    const etherscanApiKey = localStorage.getItem("etherscanApiKey") || "";
    if (etherscanApiKey) params.set("etherscanApiKey", etherscanApiKey);

    const promise = fetch(`/api/fetch-source?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Source code not found");
        return res.json();
      })
      .then((data) => {
        if (!mountedRef.current) return null;
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
        return data;
      })
      .catch((err) => {
        if (!mountedRef.current) return null;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err.message || "Failed to fetch source code",
        }));
        return null;
      })
      .finally(() => {
        FETCHING.delete(key);
      });

    FETCHING.set(key, promise);
  }, [chain, address]);

  return state;
}
