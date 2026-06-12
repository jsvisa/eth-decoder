import styles from "./SessionHistoryStrip.module.css";

function abbrev(v) {
  const s = String(v);
  if (s.startsWith("0x") && s.length === 42)
    return s.slice(0, 6) + "…" + s.slice(-4);
  return s.length > 16 ? s.slice(0, 14) + "…" : s;
}

export default function SessionHistoryStrip({
  active,
  items,
  expandedIds,
  onToggleExpanded,
}) {
  if (!active || !items || items.length === 0) return null;

  return (
    <div className={styles.sessionHistorySection}>
      <div className={styles.sessionHistoryHeader}>
        <span>Session History</span>
        <span>
          {items.length} tx{items.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className={styles.sessionHistoryList}>
        {items.map((item, idx) => {
          const expanded = expandedIds.has(item.id);
          return (
            <div key={item.id} className={styles.sessionHistoryItem}>
              <div
                className={styles.sessionHistoryItemHeader}
                onClick={() => onToggleExpanded(item.id)}
              >
                <span className={styles.sessionHistoryIndex}>#{idx + 1}</span>
                <span
                  className={`${styles.sessionHistoryBadge} ${
                    item.type === "read"
                      ? styles.sessionHistoryBadgeRead
                      : item.success
                        ? styles.sessionHistoryBadgeSuccess
                        : styles.sessionHistoryBadgeFail
                  }`}
                >
                  {item.type === "read" ? "R" : item.success ? "✓" : "✗"}
                </span>
                <span className={styles.sessionHistoryFunc}>
                  {item.contractName} · {item.functionName}(
                  {item.inputs.map((i) => abbrev(i.value)).join(", ")})
                </span>
                <span className={styles.sessionHistoryChevron}>
                  {expanded ? "▲" : "▼"}
                </span>
              </div>
              {expanded && (
                <div className={styles.sessionHistoryExpanded}>
                  {item.inputs.length > 0 && (
                    <div className={styles.sessionHistoryArgBlock}>
                      <span className={styles.sessionHistoryArgLabel}>in</span>
                      <div className={styles.sessionHistoryArgRows}>
                        {item.inputs.map((inp, i) => (
                          <div key={i} className={styles.sessionHistoryArgRow}>
                            <span className={styles.sessionHistoryArgName}>
                              {inp.name}
                              <span className={styles.sessionHistoryArgType}>
                                {" "}
                                ({inp.type})
                              </span>
                            </span>
                            <span className={styles.sessionHistoryArgValue}>
                              {String(inp.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className={styles.sessionHistoryArgBlock}>
                    <span className={styles.sessionHistoryArgLabel}>out</span>
                    <div className={styles.sessionHistoryArgRows}>
                      {item.outputs.length > 0 ? (
                        item.outputs.map((out, i) => (
                          <div key={i} className={styles.sessionHistoryArgRow}>
                            <span className={styles.sessionHistoryArgName}>
                              {out.name || "result"}
                              <span className={styles.sessionHistoryArgType}>
                                {" "}
                                ({out.type})
                              </span>
                            </span>
                            <span className={styles.sessionHistoryArgValue}>
                              {String(out.value)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className={styles.sessionHistoryArgType}>
                          void
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
