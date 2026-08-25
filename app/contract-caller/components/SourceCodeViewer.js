"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSourceCode } from "../hooks/useSourceCode";
import styles from "./SourceCodeViewer.module.css";

function regexEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFunctionLine(source, functionName) {
  if (!functionName) return -1;
  const baseName = functionName.split("(")[0];
  if (!baseName) return -1;
  const lines = source.split("\n");
  const pattern = new RegExp(`\\bfunction\\s+${regexEscape(baseName)}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return -1;
}

function highlightSolidity(source) {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const keywords =
    /\b(pragma|import|contract|library|interface|function|modifier|event|error|struct|enum|mapping|address|uint|int|bool|string|bytes|var|public|private|internal|external|constant|immutable|view|pure|payable|virtual|override|abstract|returns|return|if|else|for|while|do|break|continue|require|revert|emit|delete|new|is|using|constructor|fallback|receive|assembly|unchecked|try|catch|type|calldata|memory|storage|indexed|anonymous|override|virtual)\b/g;

  const patterns = [
    { re: /\/\/.*$/gm, cls: "comment" },
    { re: /\/\*[\s\S]*?\*\//g, cls: "comment" },
    { re: /"(\\.|[^"\\])*"/g, cls: "string" },
    { re: /'(\\.|[^'\\])*'/g, cls: "string" },
    { re: keywords, cls: "keyword" },
    { re: /\b(0x[0-9a-fA-F]+|\d+\.?\d*)\b/g, cls: "number" },
    {
      re: /\/\/\/\s*@(notice|dev|param|return|title|author|custom:)\b.*$/gm,
      cls: "natspec",
    },
  ];

  let result = escaped;
  for (const { re, cls } of patterns) {
    result = result.replace(re, (match) => {
      if (cls === "comment") {
        return `<span class="${styles.hlComment}">${match}</span>`;
      }
      if (cls === "string") {
        return `<span class="${styles.hlString}">${match}</span>`;
      }
      if (cls === "keyword") {
        return `<span class="${styles.hlKeyword}">${match}</span>`;
      }
      if (cls === "number") {
        return `<span class="${styles.hlNumber}">${match}</span>`;
      }
      if (cls === "natspec") {
        return `<span class="${styles.hlNatspec}">${match}</span>`;
      }
      return match;
    });
  }

  return result;
}

export default function SourceCodeViewer({
  open,
  address,
  chain,
  functionName,
  highlightLines,
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
      setActiveFile(fileNames[0]);
    }
  }, [fileNames, activeFile]);

  useEffect(() => {
    if (!open) {
      setHighlightLine(-1);
      setActiveFile(null);
    }
  }, [open]);

  const sourceContent = activeFile ? sources?.[activeFile] || "" : "";
  const lines = useMemo(
    () => (sourceContent ? sourceContent.split("\n") : []),
    [sourceContent],
  );

  useEffect(() => {
    if (!sourceContent || !functionName) {
      setHighlightLine(-1);
      return;
    }
    const line = findFunctionLine(sourceContent, functionName);
    setHighlightLine(line);
  }, [sourceContent, functionName]);

  useEffect(() => {
    if (highlightLine > 0 && lineRefs.current[highlightLine]) {
      lineRefs.current[highlightLine]?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [highlightLine]);

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
          {error && !lines.length && (
            <div className={styles.statusError}>{error}</div>
          )}
          {lines.length > 0 || loading ? (
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
                  {lines.map((line, i) => {
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
                            __html: line ? highlightSolidity(line) : " ",
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
