"use client";

import { useState, useEffect } from "react";
import yaml from "js-yaml";
import styles from "./page.module.css";

const STORAGE_KEY = "evm_event_decoder_history";
const MAX_HISTORY_ITEMS = 50;

export default function EventDecoder() {
  const [topics, setTopics] = useState([""]);
  const [data, setData] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isYaml, setIsYaml] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, []);

  // Load from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("topics");
    const d = params.get("data");
    if (t) setTopics(t.split(",").map((s) => s.trim()));
    if (d) setData(d);
    if (t)
      setTimeout(() => document.querySelector("form")?.requestSubmit(), 100);
  }, []);

  const saveToHistory = (topicList, dataHex, output) => {
    const item = {
      id: Date.now(),
      topics: topicList,
      data: dataHex,
      output,
      timestamp: new Date().toISOString(),
    };
    const next = [
      item,
      ...history.filter((h) => h.topics[0] !== topicList[0]),
    ].slice(0, MAX_HISTORY_ITEMS);
    setHistory(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const addTopic = () => setTopics((t) => [...t, ""]);
  const removeTopic = (i) => setTopics((t) => t.filter((_, idx) => idx !== i));
  const updateTopic = (i, val) =>
    setTopics((t) => t.map((v, idx) => (idx === i ? val : v)));

  const isValidHex = (val) => !val || /^(0x)?[0-9a-fA-F]*$/.test(val.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    const topic0 = topics[0]?.trim();
    if (!topic0) {
      setError("Topic0 (event signature hash) is required");
      return;
    }
    if (!isValidHex(topic0) || topic0.replace("0x", "").length !== 64) {
      setError("Topic0 must be a 32-byte hex string (64 hex chars)");
      return;
    }
    for (let i = 1; i < topics.length; i++) {
      if (topics[i].trim() && !isValidHex(topics[i])) {
        setError(`Topic${i} is not valid hex`);
        return;
      }
    }
    if (data.trim() && !isValidHex(data)) {
      setError("Data must be valid hex");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const filteredTopics = topics.map((t) => t.trim()).filter(Boolean);
      const params = new URLSearchParams({
        sign: filteredTopics[0],
        topics: filteredTopics.join(","),
        data: data.trim() || "0x",
      });
      const res = await fetch(`/api/decode-event?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.msg === "not found")
        throw new Error("Event signature not found in database");
      if (json.msg !== "ok" || !json.data)
        throw new Error(json.error || "Decode failed");

      const output = json.data;
      setResult(output);
      setIsYaml(false);
      setCopied(false);
      saveToHistory(filteredTopics, data.trim() || "0x", output);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const syntaxHighlight = (json) => {
    if (typeof json !== "string") json = JSON.stringify(json, null, 2);
    json = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = styles.jsonNumber;
        if (/^"/.test(match))
          cls = /:$/.test(match) ? styles.jsonKey : styles.jsonString;
        else if (/true|false/.test(match)) cls = styles.jsonBoolean;
        else if (/null/.test(match)) cls = styles.jsonNull;
        return `<span class="${cls}">${match}</span>`;
      },
    );
  };

  const getDisplayContent = () => {
    if (!result) return "";
    if (isYaml) {
      return yaml.dump(result, { indent: 2, lineWidth: -1, noRefs: true });
    }
    return syntaxHighlight(result);
  };

  const handleCopy = async () => {
    try {
      const text = isYaml
        ? yaml.dump(result, { indent: 2, lineWidth: -1, noRefs: true })
        : JSON.stringify(result, null, 2);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>EVM Event Log Decoder</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Topics */}
          <div className={styles.topicsSection}>
            <div className={styles.sectionLabel}>Topics</div>
            {topics.map((topic, i) => (
              <div key={i} className={styles.topicRow}>
                <span className={styles.topicIndex}>[{i}]</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => updateTopic(i, e.target.value)}
                  placeholder={
                    i === 0
                      ? "topic0: event signature hash (32 bytes, e.g. 0xddf252ad...)"
                      : `topic${i}: indexed param value (32 bytes)`
                  }
                  className={`${styles.input} ${topic && !isValidHex(topic) ? styles.inputError : ""}`}
                  disabled={loading}
                />
                {topics.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTopic(i)}
                    className={styles.removeBtn}
                    disabled={loading}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {topics.length < 4 && (
              <button
                type="button"
                onClick={addTopic}
                className={styles.addTopicBtn}
                disabled={loading}
              >
                + Add topic
              </button>
            )}
          </div>

          {/* Data */}
          <div className={styles.dataSection}>
            <div className={styles.sectionLabel}>
              Data <span className={styles.optional}>(optional)</span>
            </div>
            <input
              type="text"
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder="0x... (ABI-encoded non-indexed params)"
              className={`${styles.input} ${data && !isValidHex(data) ? styles.inputError : ""}`}
              disabled={loading}
            />
          </div>

          <div className={styles.buttonGroup}>
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? "Decoding..." : "Decode"}
            </button>
            <button
              type="button"
              className={styles.clearBtn}
              disabled={loading}
              onClick={() => {
                setTopics([""]);
                setData("");
                setResult(null);
                setError(null);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        {error && (
          <div className={styles.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <h2 className={styles.eventName}>
                {result.event || "Decoded Event"}
              </h2>
              <div className={styles.resultActions}>
                <button
                  onClick={() => setIsYaml(!isYaml)}
                  className={styles.actionButton}
                  type="button"
                >
                  {isYaml ? "JSON" : "YAML"}
                </button>
                <button
                  onClick={handleCopy}
                  className={styles.actionButton}
                  type="button"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Decoded args as a clean table */}
            {result.inputs?.length > 0 && (
              <div className={styles.argsTable}>
                {result.inputs.map((inp, i) => (
                  <div key={i} className={styles.argRow}>
                    <span className={styles.argName}>
                      {inp.name || `arg${i}`}
                    </span>
                    <span className={styles.argType}>{inp.type}</span>
                    {inp.indexed && (
                      <span className={styles.argIndexed}>indexed</span>
                    )}
                    <span className={styles.argValue}>
                      {String(result.args?.[inp.name] ?? "")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Raw JSON/YAML output */}
            <pre
              className={styles.json}
              dangerouslySetInnerHTML={{
                __html: isYaml ? getDisplayContent() : syntaxHighlight(result),
              }}
            />
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h3>Recent Decodes ({history.length})</h3>
              <div className={styles.historyActions}>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={styles.historyToggle}
                  type="button"
                >
                  {showHistory ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Clear all history?")) {
                      setHistory([]);
                      localStorage.removeItem(STORAGE_KEY);
                    }
                  }}
                  className={styles.historyClear}
                  type="button"
                >
                  Clear All
                </button>
              </div>
            </div>
            {showHistory && (
              <div className={styles.historyList}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    className={styles.historyItem}
                    onClick={() => {
                      setTopics(item.topics.length ? item.topics : [""]);
                      setData(item.data === "0x" ? "" : item.data);
                      setResult(item.output);
                      setError(null);
                    }}
                  >
                    <div className={styles.historyTop}>
                      <div className={styles.historyInput}>
                        {item.topics[0]?.slice(0, 10)}...
                        {item.topics[0]?.slice(-6)}
                        {item.topics.length > 1 && (
                          <span className={styles.historyTopicCount}>
                            {" "}
                            +{item.topics.length - 1}
                          </span>
                        )}
                      </div>
                      {item.output?.event && (
                        <div className={styles.historyFunc}>
                          {item.output.event}
                        </div>
                      )}
                    </div>
                    <div className={styles.historyMeta}>
                      <span className={styles.historyTime}>
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
