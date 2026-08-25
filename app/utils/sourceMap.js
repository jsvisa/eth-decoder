/**
 * Parse a Solidity compiler source map string into a PC → source location lookup.
 *
 * The source map format is a semicolon-separated list of instruction mappings.
 * Each instruction mapping is a colon-separated tuple: s:l:f:j:m
 *   s = source index (into the source list)
 *   l = source line (0-indexed)
 *   f = source file index
 *   j = jump type ('i' = into, 'o' = out, '-' = regular)
 *   m = modifier depth
 *
 * Empty fields mean "same as previous instruction".
 * See: https://docs.soliditylang.org/en/latest/internals/source_mappings.html
 */

export function parseSourceMap(sourceMap) {
  if (!sourceMap) return null;

  const entries = sourceMap.split(";");
  const map = new Map();
  let last = { s: -1, l: -1, f: -1, j: -1, m: -1 };

  for (let pc = 0; pc < entries.length; pc++) {
    const entry = entries[pc].trim();
    if (!entry) {
      map.set(pc, { ...last });
      continue;
    }
    const parts = entry.split(":");
    const s = parts[0] === "" ? last.s : parseInt(parts[0], 10);
    const l = parts[1] === "" ? last.l : parseInt(parts[1], 10);
    const f = parts[2] === "" ? last.f : parseInt(parts[2], 10);
    const j = parts[3] === "" ? last.j : parts[3];
    const m = parts[4] === "" ? last.m : parseInt(parts[4], 10);

    const mapped = { s, l, f, j, m };
    map.set(pc, mapped);
    last = mapped;
  }

  return map;
}

/**
 * Convert a set of PCs to a sorted array of unique 1-indexed line numbers.
 * Lines with -1 (no mapping) are excluded.
 */
export function pcsToLines(pcSet, sourceMap) {
  if (!sourceMap || !pcSet || pcSet.size === 0) return [];

  const lines = new Set();
  for (const pc of pcSet) {
    const mapping = sourceMap.get(pc);
    if (mapping && mapping.l >= 0) {
      lines.add(mapping.l + 1);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

/**
 * Get the source file name for a file index from the metadata sources.
 */
export function getSourceFile(pc, sourceMap, sourceFiles) {
  if (!sourceMap || !sourceFiles) return null;
  const mapping = sourceMap.get(pc);
  if (!mapping || mapping.f < 0) return null;
  const keys = Object.keys(sourceFiles);
  return mapping.f < keys.length ? keys[mapping.f] : null;
}
