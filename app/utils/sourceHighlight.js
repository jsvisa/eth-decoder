// Language-aware tokenization, search, and HTML rendering for the source
// code viewer. All functions operate on raw text and return escaped HTML —
// callers render with dangerouslySetInnerHTML.

export function detectLang(fileName) {
  const name = (fileName || "").toLowerCase();
  if (name.endsWith(".sol")) return "solidity";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".vy")) return "vyper";
  if (name.endsWith(".yul")) return "yul";
  return "plain";
}

export const LANG_LABELS = {
  solidity: "Solidity",
  json: "JSON",
  vyper: "Vyper",
  yul: "Yul",
  plain: "Text",
};

export function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Each spec: combined regex with capture groups + parallel type list.
const SOL_RE = new RegExp(
  `(\\/\\/\\/\\s*@(?:notice|dev|param|return|title|author|custom:)\\b.*$)|` +
    `(\\/\\*[\\s\\S]*?\\*\\/)|` +
    `(\\/\\/.*$)|` +
    `("(?:\\\\.|[^"\\\\])*")|` +
    `('(?:\\\\.|[^'\\\\])*')|` +
    `(\\b(?:pragma|import|contract|library|interface|function|modifier|event|error|struct|enum|mapping|address|uint256|uint128|uint96|uint64|uint48|uint32|uint24|uint16|uint8|int256|int128|int64|int32|int24|int16|int8|uint|int|bool|string|bytes32|bytes16|bytes8|bytes4|bytes1|bytes|var|public|private|internal|external|constant|immutable|view|pure|payable|virtual|override|abstract|returns|return|if|else|for|while|do|break|continue|require|revert|emit|delete|new|is|using|constructor|fallback|receive|assembly|unchecked|try|catch|type|calldata|memory|storage|indexed|anonymous)\\b)|` +
    `(\\b(?:0x[0-9a-fA-F]+|\\d+\\.?\\d*)\\b)`,
  "gmd",
);
const SOL_TYPES = [
  "natspec",
  "comment",
  "comment",
  "string",
  "string",
  "keyword",
  "number",
];

const JSON_RE = new RegExp(
  `("(?:\\\\.|[^"\\\\])*")(\\s*:)|` +
    `("(?:\\\\.|[^"\\\\])*")|` +
    `(-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)|` +
    `\\b(true|false|null)\\b|` +
    `(\\/\\/.*$)|` +
    `(\\/\\*[\\s\\S]*?\\*\\/)`,
  "gmd",
);
const JSON_TYPES = [
  "key",
  null,
  "string",
  "number",
  "literal",
  "comment",
  "comment",
];

const VYPER_RE = new RegExp(
  `(#[^\\n]*)|` +
    `("""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*')|` +
    `(@[A-Za-z_]+)|` +
    `(\\b(?:def|return|if|elif|else|for|in|while|break|continue|pass|event|log|struct|enum|interface|implements|uses|exports|from|import|constant|public|external|internal|view|pure|payable|nonpayable|assert|raise|emit|self|msg|block|tx|chain|abstract|and|or|not)\\b)|` +
    `(\\b(?:True|False|None)\\b)|` +
    `(\\b\\d+(?:\\.\\d+)?(?:e\\d+)?\\b)`,
  "gmd",
);
const VYPER_TYPES = [
  "comment",
  "string",
  "keyword",
  "keyword",
  "literal",
  "number",
];

const YUL_RE = new RegExp(
  `(\\/\\/[^\\n]*)|` +
    `(\\/\\*[\\s\\S]*?\\*\\/)|` +
    `("(?:\\\\.|[^"\\\\])*")|` +
    `(\\b(?:function|let|if|switch|case|default|for|leave|return|revert|log0|log1|log2|log3|log4|and|or|not|xor|add|sub|mul|div|sdiv|mod|smod|exp|lt|gt|slt|sgt|eq|iszero|shl|shr|sar|keccak256|byte|pop|mload|mstore|mstore8|sload|sstore|tload|tstore|msize|gas|address|balance|selfbalance|caller|origin|callvalue|calldataload|calldatasize|calldatacopy|codesize|codecopy|extcodesize|extcodecopy|returndatasize|returndatacopy|create|create2|call|callcode|delegatecall|staticcall|stop|invalid|selfdestruct|jump|jumpi|pc)\\b)|` +
    `(\\b(?:0x[0-9a-fA-F]+|\\d+)\\b)`,
  "gmd",
);
const YUL_TYPES = ["comment", "comment", "string", "keyword", "number"];

const LANGS = {
  solidity: { re: SOL_RE, types: SOL_TYPES },
  json: { re: JSON_RE, types: JSON_TYPES },
  vyper: { re: VYPER_RE, types: VYPER_TYPES },
  yul: { re: YUL_RE, types: YUL_TYPES },
  plain: { re: null, types: [] },
};

