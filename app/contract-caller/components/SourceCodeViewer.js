"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSourceCode } from "../hooks/useSourceCode";
import { findFunctionSource } from "../../utils/solidityParser";
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
  const highlightedLines = useMemo(() => {
    if (!sourceContent) return [];
    const html = highlightSolidity(sourceContent);
    return html.split("\n");
  }, [sourceContent]);

  // Memoize function search via Solidity AST parser — O(1) lookup after first parse.
  const { foundFile, foundLine } = useMemo(() => {
    if (!functionName || !sources) return { foundFile: null, foundLine: -1 };
    const result = findFunctionSource(functionName, sources);
    return result
      ? { foundFile: result.file, foundLine: result.line }
      : { foundFile: null, foundLine: -1 };
  }, [sources, functionName]);

  useEffect(() => {
    if (foundFile && foundFile !== activeFile) {
      setActiveFile(foundFile);
    }
    setHighlightLine(foundLine);
  }, [foundFile, foundLine, activeFile]);

  useEffect(() => {
    if (highlightLine > 0 && lineRefs.current[highlightLine]) {
      lineRefs.current[highlightLine]?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [highlightLine, activeFile]);

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
            <span className={styles.address}>{address}</span>
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
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
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
            <div className={styles.codeContainer}>
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
