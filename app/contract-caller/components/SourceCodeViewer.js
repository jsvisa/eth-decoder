"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSourceCode } from "../hooks/useSourceCode";
import {
  findFunctionSource,
  buildFunctionNameSet,
} from "../../utils/solidityParser";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";
import { getCachedAbi } from "../../utils/abiCache";
import JSZip from "jszip";
import styles from "./SourceCodeViewer.module.css";

function highlightSolidity(source) {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const tokenRe = new RegExp(
    `(\\/\\/\\/\\s*@(?:notice|dev|param|return|title|author|custom:)\\b.*$)|` +
      `(\\/\\*[\\s\\S]*?\\*\\/)|` +
      `(\\/\\/.*$)|` +
      `("(?:\\\\.|[^"\\\\])*")|` +
      `('(?:\\\\.|[^'\\\\])*')|` +
      `(\\b(?:pragma|import|contract|library|interface|function|modifier|event|error|struct|enum|mapping|address|uint|int|bool|string|bytes|var|public|private|internal|external|constant|immutable|view|pure|payable|virtual|override|abstract|returns|return|if|else|for|while|do|break|continue|require|revert|emit|delete|new|is|using|constructor|fallback|receive|assembly|unchecked|try|catch|type|calldata|memory|storage|indexed|anonymous|override|virtual)\\b)|` +
      `(\\b(?:0x[0-9a-fA-F]+|\\d+\\.?\\d*)\\b)`,
    "gm",
  );

  return escaped.replace(
    tokenRe,
    (
      match,
      natspec,
      blockComment,
      lineComment,
      dqString,
      sqString,
      keyword,
      number,
    ) => {
      if (natspec) return `<span class="${styles.hlNatspec}">${match}</span>`;
      if (blockComment || lineComment)
        return `<span class="${styles.hlComment}">${match}</span>`;
      if (dqString || sqString)
        return `<span class="${styles.hlString}">${match}</span>`;
      if (keyword) return `<span class="${styles.hlKeyword}">${match}</span>`;
      if (number) return `<span class="${styles.hlNumber}">${match}</span>`;
      return match;
    },
  );
}

function highlightSearchMatch(htmlLine, isCurrentMatch, styles_) {
  const cls = isCurrentMatch ? styles_.searchMatchCurrent : styles_.searchMatch;
  return `<mark class="${cls}">${htmlLine}</mark>`;
}

