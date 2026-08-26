const cache = new Map();
const nameSetCache = new Map();

// Matches a Solidity definition at the start of a (trimmed) line:
//   function foo(...)  |  event Foo(...)  |  error Foo(...)
// Non-global so it can only match once per line — no exec loop, no backtracking risk.
const DEF_RE = /^(?:function|event|error)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

export function buildFunctionMap(sources) {
  if (!sources) return null;

  const cacheKey = Object.keys(sources)
    .sort()
    .map((k) => `${k}:${sources[k].length}`)
    .join(",");
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const map = new Map();
  for (const [file, content] of Object.entries(sources)) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = DEF_RE.exec(lines[i].trim());
      if (m && !map.has(m[1])) {
        const bodyLines = [lines[i].trim()];
        let braceDepth = (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
        let j = i + 1;
        while (braceDepth > 0 && j < lines.length) {
          bodyLines.push(lines[j].trim());
          braceDepth += (lines[j].match(/{/g) || []).length;
          braceDepth -= (lines[j].match(/}/g) || []).length;
          j++;
        }
        map.set(m[1], { name: m[1], file, line: i + 1, body: bodyLines.join("\n") });
      }
    }
  }

  cache.set(cacheKey, map);
  return map;
}

export function findFunctionSource(functionName, sources) {
  if (!functionName || !sources) return null;
  const baseName = functionName.split("(")[0];
  if (!baseName) return null;

  const map = buildFunctionMap(sources);
  return map.get(baseName) || null;
}

export function buildFunctionNameSet(sources) {
  if (!sources) return new Set();

  const cacheKey = Object.keys(sources)
    .sort()
    .map((k) => `${k}:${sources[k].length}`)
    .join(",");
  const cached = nameSetCache.get(cacheKey);
  if (cached) return cached;

  const map = buildFunctionMap(sources);
  const set = new Set(map ? [...map.keys()] : []);
  nameSetCache.set(cacheKey, set);
  return set;
}
