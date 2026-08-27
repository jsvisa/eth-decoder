"use client";

import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { useSourceCode } from "../hooks/useSourceCode";
import {
  findFunctionSource,
  buildFunctionNameSet,
  buildFileSymbols,
  makeFunctionNamesClickable,
} from "../../utils/solidityParser";
import {
  detectLang,
  LANG_LABELS,
  tokenizeToLines,
  renderLineSegments,
  highlightText,
  compileSearch,
  searchContent,
  searchAllFiles,
} from "../../utils/sourceHighlight";
import { buildFileTree, filterTree } from "../../utils/fileTree";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";
import { getCachedAbi } from "../../utils/abiCache";
import JSZip from "jszip";
import styles from "./SourceCodeViewer.module.css";

const LINE_HEIGHT = 20; // must match .codeLine height in the CSS module
const OVERSCAN = 10;
const UI_PREFS_KEY = "scv-ui-v1";

const CLASS_MAP = {
  comment: styles.hlComment,
  natspec: styles.hlNatspec,
  string: styles.hlString,
  keyword: styles.hlKeyword,
  number: styles.hlNumber,
  key: styles.hlKey,
  literal: styles.hlLiteral,
};

const KIND_LABELS = {
  contract: "C",
  interface: "I",
  library: "L",
  function: "ƒ",
  constructor: "ƒ",
  event: "◆",
  error: "✖",
  modifier: "m",
  struct: "S",
  enum: "E",
  var: "v",
};

