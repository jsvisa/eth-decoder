// Benchmark worker (variant C): runs the full tevm simulation on a separate
// thread with the fast sync step hook, so the interpreter never competes with
// the main thread and hooks stay synchronous.
//
// Cancel plumbing mirrors what a browser Web Worker deployment would do: the
// main thread sets a SharedArrayBuffer flag; this thread's timer (which gets
// macrotask slices every ~50ms via the step hook's deferred next()) aborts the
// controller, and the hook's abort check stops the EVM.
import { register } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

register(
  new URL("./sim-worker-hooks.mjs", import.meta.url).href,
  import.meta.url,
);

const { params, sab } = workerData;
const flags = new Int32Array(sab);
const controller = new AbortController();
const timer = setInterval(() => {
  if (Atomics.load(flags, 0) === 1) {
    controller.abort();
  }
}, 5);

try {
  const { simulateWithTevm } = await import("../../app/utils/tevmSimulator.js");
  const result = await simulateWithTevm({
    ...params,
    abortSignal: controller.signal,
    onProgress: (pct) => parentPort.postMessage({ type: "progress", pct }),
  });
  parentPort.postMessage({ type: "done", result });
} catch (err) {
  parentPort.postMessage({
    type: "error",
    message: String(err?.message || err),
  });
} finally {
  clearInterval(timer);
}
