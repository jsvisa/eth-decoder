import { fetchContractOutput } from "./sourcify";
import { parseSourceMap, pcsToLines, getSourceFile } from "./sourceMap";

/**
 * Remove raw program counters from every trace node.
 *
 * PCs are an internal input for source-map resolution — the in-browser
 * simulator consumes them client-side, but API responses and saved results
 * have no use for them and they dominate the payload size.
 */
export function stripPcsFromTrace(node) {
  if (!node) return;
  if (node.pcs) delete node.pcs;
  for (const child of node.calls || []) {
    stripPcsFromTrace(child);
  }
}

function collectTraceAddresses(callTrace) {
  const addresses = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.to) addresses.add(node.to.toLowerCase());
    for (const child of node.calls || []) walk(child);
  };
  walk(callTrace);
  return addresses;
}

function resolveNodeSourceLines(node, sourceMapsByAddr, sourceFilesByAddr) {
  if (!node) return;
  if (node.pcs && node.pcs.length > 0 && node.to) {
    const addr = node.to.toLowerCase();
    const sourceMap = sourceMapsByAddr.get(addr);
    if (sourceMap) {
      node.sourceLines = pcsToLines(new Set(node.pcs), sourceMap);
      // The first mapped PC determines the file — mirrors the client-side
      // resolver in useCallExecution so both paths agree on the highlight.
      const firstMapped = node.pcs.find(
        (pc) => sourceMap.get(pc) && sourceMap.get(pc).f >= 0,
      );
      const sourceFile = getSourceFile(
        firstMapped,
        sourceMap,
        sourceFilesByAddr.get(addr),
      );
      if (sourceFile) node.sourceFile = sourceFile;
    }
  }
  for (const child of node.calls || []) {
    resolveNodeSourceLines(child, sourceMapsByAddr, sourceFilesByAddr);
  }
}

/**
 * Resolve each trace node's raw PCs to source lines using Sourcify source
 * maps, so saved/shared simulations can render the source view without the
 * client-side resolver (which only runs on locally simulated traces).
 * Best-effort: addresses Sourcify doesn't know simply stay unmapped.
 * @param {object} callTrace - Call trace tree (mutated in place)
 * @param {number|string} chainId - Numeric chain ID
 * @param {Map<string, {sourceMap: string, sources: object}|null>} [cache] -
 *   Optional per-request cache shared across session-mode calls
 */
export async function resolveTraceSourceLinesForSave(
  callTrace,
  chainId,
  cache = new Map(),
) {
  if (!callTrace) return;
  const addresses = collectTraceAddresses(callTrace);
  if (addresses.size === 0) return;

  const sourceMapsByAddr = new Map();
  const sourceFilesByAddr = new Map();
  await Promise.all(
    [...addresses].map(async (addr) => {
      let output = cache.get(addr);
      if (output === undefined) {
        output = await fetchContractOutput(addr, chainId);
        cache.set(addr, output);
      }
      if (output?.sourceMap) {
        sourceMapsByAddr.set(addr, parseSourceMap(output.sourceMap));
        sourceFilesByAddr.set(addr, output.sources || null);
      }
    }),
  );
  if (sourceMapsByAddr.size === 0) return;

  resolveNodeSourceLines(callTrace, sourceMapsByAddr, sourceFilesByAddr);
}