function loadUiPrefs() {
  try {
    return JSON.parse(localStorage.getItem(UI_PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export default function SourceCodeViewer({
  open,
  address,
  chain,
  functionName,
  highlightLines,
  sourceFile,
  onClose,
}) {
  const { sources, compilerVersion, loading, error } = useSourceCode(
    chain,
    open ? address : null,
  );

  const fileNames = useMemo(
    () => (sources ? Object.keys(sources) : []),
    [sources],
  );
  const [activeFile, setActiveFile] = useState(null);
  const [highlightLine, setHighlightLine] = useState(-1);
  const [scrollNonce, setScrollNonce] = useState(0);
  const lineRefs = useRef({});
  const searchInputRef = useRef(null);
  const gotoInputRef = useRef(null);
  const scrollRef = useRef(null);
  const modalRef = useRef(null);

  const [prefs, setPrefs] = useState(() => ({
    sidebar: true,
    outline: true,
    width: null,
    height: null,
    ...loadUiPrefs(),
  }));
  const [fullscreen, setFullscreen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [allFiles, setAllFiles] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState("");
  const [flash, setFlash] = useState("");
  const flashTimerRef = useRef(null);

  const [treeQuery, setTreeQuery] = useState("");
  const [collapsedDirs, setCollapsedDirs] = useState(() => new Set());

  const sourceContent = activeFile ? sources?.[activeFile] || "" : "";
  const lang = useMemo(() => detectLang(activeFile), [activeFile]);
  const totalLines = useMemo(
    () => (sourceContent ? sourceContent.split("\n").length : 0),
    [sourceContent],
  );
  const linesCache = useMemo(() => {
    const map = new Map();
    for (const [file, content] of Object.entries(sources || {})) {
      map.set(file, content.split("\n"));
    }
    return map;
  }, [sources]);

  const showFlash = useCallback((msg) => {
    setFlash(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(""), 1500);
  }, []);

  // ---- Search ----

  const matcher = useMemo(
    () =>
      searchQuery
        ? compileSearch(searchQuery, { regex: isRegex, caseSensitive })
        : null,
    [searchQuery, isRegex, caseSensitive],
  );

  const fileMatches = useMemo(
    () => searchContent(sourceContent, matcher),
    [sourceContent, matcher],
  );

  const allGroups = useMemo(
    () => (allFiles ? searchAllFiles(sources, matcher) : []),
    [allFiles, sources, matcher],
  );

  const flatMatches = useMemo(() => {
    if (!matcher || matcher.error) return [];
    if (allFiles) {
      return allGroups.flatMap((g) =>
        g.matches.map((m) => ({ ...m, file: g.file })),
      );
    }
    return fileMatches.map((m) => ({ ...m, file: activeFile }));
  }, [matcher, allFiles, allGroups, fileMatches, activeFile]);

  const groupStartIndex = useMemo(() => {
    const map = new Map();
    let acc = 0;
    for (const g of allGroups) {
      map.set(g.file, acc);
      acc += g.matches.length;
    }
    return map;
  }, [allGroups]);

  const safeMatchIndex = useMemo(() => {
    if (flatMatches.length === 0) return -1;
    return Math.min(matchIndex, flatMatches.length - 1);
  }, [matchIndex, flatMatches]);

  const marksByLine = useMemo(() => {
    if (!matcher || matcher.error || flatMatches.length === 0) return null;
    const map = new Map();
    flatMatches.forEach((m, idx) => {
      if (m.file !== activeFile) return;
      if (!map.has(m.line)) map.set(m.line, []);
      map.get(m.line).push({
        col: m.col,
        length: m.length,
        cls:
          idx === safeMatchIndex
            ? styles.searchMatchCurrent
            : styles.searchMatch,
        current: idx === safeMatchIndex,
      });
    });
    return map;
  }, [matcher, flatMatches, activeFile, safeMatchIndex]);

  const goToNextMatch = useCallback(() => {
    if (flatMatches.length > 0) {
      setMatchIndex((prev) => (prev + 1) % flatMatches.length);
    }
  }, [flatMatches.length]);

  const goToPrevMatch = useCallback(() => {
    if (flatMatches.length > 0) {
      setMatchIndex((prev) => (prev <= 0 ? flatMatches.length - 1 : prev - 1));
    }
  }, [flatMatches.length]);

  const jumpToMatch = useCallback(
    (idx) => {
      const m = flatMatches[idx];
      if (!m) return;
      setMatchIndex(idx);
      if (m.file !== activeFile) setActiveFile(m.file);
    },
    [flatMatches, activeFile],
  );

  // ---- Virtualization ----

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const rafRef = useRef(0);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrollTop(scrollRef.current?.scrollTop ?? 0);
    });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [open, activeFile, fullscreen, prefs.width, prefs.height]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const scrollToLine = useCallback((line) => {
    const el = scrollRef.current;
    if (el && el.clientHeight > 0) {
      el.scrollTop = Math.max(
        0,
        (line - 1) * LINE_HEIGHT - el.clientHeight / 2 + LINE_HEIGHT / 2,
      );
    } else {
      // No measurable viewport (e.g. tests, collapsed container): the row is
      // guaranteed to be rendered in full-list mode.
      lineRefs.current[line]?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
    }
  }, []);

  // ---- Navigation (definition jumps with history) ----

  const [navHistory, setNavHistory] = useState([]);
  const [navIndex, setNavIndex] = useState(-1);
  const navIndexRef = useRef(-1);
  const navHistoryRef = useRef([]);

  const pushNav = useCallback((file, line) => {
    const idx = navIndexRef.current;
    const hist = navHistoryRef.current;
    const next = hist.slice(0, idx + 1);
    next.push({ file, line });
    navHistoryRef.current = next;
    navIndexRef.current = idx + 1;
    setNavHistory(next);
    setNavIndex(idx + 1);
    setScrollNonce((n) => n + 1);
  }, []);

  const goBack = useCallback(() => {
    const idx = navIndexRef.current;
    if (idx <= 0) return;
    const newIndex = idx - 1;
    const entry = navHistoryRef.current[newIndex];
    navIndexRef.current = newIndex;
    setNavIndex(newIndex);
    if (entry.file !== activeFile) setActiveFile(entry.file);
    setHighlightLine(entry.line);
  }, [activeFile]);

  const goForward = useCallback(() => {
    const idx = navIndexRef.current;
    const hist = navHistoryRef.current;
    if (idx >= hist.length - 1) return;
    const newIndex = idx + 1;
    const entry = hist[newIndex];
    navIndexRef.current = newIndex;
    setNavIndex(newIndex);
    if (entry.file !== activeFile) setActiveFile(entry.file);
    setHighlightLine(entry.line);
  }, [activeFile]);

  const navigateTo = useCallback(
    (file, line) => {
      if (file !== activeFile) setActiveFile(file);
      setHighlightLine(line);
      pushNav(file, line);
    },
    [activeFile, pushNav],
  );

  const selectFile = useCallback(
    (file) => {
      if (file === activeFile) return;
      setActiveFile(file);
      setHighlightLine(-1);
    },
    [activeFile],
  );

  // ---- Effects ----

  useEffect(() => {
    if (fileNames.length > 0 && !fileNames.includes(activeFile)) {
      setActiveFile(
        sourceFile && fileNames.includes(sourceFile)
          ? sourceFile
          : fileNames[0],
      );
    }
  }, [fileNames, activeFile, sourceFile]);

  useEffect(() => {
    if (!open) {
      setHighlightLine(-1);
      setActiveFile(null);
      setSearchQuery("");
      setMatchIndex(0);
      setGotoOpen(false);
      setTreeQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Reset transient per-file state on file switch.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
    if (!allFiles) {
      setSearchQuery("");
      setMatchIndex(0);
    }
  }, [activeFile, allFiles]);

  // Keep the active file's ancestor directories expanded.
  useEffect(() => {
    if (!activeFile) return;
    const parts = activeFile.split("/");
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (let i = 1; i < parts.length; i++) {
        if (next.delete(parts.slice(0, i).join("/"))) changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeFile]);

  useEffect(() => {
    if (!prefs) return;
    try {
      localStorage.setItem(
        UI_PREFS_KEY,
        JSON.stringify({
          sidebar: prefs.sidebar,
          outline: prefs.outline,
          width: prefs.width,
          height: prefs.height,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [open, prefs]);

  useEffect(() => {
    const match = safeMatchIndex >= 0 ? flatMatches[safeMatchIndex] : null;
    if (match && match.file === activeFile) {
      scrollToLine(match.line);
    }
  }, [safeMatchIndex, flatMatches, activeFile, scrollToLine]);

  // Memoize function search via Solidity AST parser — O(1) lookup after first parse.
  const { foundFile, foundLine } = useMemo(() => {
    if (!functionName || !sources) return { foundFile: null, foundLine: -1 };
    const result = findFunctionSource(functionName, sources);
    return result
      ? { foundFile: result.file, foundLine: result.line }
      : { foundFile: null, foundLine: -1 };
  }, [sources, functionName]);

  useEffect(() => {
    if (foundFile) {
      setActiveFile(foundFile);
    }
    setHighlightLine(foundLine);
  }, [foundFile, foundLine]);

  useEffect(() => {
    if (highlightLine > 0) {
      scrollToLine(highlightLine);
    }
  }, [highlightLine, activeFile, scrollNonce, scrollToLine]);

  // ---- Highlighting ----

  const fnNameSet = useMemo(() => buildFunctionNameSet(sources), [sources]);

  const lineSegs = useMemo(
    () => tokenizeToLines(sourceContent, lang),
    [sourceContent, lang],
  );

  const outlineSymbols = useMemo(
    () => (lang === "solidity" ? buildFileSymbols(sourceContent) : []),
    [sourceContent, lang],
  );

  const tree = useMemo(() => buildFileTree(fileNames), [fileNames]);
  const isFiltering = treeQuery.length > 0;
  const filteredTree = useMemo(
    () => filterTree(tree, treeQuery),
    [tree, treeQuery],
  );

  const highlightLinesSet = useMemo(
    () => (highlightLines ? new Set(highlightLines) : null),
    [highlightLines],
  );

  const renderRowHtml = useCallback(
    (idx) => {
      const segs = lineSegs[idx];
      const marks = marksByLine ? marksByLine.get(idx + 1) : null;
      let html = renderLineSegments(segs, CLASS_MAP, marks);
      html = makeFunctionNamesClickable(html, fnNameSet, styles.callLink, [
        styles.hlString,
        styles.hlComment,
        styles.hlNatspec,
      ]);
      return html;
    },
    [lineSegs, marksByLine, fnNameSet],
  );

  const canWindow = viewportH > 0 || totalLines > 2000;
  const effViewport = canWindow ? viewportH || 600 : 0;
  const winStart = canWindow
    ? Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN)
    : 0;
  const winEnd = canWindow
    ? Math.min(
        totalLines,
        Math.ceil((scrollTop + effViewport) / LINE_HEIGHT) + OVERSCAN,
      )
    : totalLines;
  const visibleRows = [];
  for (let i = winStart; i < winEnd; i++) visibleRows.push(i);

  // ---- Clipboard helpers ----

  const copyText = useCallback(
    (text, msg) => {
      try {
        navigator.clipboard.writeText(text);
      } catch {
        // ignore clipboard errors
      }
      showFlash(msg);
    },
    [showFlash],
  );

  const copyLine = useCallback(
    (lineNum, e) => {
      e?.stopPropagation();
      const line = linesCache.get(activeFile)?.[lineNum - 1] ?? "";
      copyText(line, `Line ${lineNum} copied`);
    },
    [linesCache, activeFile, copyText],
  );

  const copyAnchor = useCallback(
    (lineNum, e) => {
      e?.stopPropagation();
      copyText(`${activeFile}:${lineNum}`, `Copied ${activeFile}:${lineNum}`);
    },
    [activeFile, copyText],
  );

  const copyFile = useCallback(() => {
    copyText(sourceContent, "File contents copied");
  }, [sourceContent, copyText]);

  // ---- Go to line ----

  const openGoto = useCallback(() => {
    setGotoOpen(true);
    setTimeout(() => gotoInputRef.current?.focus(), 0);
  }, []);

  const handleGoto = useCallback(() => {
    const m = /^(\d+)(?::(\d+))?$/.exec(gotoValue.trim());
    if (!m) {
      showFlash("Go to line: use 12 or 12:5");
      return;
    }
    const line = clamp(parseInt(m[1], 10), 1, Math.max(totalLines, 1));
    setGotoOpen(false);
    setGotoValue("");
    if (activeFile) navigateTo(activeFile, line);
  }, [gotoValue, totalLines, activeFile, navigateTo, showFlash]);

  // ---- Download ZIP ----

  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!sources || downloading) return;

    const chainId =
      BUILT_IN_CHAIN_IDS[chain] ||
      (() => {
        try {
          const custom = JSON.parse(
            localStorage.getItem("custom_chains") || "[]",
          );
          return custom.find((c) => c.id === chain)?.chainId;
        } catch {
          return null;
        }
      })();

    if (!chainId) return;

    setDownloading(true);
    try {
      const cached = getCachedAbi(chain, address);
      const sourceFiles = Object.keys(sources);
      const meta = {
        chainId,
        address: address.toLowerCase(),
        ...(cached?.contractName && { contractName: cached.contractName }),
        ...(cached?.isProxy && { isProxy: true }),
        ...(cached?.implAddress && {
          implAddress: cached.implAddress.toLowerCase(),
        }),
        ...(cached?.implContractName && {
          implContractName: cached.implContractName,
        }),
        ...(cached?.facetAddresses?.length && {
          facetAddresses: cached.facetAddresses.map((a) => a.toLowerCase()),
        }),
        ...(cached?.facets?.length && {
          facets: Object.fromEntries(
            cached.facets.map((f) => [f.address.toLowerCase(), f.name]),
          ),
        }),
        sourceFiles: {
          [address.toLowerCase()]: sourceFiles,
          ...(cached?.implAddress && {
            [cached.implAddress.toLowerCase()]: sourceFiles,
          }),
          ...(cached?.facetAddresses?.length &&
            Object.fromEntries(
              cached.facetAddresses.map((a) => [a.toLowerCase(), sourceFiles]),
            )),
        },
      };

      const zip = new JSZip();
      zip.file("meta.json", JSON.stringify(meta, null, 2));
      for (const [fileName, content] of Object.entries(sources)) {
        zip.file(fileName, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${chainId}-${address.toLowerCase()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }, [sources, chain, address, downloading]);

  // ---- Resize / fullscreen ----

  const startResize = useCallback((e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = modalRef.current?.offsetWidth || 900;
    const startH = modalRef.current?.offsetHeight || window.innerHeight * 0.8;
    const onMove = (ev) => {
      const w = clamp(
        startW + (ev.clientX - startX),
        640,
        window.innerWidth - 24,
      );
      setPrefs((p) => ({ ...p, width: w }));
      if (mode === "xy") {
        const h = clamp(
          startH + (ev.clientY - startY),
          400,
          window.innerHeight - 24,
        );
        setPrefs((p) => ({ ...p, height: h }));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ---- Hover tooltip on function names ----

  const [hoverInfo, setHoverInfo] = useState(null);
  const hoverTimerRef = useRef(null);
  const hoverCloseTimerRef = useRef(null);
  const tooltipRef = useRef(null);

  const handleCodeClick = useCallback(
    (e) => {
      const target = e.target.closest("[data-fn-name]");
      if (!target) return;

      const fnName = target.getAttribute("data-fn-name");
      if (!fnName || !sources) return;

      const result = findFunctionSource(fnName, sources);
      if (result) {
        navigateTo(result.file, result.line);
      }
    },
    [sources, navigateTo],
  );

  const handleCodeMouseOver = useCallback(
    (e) => {
      const target = e.target.closest("[data-fn-name]");
      if (!target) return;

      const fnName = target.getAttribute("data-fn-name");
      if (!fnName || !sources) return;

      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        const result = findFunctionSource(fnName, sources);
        if (result) {
          const rect = target.getBoundingClientRect();
          setHoverInfo({
            fnName,
            file: result.file,
            line: result.line,
            body: result.body,
            x: rect.left + rect.width / 2,
            y: rect.top - 8,
          });
        }
      }, 300);
    },
    [sources],
  );

  const handleCodeMouseOut = useCallback(
    (_e) => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (!hoverInfo) return;
      if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = setTimeout(() => {
        setHoverInfo(null);
      }, 200);
    },
    [hoverInfo],
  );

  const handleTooltipMouseEnter = useCallback(() => {
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  const handleTooltipClick = useCallback(() => {
    if (!hoverInfo) return;
    navigateTo(hoverInfo.file, hoverInfo.line);
    setHoverInfo(null);
  }, [hoverInfo, navigateTo]);

  // ---- File tree rendering ----

  const toggleDir = useCallback((path) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const renderTreeNodes = (nodes, depth) =>
    nodes.map((node) => {
      if (node.type === "dir") {
        const collapsed = !isFiltering && collapsedDirs.has(node.path);
        return (
          <div key={node.path}>
            <button
              className={styles.treeDir}
              style={{ paddingLeft: depth * 12 + 8 }}
              onClick={() => toggleDir(node.path)}
              type="button"
            >
              <span className={styles.treeChevron}>
                {collapsed ? "▸" : "▾"}
              </span>
              {node.name}
            </button>
            {!collapsed && renderTreeNodes(node.children, depth + 1)}
          </div>
        );
      }
      return (
        <button
          key={node.path}
          className={`${styles.treeFile} ${node.path === activeFile ? styles.treeFileActive : ""}`}
          style={{ paddingLeft: depth * 12 + 8 }}
          onClick={() => selectFile(node.path)}
          type="button"
          title={node.path}
        >
          {node.name}
        </button>
      );
    });

  // ---- Outline rendering ----

  const renderSymbol = (sym, depth) => (
    <div key={`${sym.kind}-${sym.name}-${sym.line}`}>
      <button
        className={styles.outlineItem}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => navigateTo(activeFile, sym.line)}
        type="button"
        title={sym.sig}
      >
        <span
          className={`${styles.kindBadge} ${styles[`kind${sym.kind}`] || ""}`}
        >
          {KIND_LABELS[sym.kind] || "•"}
        </span>
        <span className={styles.outlineName}>{sym.name}</span>
      </button>
      {sym.children && sym.children.map((c) => renderSymbol(c, depth + 1))}
    </div>
  );

  // ---- Search result rendering (all-files mode) ----

  const renderSearchResults = () => (
    <>
      <div className={styles.panelHeader}>
        {flatMatches.length} result{flatMatches.length === 1 ? "" : "s"} in{" "}
        {allGroups.length} file{allGroups.length === 1 ? "" : "s"}
      </div>
      <div className={styles.panelBody}>
        {allGroups.map((g) => {
          const base = groupStartIndex.get(g.file) ?? 0;
          return (
            <div key={g.file} className={styles.resultGroup}>
              <button
                className={`${styles.treeFile} ${g.file === activeFile ? styles.treeFileActive : ""}`}
                onClick={() => selectFile(g.file)}
                type="button"
                title={g.file}
              >
                {g.file}
                <span className={styles.resultCount}>{g.matches.length}</span>
              </button>
              {g.matches.map((m, i) => {
                const gi = base + i;
                const preview = (linesCache.get(g.file)?.[m.line - 1] || "")
                  .trim()
                  .slice(0, 90);
                return (
                  <button
                    key={gi}
                    className={`${styles.resultItem} ${gi === safeMatchIndex ? styles.resultItemActive : ""}`}
                    onClick={() => jumpToMatch(gi)}
                    type="button"
                    title={preview}
                  >
                    <span className={styles.resultLine}>{m.line}</span>
                    <span className={styles.resultPreview}>{preview}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );

  if (!open) return null;

  const modalStyle = fullscreen
    ? undefined
    : {
        ...(prefs.width ? { width: prefs.width, maxWidth: "none" } : {}),
        ...(prefs.height ? { height: prefs.height } : {}),
      };

  const searchCountText = matcher?.error
    ? "invalid regex"
    : searchQuery
      ? `${safeMatchIndex + 1} / ${flatMatches.length}`
      : "";

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
          e.preventDefault();
          searchInputRef.current?.focus();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "g") {
          e.preventDefault();
          openGoto();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
          e.preventDefault();
          const selection = window.getSelection();
          const range = document.createRange();
          const codeContainer = e.currentTarget.querySelector(
            `.${styles.codeContainer}`,
          );
          if (codeContainer) {
            range.selectNodeContents(codeContainer);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          return;
        }
        if (e.key === "F3" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          goToNextMatch();
          return;
        }
        if (e.key === "/" && e.target.tagName !== "INPUT") {
          e.preventDefault();
          searchInputRef.current?.focus();
          return;
        }
      }}
      tabIndex={-1}
    >
      <div
        ref={modalRef}
        className={`${styles.modal} ${fullscreen ? styles.modalFullscreen : ""}`}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <span className={styles.title}>Source Code</span>
            {compilerVersion && (
              <span className={styles.compilerBadge}>
                solc {compilerVersion}
              </span>
            )}
            <span
              className={`${styles.address} ${flash === "Address copied" ? styles.addressCopied : ""}`}
              onClick={() => {
                navigator.clipboard.writeText(address);
                showFlash("Address copied");
              }}
              title={`Click to copy: ${address}`}
            >
              {`${address.slice(0, 6)}...${address.slice(-4)}`}
            </span>
          </div>
          <div className={styles.headerActions}>
            <button
              className={`${styles.iconBtn} ${prefs.sidebar ? styles.iconBtnActive : ""}`}
              onClick={() => setPrefs((p) => ({ ...p, sidebar: !p.sidebar }))}
              type="button"
              title="Toggle file explorer"
            >
              ▤
            </button>
            <button
              className={`${styles.iconBtn} ${prefs.outline ? styles.iconBtnActive : ""}`}
              onClick={() => setPrefs((p) => ({ ...p, outline: !p.outline }))}
              type="button"
              title="Toggle outline"
            >
              ≣
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => setFullscreen((f) => !f)}
              type="button"
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              ⛶
            </button>
            <button className={styles.closeBtn} onClick={onClose} type="button">
              ✕
            </button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarSearch}>
            <input
              ref={searchInputRef}
              className={styles.searchInput}
              type="text"
              placeholder="Search… (⌘F)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setMatchIndex(0);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) {
                    goToPrevMatch();
                  } else {
                    goToNextMatch();
                  }
                } else if (e.key === "Escape") {
                  if (searchQuery) {
                    setSearchQuery("");
                    setMatchIndex(0);
                  }
                }
              }}
            />
            <button
              className={`${styles.toggleBtn} ${caseSensitive ? styles.toggleBtnActive : ""}`}
              onClick={() => {
                setCaseSensitive((v) => !v);
                setMatchIndex(0);
              }}
              type="button"
              title="Match case"
            >
              Aa
            </button>
            <button
              className={`${styles.toggleBtn} ${isRegex ? styles.toggleBtnActive : ""}`}
              onClick={() => {
                setIsRegex((v) => !v);
                setMatchIndex(0);
              }}
              type="button"
              title="Regular expression"
            >
              .*
            </button>
            <button
              className={`${styles.toggleBtn} ${allFiles ? styles.toggleBtnActive : ""}`}
              onClick={() => setAllFiles((v) => !v)}
              type="button"
              title="Search all files"
            >
              ⊞
            </button>
            <span
              className={`${styles.searchCount} ${matcher?.error ? styles.searchInvalid : ""}`}
            >
              {searchCountText}
            </span>
            <button
              className={styles.searchNavBtn}
              onClick={goToPrevMatch}
              type="button"
              disabled={flatMatches.length === 0}
              title="Previous match (Shift+Enter)"
            >
              ▲
            </button>
            <button
              className={styles.searchNavBtn}
              onClick={goToNextMatch}
              type="button"
              disabled={flatMatches.length === 0}
              title="Next match (Enter)"
            >
              ▼
            </button>
            {searchQuery && (
              <button
                className={styles.searchCloseBtn}
                onClick={() => {
                  setSearchQuery("");
                  setMatchIndex(0);
                }}
                type="button"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {gotoOpen && (
            <input
              ref={gotoInputRef}
              className={styles.gotoInput}
              type="text"
              placeholder="Line number (12 or 12:5)"
              value={gotoValue}
              onChange={(e) => setGotoValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGoto();
                } else if (e.key === "Escape") {
                  setGotoOpen(false);
                  setGotoValue("");
                }
              }}
            />
          )}
          <div className={styles.toolbarRight}>
            <button
              className={styles.navBtn}
              onClick={openGoto}
              type="button"
              title="Go to line (Ctrl+G)"
            >
              ⇥
            </button>
            <button
              className={styles.navBtn}
              onClick={copyFile}
              disabled={!sourceContent}
              type="button"
              title="Copy file contents"
            >
              ⧉
            </button>
            <button
              className={styles.downloadBtn}
              onClick={handleDownload}
              disabled={!sources || downloading}
              type="button"
              title="Download source as ZIP"
            >
              {downloading ? "..." : "⬇"}
            </button>
            <button
              className={styles.navBtn}
              onClick={goBack}
              disabled={navIndex <= 0}
              type="button"
              title="Go back"
            >
              ◀
            </button>
            <button
              className={styles.navBtn}
              onClick={goForward}
              disabled={navIndex >= navHistory.length - 1}
              type="button"
              title="Go forward"
            >
              ▶
            </button>
          </div>
        </div>

        <div className={styles.main}>
          {prefs.sidebar && (
            <div className={styles.sidebar}>
              {allFiles && searchQuery ? (
                renderSearchResults()
              ) : (
                <>
                  <div className={styles.panelHeader}>Files</div>
                  <div className={styles.panelFilterRow}>
                    <input
                      className={styles.panelFilter}
                      type="text"
                      placeholder="Filter files…"
                      value={treeQuery}
                      onChange={(e) => setTreeQuery(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className={styles.panelBody}>
                    {filteredTree
                      ? renderTreeNodes(filteredTree, 0)
                      : treeQuery && (
                          <div className={styles.treeEmpty}>
                            No files match “{treeQuery}”
                          </div>
                        )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className={styles.codeArea}>
            {error && totalLines === 0 && !loading && (
              <div className={styles.statusError}>{error}</div>
            )}
            {totalLines > 0 || loading ? (
              <div
                ref={scrollRef}
                className={styles.codeContainer}
                onScroll={onScroll}
                onClick={handleCodeClick}
                onMouseOver={handleCodeMouseOver}
                onMouseOut={handleCodeMouseOut}
              >
                <table className={styles.codeTable}>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={3} className={styles.loadingLine}>
                          <span className={styles.spinner} /> Loading source
                          code...
                        </td>
                      </tr>
                    )}
                    {!loading && winStart > 0 && (
                      <tr style={{ height: winStart * LINE_HEIGHT }}>
                        <td colSpan={3} />
                      </tr>
                    )}
                    {!loading &&
                      visibleRows.map((i) => {
                        const lineNum = i + 1;
                        const isFunctionLine = lineNum === highlightLine;
                        const isExecutedLine =
                          highlightLinesSet && highlightLinesSet.has(lineNum);
                        const lineClass = [
                          styles.codeLine,
                          isFunctionLine ? styles.codeLineHighlight : "",
                          isExecutedLine ? styles.codeLineExecuted : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <tr
                            key={i}
                            ref={(el) => {
                              lineRefs.current[lineNum] = el;
                            }}
                            className={lineClass}
                          >
                            <td className={styles.lineNum}>
                              <span
                                className={styles.lineNumText}
                                onClick={(e) => copyLine(lineNum, e)}
                                title="Click to copy line"
                              >
                                {lineNum}
                              </span>
                            </td>
                            <td className={styles.gutterCell}>
                              <button
                                className={styles.gutterBtn}
                                onClick={(e) => copyLine(lineNum, e)}
                                type="button"
                                title="Copy line"
                              >
                                ⧉
                              </button>
                              <button
                                className={styles.gutterBtn}
                                onClick={(e) => copyAnchor(lineNum, e)}
                                type="button"
                                title="Copy file:line"
                              >
                                §
                              </button>
                            </td>
                            <td
                              className={styles.codeCell}
                              dangerouslySetInnerHTML={{
                                __html: renderRowHtml(i) || " ",
                              }}
                            />
                          </tr>
                        );
                      })}
                    {!loading && winEnd < totalLines && (
                      <tr
                        style={{ height: (totalLines - winEnd) * LINE_HEIGHT }}
                      >
                        <td colSpan={3} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              !error && (
                <div className={styles.status}>No source code available</div>
              )
            )}
          </div>

          {prefs.outline && outlineSymbols.length > 0 && (
            <div className={styles.outlinePanel}>
              <div className={styles.panelHeader}>Outline</div>
              <div className={styles.panelBody}>
                {outlineSymbols.map((sym) => renderSymbol(sym, 0))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.statusbar}>
          <span className={styles.statusFile}>
            {activeFile || "—"}
            {totalLines > 0 && ` · ${totalLines} lines`}
            {` · ${LANG_LABELS[lang] || "Text"}`}
          </span>
          <span className={styles.statusFlash}>{flash}</span>
        </div>

        {!fullscreen && (
          <>
            <div
              className={styles.resizeHandleX}
              onMouseDown={(e) => startResize(e, "x")}
            />
            <div
              className={styles.resizeHandleXY}
              onMouseDown={(e) => startResize(e, "xy")}
            />
          </>
        )}

        {hoverInfo && (
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            style={{ left: hoverInfo.x, top: hoverInfo.y }}
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
            onClick={handleTooltipClick}
          >
            <div className={styles.tooltipHeader}>
              <span className={styles.tooltipName}>{hoverInfo.fnName}</span>
              <span className={styles.tooltipLocation}>
                {hoverInfo.file}:{hoverInfo.line}
              </span>
            </div>
            <div
              className={styles.tooltipSignature}
              dangerouslySetInnerHTML={{
                __html: highlightText(hoverInfo.body, "solidity", CLASS_MAP),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