function makeFunctionNamesClickable(html, fnNameSet, callLinkClass) {
  if (!fnNameSet || fnNameSet.size === 0) return html;
  const names = [...fnNameSet].sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const nameRe = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    return text.replace(
      nameRe,
      (fnName) =>
        `<span class="${callLinkClass}" data-fn-name="${fnName}">${fnName}</span>`,
    );
  });
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
  const lineRefs = useRef({});
  const searchInputRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const sourceContent = activeFile ? sources?.[activeFile] || "" : "";

  function fuzzyMatch(line, query) {
    let qi = 0;
    const lowerLine = line.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let start = -1;
    for (let i = 0; i < lowerLine.length && qi < lowerQuery.length; i++) {
      if (lowerLine[i] === lowerQuery[qi]) {
        if (qi === 0) start = i;
        qi++;
      }
    }
    if (qi === lowerQuery.length) return start;
    return -1;
  }

  const searchMatches = useMemo(() => {
    if (!searchQuery || !sourceContent) return [];
    const lines = sourceContent.split("\n");
    const matches = [];
    lines.forEach((line, i) => {
      const col = fuzzyMatch(line, searchQuery);
      if (col !== -1) {
        matches.push({ line: i + 1, col, length: searchQuery.length });
      }
    });
    return matches;
  }, [searchQuery, sourceContent]);

  const safeMatchIndex = useMemo(() => {
    if (searchMatches.length === 0) return -1;
    return Math.min(matchIndex, searchMatches.length - 1);
  }, [matchIndex, searchMatches]);

  useEffect(() => {
    const match = safeMatchIndex >= 0 ? searchMatches[safeMatchIndex] : null;
    if (match && lineRefs.current[match.line]) {
      lineRefs.current[match.line]?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [safeMatchIndex, searchMatches, activeFile]);

  useEffect(() => {
    setSearchQuery("");
    setMatchIndex(0);
  }, [activeFile]);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

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
    }
  }, [open]);

  // Highlight the entire file once, then split into lines — avoids per-line regex.
  const fnNameSet = useMemo(() => buildFunctionNameSet(sources), [sources]);

  const highlightedLines = useMemo(() => {
    if (!sourceContent) return [];
    const html = highlightSolidity(sourceContent);
    const withLinks = makeFunctionNamesClickable(
      html,
      fnNameSet,
      styles.callLink,
    );
    return withLinks.split("\n");
  }, [sourceContent, fnNameSet]);

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
    if (highlightLine > 0 && lineRefs.current[highlightLine]) {
      lineRefs.current[highlightLine]?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [highlightLine, activeFile]);

  const [downloading, setDownloading] = useState(false);

  const handleCodeClick = useCallback(
    (e) => {
      const target = e.target.closest("[data-fn-name]");
      if (!target) return;

      const fnName = target.getAttribute("data-fn-name");
      if (!fnName || !sources) return;

      const result = findFunctionSource(fnName, sources);
      if (result) {
        if (result.file !== activeFile) {
          setActiveFile(result.file);
        }
        setHighlightLine(result.line);
      }
    },
    [sources, activeFile],
  );

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

  if (!open) return null;

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
          if (searchMatches.length > 0) {
            setMatchIndex((prev) => (prev + 1) % searchMatches.length);
          }
          return;
        }
        if (e.key === "Enter") {
          if (e.target === searchInputRef.current) {
            e.preventDefault();
            if (searchMatches.length > 0) {
              setMatchIndex((prev) => (prev + 1) % searchMatches.length);
            }
          }
          return;
        }
      }}
      tabIndex={-1}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <span className={styles.title}>Source Code</span>
            {compilerVersion && (
              <span className={styles.compilerBadge}>
                solc {compilerVersion}
              </span>
            )}
            <span
              className={`${styles.address} ${copied ? styles.addressCopied : ""}`}
              onClick={() => {
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title={`Click to copy: ${address}`}
            >
              {copied
                ? "Copied!"
                : `${address.slice(0, 6)}...${address.slice(-4)}`}
            </span>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.headerSearch}>
              <input
                ref={searchInputRef}
                className={styles.searchInput}
                type="text"
                placeholder="Fuzzy search…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setMatchIndex(0);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
              />
              <span className={styles.searchCount}>
                {searchMatches.length > 0
                  ? `${safeMatchIndex + 1} / ${searchMatches.length}`
                  : searchQuery
                    ? "0 / 0"
                    : ""}
              </span>
              <button
                className={styles.searchNavBtn}
                onClick={() =>
                  setMatchIndex((prev) =>
                    prev <= 0 ? searchMatches.length - 1 : prev - 1,
                  )
                }
                type="button"
                disabled={searchMatches.length === 0}
              >
                ▲
              </button>
              <button
                className={styles.searchNavBtn}
                onClick={() =>
                  setMatchIndex((prev) => (prev + 1) % searchMatches.length)
                }
                type="button"
                disabled={searchMatches.length === 0}
              >
                ▼
              </button>
            </div>
            <button
              className={styles.downloadBtn}
              onClick={handleDownload}
              disabled={!sources || downloading}
              type="button"
              title="Download source as ZIP"
            >
              {downloading ? "..." : "⬇"}
            </button>
            <button className={styles.closeBtn} onClick={onClose} type="button">
              ✕
            </button>
          </div>
        </div>

        {fileNames.length > 1 && (
          <div className={styles.fileTabs}>
            {fileNames.map((name) => (
              <button
                key={name}
                className={`${styles.fileTab} ${name === activeFile ? styles.fileTabActive : ""}`}
                onClick={() => setActiveFile(name)}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className={styles.body}>
          {error && !highlightedLines.length && (
            <div className={styles.statusError}>{error}</div>
          )}
          {highlightedLines.length > 0 || loading ? (
            <div className={styles.codeContainer} onClick={handleCodeClick}>
              <table className={styles.codeTable}>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={2} className={styles.loadingLine}>
                        <span className={styles.spinner} /> Loading source
                        code...
                      </td>
                    </tr>
                  )}
                  {highlightedLines.map((htmlLine, i) => {
                    const lineNum = i + 1;
                    const isFunctionLine = lineNum === highlightLine;
                    const isExecutedLine =
                      highlightLines && highlightLines.includes(lineNum);
                    const lineClass = [
                      styles.codeLine,
                      isFunctionLine ? styles.codeLineHighlight : "",
                      isExecutedLine ? styles.codeLineExecuted : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const currentMatch =
                      safeMatchIndex >= 0
                        ? searchMatches[safeMatchIndex]
                        : null;
                    const isSearchMatch = searchMatches.some(
                      (m) => m.line === lineNum,
                    );
                    const displayHtml =
                      searchQuery && isSearchMatch
                        ? highlightSearchMatch(
                            htmlLine,
                            currentMatch && currentMatch.line === lineNum,
                            styles,
                          )
                        : htmlLine;
                    return (
                      <tr
                        key={i}
                        ref={(el) => {
                          lineRefs.current[lineNum] = el;
                        }}
                        className={lineClass}
                      >
                        <td className={styles.lineNum}>{lineNum}</td>
                        <td
                          className={styles.codeCell}
                          dangerouslySetInnerHTML={{
                            __html: displayHtml || " ",
                          }}
                        />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            !error && (
              <div className={styles.status}>No source code available</div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
