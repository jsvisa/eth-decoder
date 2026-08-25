"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSourceCode } from "../hooks/useSourceCode";
import { findFunctionSource } from "../../utils/solidityParser";
import styles from "./SourceCodeViewer.module.css";

function highlightSolidity(source) {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

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

  const sourceContent = activeFile ? sources?.[activeFile] || "" : "";

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
        if (e.key === "Escape") onClose();
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
            <span className={styles.address}>
              {address?.slice(0, 10)}...{address?.slice(-8)}
            </span>
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
                          className={styles.lineCode}
                          dangerouslySetInnerHTML={{
                            __html: htmlLine || " ",
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
