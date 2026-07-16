"use client";

import React from "react";
import { formatTokenAmount } from "../../utils/tokenFormatting";
import styles from "./ResultPanel.module.css";

export default function SimulatedEventLogs({
  logs,
  expanded,
  onToggleExpanded,
  selectedEventNames,
  onSelectedEventNamesChange,
  getExplorerAddressUrl,
  getContractName,
  getTokenSymbol,
  getTokenDecimals,
}) {
  if (!logs || logs.length === 0) return null;

  const eventNames = Array.from(
    new Set(logs.map((log) => log.name || "Unknown Event")),
  );
  const activeEventNames = Array.isArray(selectedEventNames)
    ? selectedEventNames.filter(
        (eventName, index) =>
          eventNames.includes(eventName) &&
          selectedEventNames.indexOf(eventName) === index,
      )
    : [];
  const activeEventNameSet = new Set(activeEventNames);
  const allEventsSelected = activeEventNames.length === 0;
  const filteredLogs = logs
    .map((log, index) => ({ log, index }))
    .filter(
      ({ log }) =>
        allEventsSelected ||
        activeEventNameSet.has(log.name || "Unknown Event"),
    );
  const visibleLogs = expanded ? filteredLogs : [];
  const filterLabel = allEventsSelected
    ? "All events"
    : activeEventNames.length === 1
      ? activeEventNames[0]
      : `${activeEventNames.length} events`;

  const toggleEventName = (eventName) => {
    const nextEventNames = new Set(activeEventNames);
    if (nextEventNames.has(eventName)) {
      nextEventNames.delete(eventName);
    } else {
      nextEventNames.add(eventName);
    }
    onSelectedEventNamesChange(
      eventNames.filter((name) => nextEventNames.has(name)),
    );
  };

  return (
    <div className={styles.logsSection}>
      <h3 className={styles.logsTitle}>
        <span>
          Event Logs{" "}
          {!allEventsSelected
            ? `(${filteredLogs.length} of ${logs.length})`
            : `(${logs.length})`}
        </span>
        <span className={styles.logsEventFilterMenu}>
          <button
            type="button"
            className={styles.logsEventFilter}
            aria-haspopup="true"
          >
            {filterLabel}
          </button>
          <span
            className={styles.logsEventFilterDropdown}
            aria-label="Filter simulation event logs by event name"
          >
            <label className={styles.logsEventFilterOption}>
              <input
                type="checkbox"
                aria-label="Show all event logs"
                checked={allEventsSelected}
                onChange={() => onSelectedEventNamesChange([])}
              />
              <span>All events</span>
            </label>
            {eventNames.map((eventName) => (
              <label key={eventName} className={styles.logsEventFilterOption}>
                <input
                  type="checkbox"
                  aria-label={`Show ${eventName} event logs`}
                  checked={activeEventNameSet.has(eventName)}
                  onChange={() => toggleEventName(eventName)}
                />
                <span>{eventName}</span>
              </label>
            ))}
          </span>
        </span>
        <button
          className={styles.logsToggleBtn}
          onClick={onToggleExpanded}
          type="button"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </h3>
      {visibleLogs.map(({ log, index }) => (
        <SimulatedEventLogItem
          key={index}
          log={log}
          index={index}
          getExplorerAddressUrl={getExplorerAddressUrl}
          getContractName={getContractName}
          getTokenSymbol={getTokenSymbol}
          getTokenDecimals={getTokenDecimals}
        />
      ))}
      {!expanded && logs.length > 5 && (
        <div className={styles.logsMoreIndicator}>
          {logs.length} logs hidden.
        </div>
      )}
    </div>
  );
}

