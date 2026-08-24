"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Tabs.module.css";

// Soft pastel backgrounds so adjacent tabs are visually distinct. Keyed by a
// hash of the tab id so each tab keeps its color across reloads.
const TAB_COLORS = [
  "rgba(255, 179, 186, 0.4)",
  "rgba(186, 225, 255, 0.4)",
  "rgba(186, 255, 201, 0.4)",
  "rgba(255, 244, 179, 0.4)",
  "rgba(224, 186, 255, 0.4)",
  "rgba(255, 204, 179, 0.4)",
  "rgba(179, 255, 247, 0.4)",
  "rgba(255, 179, 224, 0.4)",
];

function tabColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return TAB_COLORS[hash % TAB_COLORS.length];
}

function loadTabState(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
    const tabs = parsed.tabs
      .filter((t) => t && typeof t.id === "string")
      .map((t) => ({
        id: t.id,
        title: typeof t.title === "string" ? t.title : "Tab",
        renamed: t.renamed === true,
      }));
    if (tabs.length === 0) return null;
    return {
      tabs,
      activeId:
        typeof parsed.activeId === "string" &&
        tabs.some((t) => t.id === parsed.activeId)
          ? parsed.activeId
          : tabs[0].id,
    };
  } catch {
    return null;
  }
}

/**
 * Generic tabbed workspace container.
 *
 * Renders a tab bar with an "+ Add Tab" button. Each tab is an independent
 * instance of the content produced by `renderTab`. Tabs are mounted lazily
 * (first activation) and stay mounted (hidden) afterwards so their state is
 * preserved while switching. The tab list + active tab persist to localStorage.
 *
 * Props:
 *   storageKey   - localStorage key for the tab list
 *   newTabTitle  - title given to newly added tabs
 *   defaultTabId - id of the tab rendered on first ever load
 *   renderTab(tab, { isActive, hydrateFromUrl, onRename }) - content per tab.
 *     hydrateFromUrl is true only for the tab active on initial page load, so
 *     URL query params are applied exactly once (e.g. ?data=... or
 *     ?simulationId=...).
 */
export default function Tabs({
  storageKey,
  newTabTitle,
  defaultTabId,
  renderTab,
}) {
  const [tabs, setTabs] = useState(() => [
    { id: defaultTabId, title: newTabTitle, renamed: false },
  ]);
  const [activeId, setActiveId] = useState(defaultTabId);
  const [mountedIds, setMountedIds] = useState(() => new Set([defaultTabId]));
  const [editingId, setEditingId] = useState(null);
  const bootTabIdRef = useRef(defaultTabId);
  const storageLoadedRef = useRef(false);
  // Ref of manually-renamed tab ids, read at call time by onRename so the
  // workspace's mount-time auto-rename can't clobber a persisted custom title
  // with a stale closure captured before persisted state was loaded.
  const renamedRef = useRef(new Set());
  renamedRef.current = new Set(tabs.filter((t) => t.renamed).map((t) => t.id));

  // Load persisted tab list on mount (effect, not initializer, to stay SSR-safe).
  useEffect(() => {
    if (storageLoadedRef.current) return;
    storageLoadedRef.current = true;
    const stored = loadTabState(storageKey);
    if (!stored) return;
    bootTabIdRef.current = stored.activeId;
    renamedRef.current = new Set(
      stored.tabs.filter((t) => t.renamed).map((t) => t.id),
    );
    setTabs(stored.tabs);
    setActiveId(stored.activeId);
    setMountedIds(new Set([stored.activeId]));
  }, [storageKey]);

  // Persist tab list + active tab (skip until persisted state is loaded).
  useEffect(() => {
    if (!storageLoadedRef.current) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          tabs: tabs.map(({ id, title, renamed }) => ({ id, title, renamed })),
          activeId,
        }),
      );
    } catch {}
  }, [storageKey, tabs, activeId]);

  const selectTab = useCallback((id) => {
    setActiveId(id);
    setMountedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const addTab = useCallback(() => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTabs((prev) => [...prev, { id, title: newTabTitle, renamed: false }]);
    setActiveId(id);
    setMountedIds((prev) => new Set(prev).add(id));
  }, [newTabTitle]);

  const closeTab = useCallback(
    (id) => {
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const remaining = tabs.filter((t) => t.id !== id);
      if (remaining.length === 0) return; // keep at least one tab
      setTabs(remaining);
      if (activeId === id) {
        const neighbor = remaining[Math.min(idx, remaining.length - 1)];
        setActiveId(neighbor.id);
        setMountedIds((prev) => new Set(prev).add(neighbor.id));
      }
    },
    [tabs, activeId],
  );

  const renameTab = useCallback((id, title) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  // Auto-rename from workspace content is skipped once the user renames a tab
  // themselves, so a custom title isn't overwritten on the next render.
  const onRename = useCallback(
    (id, title) => {
      if (renamedRef.current.has(id)) return;
      renameTab(id, title);
    },
    [renameTab],
  );

  const commitRename = useCallback((id, title) => {
    const trimmed = title.trim();
    setEditingId(null);
    if (!trimmed) return;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, title: trimmed, renamed: true } : t,
      ),
    );
  }, []);

  return (
    <>
      <div className={styles.tabBar} role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeId}
            className={`${styles.tab}${tab.id === activeId ? ` ${styles.active}` : ""}`}
            style={
              tab.id === activeId
                ? undefined
                : { backgroundColor: tabColor(tab.id) }
            }
            onClick={() => selectTab(tab.id)}
            onDoubleClick={() => setEditingId(tab.id)}
            title="Double-click to rename"
          >
            {editingId === tab.id ? (
              <input
                type="text"
                autoFocus
                defaultValue={tab.title}
                className={styles.tabInput}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => commitRename(tab.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitRename(tab.id, e.target.value);
                  } else if (e.key === "Escape") {
                    setEditingId(null);
                  }
                }}
              />
            ) : (
              <span className={styles.tabTitle}>{tab.title}</span>
            )}
            {tabs.length > 1 && (
              <button
                type="button"
                className={styles.tabClose}
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Close tab "${tab.title}"?`)) {
                    closeTab(tab.id);
                  }
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className={styles.addTab} onClick={addTab}>
          + Add Tab
        </button>
      </div>
      <div className={styles.tabBody}>
        {tabs
          .filter((tab) => mountedIds.has(tab.id))
          .map((tab) => (
            <div
              key={tab.id}
              role="tabpanel"
              className={
                tab.id === activeId ? styles.panelActive : styles.panelHidden
              }
              style={tab.id === activeId ? undefined : { display: "none" }}
            >
              {renderTab(tab, {
                isActive: tab.id === activeId,
                hydrateFromUrl: tab.id === bootTabIdRef.current,
                onRename: (title) => onRename(tab.id, title),
              })}
            </div>
          ))}
      </div>
    </>
  );
}
