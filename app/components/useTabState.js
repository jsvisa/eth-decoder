"use client";

import { useEffect, useState } from "react";

// Shared localStorage key mapping tabId -> serialized workspace state.
const STORAGE_KEY = "evm_workspace_tabs_state";

/**
 * Per-tab persisted state. Each tab in a Tabs container gets its own
 * { key: tabId } entry so switching tabs never mixes state.
 *
 * Returns [state, setState, loaded]. `loaded` flips true after the persisted
 * value (if any) has been read from localStorage on mount.
 */
export function useTabState({ tabId, initial }) {
  const [state, setState] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let persisted;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const map = JSON.parse(raw);
        if (map && map[tabId] != null) persisted = map[tabId];
      }
    } catch {
      persisted = null;
    }
    if (persisted !== null && persisted !== undefined) setState(persisted);
    setLoaded(true);
  }, [tabId]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[tabId] = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }, [loaded, tabId, state]);

  return [state, setState, loaded];
}
