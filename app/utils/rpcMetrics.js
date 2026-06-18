// Pure utility — no React, no DOM. Used by tevmSimulator to instrument RPC traffic.
//
// A collector is single-use: one simulation = one collector. It wraps a viem
// transport factory so every inner request() call is timed, classified, and
// counted, while the EVM and prefetch code paths see an unchanged interface.

const STATE_METHODS = new Set([
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getBalance",
  "eth_createAccessList",
  "eth_getProof",
  "eth_getTransactionCount",
]);

function nowMs() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function createMetricsCollector({ batchSize = 1 } = {}) {
  let startedAt = 0;
  let endedAt = 0;
  let logicalCalls = 0;
  let httpCalls = 0;
  let duplicates = 0;
  const byMethod = Object.create(null);
  const seenParamKeys = new Set();
  const touchedAddresses = new Set();
  const touchedSlots = new Set();
  const phases = { prefetchMs: 0, executionMs: 0, lazyLoadMs: 0 };
  const phaseMarks = {};
  const callLog = [];

  function recordCall(method, params, durationMs) {
    logicalCalls += 1;
    const bucket = byMethod[method] || { count: 0, totalMs: 0, maxMs: 0 };
    bucket.count += 1;
    bucket.totalMs += durationMs;
    if (durationMs > bucket.maxMs) bucket.maxMs = durationMs;
    byMethod[method] = bucket;

    if (STATE_METHODS.has(method) && Array.isArray(params)) {
      const key = method + "|" + JSON.stringify(params);
      if (seenParamKeys.has(key)) duplicates += 1;
      else seenParamKeys.add(key);

      const addr =
        typeof params[0] === "string" ? params[0].toLowerCase() : null;
      if (addr) touchedAddresses.add(addr);
      if (method === "eth_getStorageAt" && typeof params[1] === "string") {
        touchedSlots.add(addr + "|" + params[1].toLowerCase());
      }
    }
  }

  return {
    start() {
      startedAt = nowMs();
    },
    end() {
      endedAt = nowMs();
    },

    markPhase(name, when) {
      const t = nowMs();
      const key = name + (when === "start" ? "Start" : "End");
      phaseMarks[key] = t;
    },

    wrap(transportFactory) {
      return (config) => {
        const inner = transportFactory(config);
        return {
          ...inner,
          request: async ({ method, params }) => {
            const t0 = nowMs();
            try {
              const result = await inner.request({ method, params });
              const dt = nowMs() - t0;
              try {
                recordCall(method, params, dt);
                callLog.push({ method, startedAt: t0, durationMs: dt });
                httpCalls += 1;
              } catch (_) {
                // metrics recording must never crash the caller
              }
              return result;
            } catch (err) {
              const dt = nowMs() - t0;
              try {
                recordCall(method, params, dt);
                callLog.push({ method, startedAt: t0, durationMs: dt });
                httpCalls += 1;
              } catch (_) {
                // metrics recording must never crash the caller
              }
              throw err;
            }
          },
        };
      };
    },

    snapshot() {
      const totalMs = endedAt && startedAt ? endedAt - startedAt : 0;

      const prefetchMs =
        phaseMarks.prefetchEnd && phaseMarks.prefetchStart
          ? phaseMarks.prefetchEnd - phaseMarks.prefetchStart
          : 0;
      const executionMs =
        phaseMarks.executionEnd && phaseMarks.executionStart
          ? phaseMarks.executionEnd - phaseMarks.executionStart
          : 0;

      let lazyLoadMs = 0;
      if (phaseMarks.executionStart && phaseMarks.executionEnd) {
        for (const c of callLog) {
          if (
            c.startedAt >= phaseMarks.executionStart &&
            c.startedAt <= phaseMarks.executionEnd
          ) {
            lazyLoadMs += c.durationMs;
          }
        }
      }

      const httpEstimate =
        batchSize > 1
          ? Math.max(1, Math.ceil(logicalCalls / batchSize))
          : logicalCalls;

      return {
        totalMs,
        phases: { prefetchMs, executionMs, lazyLoadMs },
        rpc: {
          totalLogicalCalls: logicalCalls,
          totalHttpCalls: batchSize > 1 ? httpEstimate : logicalCalls,
          batchSize,
          duplicates,
          byMethod: { ...byMethod },
        },
        touched: {
          addresses: touchedAddresses.size,
          slots: touchedSlots.size,
        },
      };
    },
  };
}
