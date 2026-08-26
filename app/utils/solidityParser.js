const cache = new Map();
const nameSetCache = new Map();

// Matches a Solidity definition at the start of a (trimmed) line:
//   function foo(...)  |  event Foo(...)  |  error Foo(...)
// Non-global so it can only match once per line — no exec loop, no backtracking risk.
const DEF_RE = /^(?:function|event|error)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

// FNV-1a hash of the sorted `filename:content` pairs so the cache key reflects
// actual content, not just filenames/lengths. Two contracts with the same
// filenames+lengths but different content must not collide in the shared cache.
function makeSourcesKey(sources) {
  const joined = Object.keys(sources)
    .sort()
    .map((k) => `${k}\u0000${sources[k]}`)
    .join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function buildFunctionMap(sources) {
  if (!sources) return null;

  const cacheKey = makeSourcesKey(sources);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const map = new Map();
  for (const [file, content] of Object.entries(sources)) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = DEF_RE.exec(lines[i].trim());
      if (m && !map.has(m[1])) {
        const bodyLines = [];
        let braceDepth = 0;
        let started = false;
        for (let j = i; j < lines.length; j++) {
          const line = lines[j];
          const opens = (line.match(/{/g) || []).length;
          const closes = (line.match(/}/g) || []).length;
          bodyLines.push(line);
          braceDepth += opens - closes;
          if (opens > 0) started = true;
          if (started && braceDepth <= 0) break;
          if (!started && line.trim().endsWith(";")) break;
        }
        map.set(m[1], {
          name: m[1],
          file,
          line: i + 1,
          body: bodyLines.join("\n"),
        });
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

  const cacheKey = makeSourcesKey(sources);
  const cached = nameSetCache.get(cacheKey);
  if (cached) return cached;

  const map = buildFunctionMap(sources);
  const set = new Set(map ? [...map.keys()] : []);
  nameSetCache.set(cacheKey, set);
  return set;
}

// Wraps occurrences of known function names in syntax-highlighted HTML with
// clickable links. `skipClasses` names the span classes (strings/comments)
// whose text must not be made clickable — a name inside a string literal or
// comment is prose, not a call site.
export function makeFunctionNamesClickable(
  html,
  fnNameSet,
  callLinkClass,
  skipClasses = [],
) {
  if (!fnNameSet || fnNameSet.size === 0) return html;
  const names = [...fnNameSet].sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const nameRe = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");
  let skipDepth = 0;
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) {
      if (skipDepth > 0) {
        if (/^<\/span>/.test(tag)) skipDepth--;
      } else if (/^<span [^>]*class=/.test(tag)) {
        if (skipClasses.some((cls) => tag.includes(cls))) skipDepth++;
      }
      return tag;
    }
    if (skipDepth > 0) return text;
    return text.replace(
      nameRe,
      (fnName) =>
        `<span class="${callLinkClass}" data-fn-name="${fnName}">${fnName}</span>`,
    );
  });
}