function SimulatedEventLogItem({
  log,
  index,
  getExplorerAddressUrl,
  getContractName,
  getTokenSymbol,
  getTokenDecimals,
}) {
  const contractName = getContractName(log.address);
  const logAddress = log.address?.toLowerCase();
  const symbol =
    log.name === "Transfer" && logAddress ? getTokenSymbol(logAddress) : null;
  const logDecimals =
    log.name === "Transfer" && logAddress ? getTokenDecimals(logAddress) : null;

  return (
    <div className={styles.logItem}>
      <div className={styles.logHeader}>
        <span className={styles.logNameGroup}>
          <span className={styles.logIndex}>#{index}</span>
          <span className={styles.logName}>
            {log.name || "Unknown Event"}
            {symbol && (
              <span className={styles.logTokenSymbol}>[{symbol}]</span>
            )}
          </span>
        </span>
        <span className={styles.logAddress}>
          {contractName && (
            <span className={styles.logContractName}>{contractName}</span>
          )}
          <LogAddress
            address={log.address}
            getExplorerAddressUrl={getExplorerAddressUrl}
          />
        </span>
      </div>
      {log.inputs && log.inputs.length > 0 && (
        <div className={styles.logInputs}>
          {log.inputs.map((input, inputIndex) => (
            <LogInput
              key={inputIndex}
              input={input}
              inputIndex={inputIndex}
              log={log}
              logDecimals={logDecimals}
              symbol={symbol}
              getExplorerAddressUrl={getExplorerAddressUrl}
            />
          ))}
        </div>
      )}
      {(!log.inputs || log.inputs.length === 0) &&
        log.topics &&
        log.topics.length > 0 && <LogTopics log={log} />}
    </div>
  );
}

function LogAddress({ address, getExplorerAddressUrl }) {
  if (!address) return null;
  const url = getExplorerAddressUrl(address);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.logAddressLink}
    >
      {address}
    </a>
  ) : (
    address
  );
}

function LogInput({
  input,
  inputIndex,
  log,
  logDecimals,
  symbol,
  getExplorerAddressUrl,
}) {
  const isTransferValue =
    log.name === "Transfer" &&
    (input.name === "value" || input.name === "wad") &&
    input.type === "uint256" &&
    logDecimals !== null;
  const formattedAmount = isTransferValue
    ? formatTokenAmount(input.value, logDecimals)
    : null;

  return (
    <div className={styles.logInput}>
      <span className={styles.logInputName}>
        {input.name || `arg${inputIndex}`}
      </span>
      <span className={styles.logInputType}>({input.type})</span>
      {input.indexed && <span className={styles.logIndexed}>indexed</span>}
      <span className={styles.logInputValue}>
        <LogInputValue
          input={input}
          getExplorerAddressUrl={getExplorerAddressUrl}
        />
        {formattedAmount !== null && (
          <span className={styles.tokenAmount}>
            {" "}
            ({formattedAmount} {symbol || ""})
          </span>
        )}
      </span>
    </div>
  );
}

function LogInputValue({ input, getExplorerAddressUrl }) {
  if (input.type === "address" && typeof input.value === "string") {
    const url = getExplorerAddressUrl(input.value);
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {input.value}
      </a>
    ) : (
      input.value
    );
  }
  if (Array.isArray(input.value)) {
    return input.value.map((item, i) => (
      <div key={i}>
        {LogInputValue({
          input: { ...input, value: item },
          getExplorerAddressUrl,
        })}
      </div>
    ));
  }
  return typeof input.value === "object"
    ? JSON.stringify(input.value)
    : String(input.value);
}

function LogTopics({ log }) {
  return (
    <div className={styles.logTopics}>
      <div className={styles.logTopicsLabel}>Topics:</div>
      {log.topics.map((topic, topicIndex) => (
        <div key={topicIndex} className={styles.logTopic}>
          [{topicIndex}] {topic}
        </div>
      ))}
      {log.data && log.data !== "0x" && (
        <div className={styles.logData}>
          <span className={styles.logDataLabel}>Data:</span> {log.data}
        </div>
      )}
    </div>
  );
}
