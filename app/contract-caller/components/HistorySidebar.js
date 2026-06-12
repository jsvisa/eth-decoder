import styles from "./HistorySidebar.module.css";

function abbrev(v) {
  const s = String(v);
  if (s.startsWith("0x") && s.length === 42)
    return s.slice(0, 6) + "…" + s.slice(-4);
  return s.length > 16 ? s.slice(0, 14) + "…" : s;
}

export default function HistorySidebar({
  history,
  chain,
  show,
  onShowChange,
  search,
  onSearchChange,
  onLoad,
  onClear,
  getChainName,
}) {
  const resolveChainName = getChainName || ((id) => id);

  const chainHistory = history.filter((item) => item.chain === chain);

  if (chainHistory.length === 0) return null;

  const filtered = chainHistory.filter(
    (item) =>
      !search ||
      item.functionName?.toLowerCase().includes(search.toLowerCase()) ||
      item.contractName?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={styles.historySection}>
      <div className={styles.historyHeader}>
        <h3>Recent Calls ({chainHistory.length})</h3>
        <div className={styles.historyActions}>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={styles.historySearch}
          />
          <button
            onClick={() => onShowChange(!show)}
            className={styles.historyToggle}
            type="button"
          >
            {show ? "Hide" : "Show"}
          </button>
          <button
            onClick={onClear}
            className={styles.historyClear}
            type="button"
          >
            Clear All
          </button>
        </div>
      </div>

      {show && (
        <div className={styles.historyList}>
          {filtered.map((item) => {
            if (item.type === "session") {
              return (
                <div
                  key={item.id}
                  className={`${styles.historyItem} ${styles.sessionBundleItem}`}
                >
                  <div className={styles.historyTop}>
                    <div className={styles.historyChain}>
                      {resolveChainName(item.chain)}
                    </div>
                    <span className={styles.sessionBundleBadge}>Session</span>
                    <div className={styles.historyFunc}>
                      Block {item.block} &middot; {item.txs.length} tx
                      {item.txs.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className={styles.sessionBundleTxList}>
                    {item.txs.map((tx, i) => (
                      <div key={tx.id} className={styles.sessionBundleTx}>
                        <span className={styles.sessionHistoryIndex}>
                          #{i + 1}
                        </span>
                        <span
                          className={`${styles.sessionHistoryBadge} ${
                            tx.type === "read"
                              ? styles.sessionHistoryBadgeRead
                              : tx.success
                                ? styles.sessionHistoryBadgeSuccess
                                : styles.sessionHistoryBadgeFail
                          }`}
                        >
                          {tx.type === "read" ? "R" : tx.success ? "✓" : "✗"}
                        </span>
                        <span className={styles.sessionBundleTxFunc}>
                          {tx.contractName} · {tx.functionName}(
                          {tx.inputs.map((inp) => abbrev(inp.value)).join(", ")}
                          )
                          {tx.outputs.length > 0 && (
                            <span className={styles.sessionBundleTxOutput}>
                              {" "}
                              →{" "}
                              {tx.outputs
                                .map((o) => abbrev(o.value))
                                .join(", ")}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.historyTime}>
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              );
            }

            const argsStr = (item.args || []).join(", ");
            const funcCall = `${item.functionName}(${argsStr})`;
            const decoded = item.output?.decoded || [];
            const outputStr =
              decoded.length > 0
                ? `(${decoded.map((d) => d.value).join(", ")})`
                : "";
            const fullStr = outputStr
              ? `${funcCall} -> ${outputStr}`
              : funcCall;
            const maxLen = 90;
            const displayStr =
              fullStr.length > maxLen
                ? fullStr.slice(0, maxLen) + "..."
                : fullStr;

            return (
              <div
                key={item.id}
                className={styles.historyItem}
                onClick={() => onLoad(item)}
              >
                <div className={styles.historyTop}>
                  <div className={styles.historyChain}>
                    {resolveChainName(item.chain)}
                  </div>
                  <span
                    className={
                      item.isWrite
                        ? styles.historyWriteBadge
                        : styles.historyReadBadge
                    }
                  >
                    {item.isWrite ? "W" : "R"}
                  </span>
                  <div className={styles.historyFunc} title={fullStr}>
                    {displayStr}
                  </div>
                </div>
                <div className={styles.historyContract}>
                  {item.contractName || "Unknown Contract"}
                </div>
                <div className={styles.historyAddress}>{item.address}</div>
                <div className={styles.historyTime}>
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