function tokenizeWith(text, re, types) {
  const segs = [];
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const matchEnd = m.index + m[0].length;
    if (m.index > last) segs.push({ text: text.slice(last, m.index) });
    // Emit each typed capture group as its own segment (using indices from
    // the 'd' flag) so a single match can mix styled and plain parts.
    let cursor = Math.max(m.index, last);
    for (let g = 1; g < m.length; g++) {
      const ind = m.indices && m.indices[g];
      const type = types[g - 1];
      if (!ind || !type) continue;
      const [s, e] = ind;
      if (e <= cursor) continue;
      if (s > cursor) segs.push({ text: text.slice(cursor, s) });
      segs.push({ type, text: text.slice(Math.max(s, cursor), e) });
      cursor = e;
    }
    if (cursor < matchEnd) segs.push({ text: text.slice(cursor, matchEnd) });
    last = matchEnd;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  return segs;
}

// Tokenize full text, then split into per-line segment arrays. Multi-line
// tokens (block comments, triple-quoted strings) keep their type on every
// continuation line so each rendered row is self-contained valid HTML.
export function tokenizeToLines(text, lang) {
  if (!text) return [];
  const spec = LANGS[lang] || LANGS.plain;
  const segs = spec.re ? tokenizeWith(text, spec.re, spec.types) : [{ text }];
  const lines = [[]];
  for (const seg of segs) {
    if (!seg.text.includes("\n")) {
      lines[lines.length - 1].push(seg);
      continue;
    }
    const parts = seg.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i])
        lines[lines.length - 1].push({ type: seg.type, text: parts[i] });
    }
  }
  return lines;
}

function emitSeg(type, text, classMap) {
  const escaped = escapeHtml(text);
  const cls = type && classMap && classMap[type];
  return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
}

function renderPlain(segs, classMap) {
  let out = "";
  for (const seg of segs) out += emitSeg(seg.type, seg.text, classMap);
  return out;
}

// Render one line's segments to HTML, optionally wrapping match ranges in
// <mark>. Marks: [{col, length, cls, current?}] with col/length on the raw
// (unescaped) line text. Syntax colors are preserved inside and around marks.
export function renderLineSegments(segs, classMap, marks) {
  if (!segs || segs.length === 0) return "";
  if (!marks || marks.length === 0) return renderPlain(segs, classMap);

  const ranges = marks
    .map((m) => ({
      start: m.col,
      end: m.col + m.length,
      cls: m.cls,
      current: !!m.current,
    }))
    .sort((a, b) => a.start - b.start);

  let out = "";
  let offset = 0;
  let rangeIdx = 0;
  for (const seg of segs) {
    const segStart = offset;
    const segEnd = offset + seg.text.length;
    offset = segEnd;
    let cursor = segStart;
    while (rangeIdx < ranges.length && ranges[rangeIdx].end <= cursor)
      rangeIdx++;
    let i = rangeIdx;
    while (i < ranges.length && ranges[i].start < segEnd) {
      const r = ranges[i];
      const s = Math.max(r.start, segStart);
      const e = Math.min(r.end, segEnd);
      if (s > cursor) {
        out += emitSeg(
          seg.type,
          seg.text.slice(cursor - segStart, s - segStart),
          classMap,
        );
      }
      out += `<mark class="${r.cls}">${escapeHtml(
        seg.text.slice(s - segStart, e - segStart),
      )}</mark>`;
      cursor = e;
      if (e >= segEnd) break;
      i++;
    }
    if (cursor < segEnd) {
      out += emitSeg(seg.type, seg.text.slice(cursor - segStart), classMap);
    }
  }
  return out;
}

// Convenience: highlight a standalone snippet (e.g. hover tooltip body).
export function highlightText(text, lang, classMap) {
  if (!text) return "";
  return tokenizeToLines(text, lang)
    .map((segs) => renderLineSegments(segs, classMap))
    .join("\n");
}

// Compile a search query into a matcher with find(line) → [{col, length}].
export function compileSearch(query, opts = {}) {
  const { regex = false, caseSensitive = false } = opts;
  if (!query) return null;
  if (regex) {
    try {
      const re = new RegExp(query, caseSensitive ? "g" : "gi");
      return { error: null, find: (line) => regexFindAll(re, line) };
    } catch (e) {
      return { error: e.message, find: () => [] };
    }
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  return {
    error: null,
    find: (line) => {
      const hay = caseSensitive ? line : line.toLowerCase();
      const res = [];
      let i = 0;
      while ((i = hay.indexOf(needle, i)) !== -1) {
        res.push({ col: i, length: query.length });
        i += 1;
      }
      return res;
    },
  };
}

function regexFindAll(re, line) {
  re.lastIndex = 0;
  const res = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    res.push({ col: m.index, length: m[0].length });
  }
  return res;
}

export function searchContent(content, matcher, cap = 2000) {
  if (!matcher || matcher.error || !content) return [];
  const lines = content.split("\n");
  const out = [];
  for (let i = 0; i < lines.length && out.length < cap; i++) {
    for (const m of matcher.find(lines[i])) {
      out.push({ line: i + 1, col: m.col, length: m.length });
      if (out.length >= cap) break;
    }
  }
  return out;
}

export function searchAllFiles(
  sources,
  matcher,
  capPerFile = 500,
  capTotal = 5000,
) {
  if (!matcher || matcher.error) return [];
  const groups = [];
  let total = 0;
  for (const [file, content] of Object.entries(sources || {})) {
    if (total >= capTotal) break;
    const matches = searchContent(content, matcher, capPerFile);
    if (matches.length) {
      groups.push({ file, matches });
      total += matches.length;
    }
  }
  return groups;
}
