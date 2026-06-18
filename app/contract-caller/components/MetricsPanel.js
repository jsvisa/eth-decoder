"use client";

import { useState } from "react";
import styles from "./MetricsPanel.module.css";

function fmtMs(n) {
  if (n == null) return "-";
  return Math.round(n) + "ms";
}

export default function MetricsPanel({ metrics }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!metrics) return null;

  const { totalMs, phases, rpc, touched } = metrics;
  const methodRows = Object.entries(rpc.byMethod || {}).sort(
    (a, b) => b[1].totalMs - a[1].totalMs,
  );

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className={styles.title}>Simulation metrics</span>
        <span className={styles.subtitle}>
          {fmtMs(totalMs)} · {rpc.totalLogicalCalls} rpc calls
        </span>
        <span className={styles.chevron}>{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.row}>
              <span>Total</span>
              <span>{fmtMs(totalMs)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.indent}>Prefetch</span>
              <span>{fmtMs(phases.prefetchMs)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.indent}>Execution</span>
              <span>{fmtMs(phases.executionMs)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.indent}>↳ lazy loads (tax)</span>
              <span>{fmtMs(phases.lazyLoadMs)}</span>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.row}>
              <span>RPC calls</span>
              <span>
                {rpc.totalLogicalCalls} logical / {rpc.totalHttpCalls} http
                {rpc.batchSize > 1 ? ` (batch=${rpc.batchSize})` : ""}
              </span>
            </div>
            {rpc.duplicates > 0 && (
              <div className={styles.row}>
                <span className={styles.warn}>
                  {rpc.duplicates} duplicate calls
                </span>
                <span />
              </div>
            )}
            <table className={styles.methodTable}>
              <thead>
                <tr>
                  <th>method</th>
                  <th>count</th>
                  <th>total</th>
                  <th>max</th>
                </tr>
              </thead>
              <tbody>
                {methodRows.map(([method, m]) => (
                  <tr key={method}>
                    <td>{method}</td>
                    <td>{m.count}</td>
                    <td>{fmtMs(m.totalMs)}</td>
                    <td>{fmtMs(m.maxMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.section}>
            <div className={styles.row}>
              <span>Touched</span>
              <span>
                {touched.addresses} unique addresses · {touched.slots} unique
                slots
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
