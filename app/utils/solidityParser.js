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

// ---- Symbol index (outline panel) ----

const CONTRACT_RE =
  /^(?:abstract\s+)?(contract|interface|library)\s+([A-Za-z_$][\w$]*)/;
const MEMBER_RES = [
  { kind: "function", re: /^\s*function\s+([A-Za-z_$][\w$]*)/ },
  { kind: "constructor", re: /^\s*constructor\s*\(/ },
  { kind: "function", re: /^\s*(fallback|receive)\s*\(/ },
  { kind: "event", re: /^\s*event\s+([A-Za-z_$][\w$]*)/ },
  { kind: "error", re: /^\s*error\s+([A-Za-z_$][\w$]*)/ },
  { kind: "modifier", re: /^\s*modifier\s+([A-Za-z_$][\w$]*)/ },
  { kind: "struct", re: /^\s*struct\s+([A-Za-z_$][\w$]*)/ },
  { kind: "enum", re: /^\s*enum\s+([A-Za-z_$][\w$]*)/ },
];
// State variables: type (mapping or identifier) + visibility/constant/immutable
// keyword + name, terminated by `=` or `;`.
const STATEVAR_RE =
  /^\s*(?:mapping\s*\([^)]*\)|[A-Za-z_$][\w$]*(?:\[[^\]]*\])*)\s+(?:public|private|internal|constant|immutable)\b[^=;]*?([A-Za-z_$][\w$]*)\s*(?:=|;)/;
// Mapping declarations without a visibility keyword.
const MAPPINGVAR_RE =
  /^\s*mapping\s*\([^)]*\)\s+(?:public\s+|private\s+|internal\s+)?([A-Za-z_$][\w$]*)\s*(?:=|;)/;

const CONTRACT_KINDS = new Set(["contract", "interface", "library"]);
const SCOPE_KINDS = new Set([...CONTRACT_KINDS, "struct", "enum"]);

// Removes line/block comments and string literals so brace counting and
// definition matching don't trip on prose. `state.inBlock` persists across
// lines for multi-line block comments.
function stripCode(line, state) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf("*/", i);
      if (end === -1) {
        i = line.length;
      } else {
        state.inBlock = false;
        i = end + 2;
      }
      continue;
    }
    const ch = line[i];
    if (ch === "/" && line[i + 1] === "/") break;
    if (ch === "/" && line[i + 1] === "*") {
      state.inBlock = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < line.length) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const fileSymbolsCache = new Map();

// Builds an outline for one file: top-level contracts/interfaces/libraries
// (with nested functions, events, errors, modifiers, structs, enums and
// state variables) plus free-floating definitions. Entries:
//   { kind, name, line, sig, children? }
export function buildFileSymbols(content) {
  if (!content) return [];

  const cacheKey = fnv1a(content);
  const cached = fileSymbolsCache.get(cacheKey);
  if (cached) return cached;

  const lines = content.split("\n");
  const state = { inBlock: false };
  const stack = []; // open scopes: { entry, depth }
  const result = [];
  let depth = 0;

  const addEntry = (entry) => {
    const top = stack[stack.length - 1];
    if (top && CONTRACT_KINDS.has(top.entry.kind)) {
      top.entry.children.push(entry);
    } else {
      result.push(entry);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCode(lines[i], state);
    if (!stripped.trim()) continue;

    const opens = (stripped.match(/{/g) || []).length;
    const closes = (stripped.match(/}/g) || []).length;
    const depthBefore = depth;
    depth += opens - closes;
    while (stack.length && depth < stack[stack.length - 1].depth) {
      stack.pop();
    }

    let entry = null;
    const cm = CONTRACT_RE.exec(stripped.trim());
    if (cm) {
      entry = {
        kind: cm[1],
        name: cm[2],
        line: i + 1,
        sig: lines[i].trim(),
        children: [],
      };
      result.push(entry);
      // Body starts after this line's opening brace; if the scope also
      // closes on this line (opens == closes) the re-check below pops it.
      stack.push({ entry, depth: depthBefore + opens });
      while (stack.length && depth < stack[stack.length - 1].depth) {
        stack.pop();
      }
      continue;
    }

    for (const { kind, re } of MEMBER_RES) {
      const m = re.exec(stripped);
      if (m) {
        entry = {
          kind,
          name: kind === "constructor" ? "constructor" : m[1],
          line: i + 1,
          sig: lines[i].trim(),
        };
        if (SCOPE_KINDS.has(kind)) {
          addEntry(entry);
          entry.children = entry.children || [];
          stack.push({ entry, depth: depthBefore + opens });
          while (stack.length && depth < stack[stack.length - 1].depth) {
            stack.pop();
          }
        } else {
          addEntry(entry);
        }
        break;
      }
    }
    if (entry) continue;

    if (stripped.trimEnd().endsWith(";")) {
      const sv = STATEVAR_RE.exec(stripped) || MAPPINGVAR_RE.exec(stripped);
      if (sv) {
        addEntry({
          kind: "var",
          name: sv[1],
          line: i + 1,
          sig: lines[i].trim(),
        });
      }
    }
  }

  fileSymbolsCache.set(cacheKey, result);
  return result;
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
  const skipKey = skipClasses.join("|");
  let cachedRe = clickableReCache.get(fnNameSet);
  if (
    !cachedRe ||
    cachedRe.cls !== callLinkClass ||
    cachedRe.skip !== skipKey
  ) {
    const names = [...fnNameSet].sort((a, b) => b.length - a.length);
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    cachedRe = {
      source: `\\b(${escaped.join("|")})\\b`,
      cls: callLinkClass,
      skip: skipKey,
    };
    clickableReCache.set(fnNameSet, cachedRe);
  }
  const nameRe = new RegExp(cachedRe.source, "g");
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

const clickableReCache = new WeakMap();
