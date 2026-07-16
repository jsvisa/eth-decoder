"use client";

import React from "react";
import styles from "./EventsTab.module.css";

/**
 * Purely presentational tab panel for event log selection, fetch controls, and results table.
 *
 * @param {{
 *   events: object[],
 *   selectedEvents: string[],
 *   onToggleEvent: (sig: string) => void,
 *   onSelectAll: () => void,
 *   onClearSelection: () => void,
 *   eventFilter: string,
 *   onEventFilterChange: (s: string) => void,
 *   eventListCollapsed: boolean,
 *   onToggleEventList: () => void,
 *   logsFromBlock: string,
 *   logsToBlock: string,
 *   onLogsFromBlockChange: (s: string) => void,
 *   onLogsToBlockChange: (s: string) => void,
 *   logsPage: number,
 *   logsOffset: number,
 *   onLogsPageChange: (n: number) => void,
 *   onLogsOffsetChange: (n: number) => void,
 *   onFetchLogs: () => void,
 *   fetchingLogs: boolean,
 *   logsError: string|null,
 *   logsFetched: boolean,
 *   eventLogs: object[],
 *   logsFilter: string,
 *   onLogsFilterChange: (s: string) => void,
 *   onDownloadCsv: () => void,
 *   latestBlock: number|null,
 * }} props
 */
export default function EventsTab({
  events,
  selectedEvents,
  onToggleEvent,
  onSelectAll,
  onClearSelection,
  eventFilter,
  onEventFilterChange,
  eventListCollapsed,
  onToggleEventList,
  logsFromBlock,
  logsToBlock,
  onLogsFromBlockChange,
  onLogsToBlockChange,
  logsPage,
  logsOffset,
  onLogsPageChange,
  onLogsOffsetChange,
  onFetchLogs,
  fetchingLogs,
  logsError,
  logsFetched,
  eventLogs,
  logsFilter,
  onLogsFilterChange,
  onDownloadCsv,
  latestBlock,
}) {
  const filteredEvents = eventFilter
    ? events.filter((e) =>
        e.name.toLowerCase().includes(eventFilter.toLowerCase()),
      )
    : events;

  const filteredLogs = logsFilter.trim()
    ? eventLogs.filter((log) => {
        const expr = logsFilter.trim().toLowerCase();
        const json = JSON.stringify(log).toLowerCase();
        return json.includes(expr);
      })
    : eventLogs;

  return (
    <div className={styles.eventsSection}>
      {/* Collapsible Event Selection */}
      <div className={styles.eventSelectionSection}>
        <div
          className={styles.eventSelectionHeader}
          onClick={onToggleEventList}
        >
          {eventListCollapsed ? "\u25B6" : "\u25BC"}
          <span className={styles.eventSelectionTitle}>
            Select Events ({selectedEvents.length} of {events.length} selected)
          </span>
        </div>
        {!eventListCollapsed && (
          <>
            <div className={styles.eventListHeader}>
              <input
                type="text"
                value={eventFilter}
                onChange={(e) => onEventFilterChange(e.target.value)}
                placeholder="Search events..."
                className={styles.eventSearchInput}
              />
              <button
                onClick={onSelectAll}
                className={styles.eventSelectBtn}
                type="button"
              >
                Select All
              </button>
              <button
                onClick={onClearSelection}
                className={styles.eventSelectBtn}
                type="button"
              >
                Clear
              </button>
            </div>
            <div className={styles.eventList}>
              {filteredEvents.map((event) => (
                <label key={event.name} className={styles.eventItem}>
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event.name)}
                    onChange={() => onToggleEvent(event.name)}
                  />
                  <span className={styles.eventTag}>E</span>
                  <span className={styles.eventName}>{event.name}</span>
                  <span className={styles.eventParams}>
                    (
                    {event.inputs
                      ?.map((i) => `${i.indexed ? "indexed " : ""}${i.type}`)
                      .join(", ")}
                    )
                  </span>
                </label>
              ))}
              {filteredEvents.length === 0 && (
                <div className={styles.eventItemEmpty}>No matching events</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Fetch Controls */}
      <div className={styles.logsControls}>
        <div className={styles.blockRangeControls}>
          <label>
            From:
            <input
              type="text"
              value={logsFromBlock}
              onChange={(e) =>
                onLogsFromBlockChange(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder={
                latestBlock
                  ? `${Math.max(0, latestBlock - 10000)}`
                  : "latest-10k"
              }
              className={styles.blockRangeInput}
              title="Leave empty to auto-fetch last 10,000 blocks"
            />
          </label>
          <label>
            To:
            <input
              type="text"
              value={logsToBlock}
              onChange={(e) => onLogsToBlockChange(e.target.value)}
              placeholder="latest"
              className={styles.blockRangeInput}
            />
          </label>
        </div>
        <div className={styles.paginationControls}>
          <label>
            Page:
            <input
              type="number"
              value={logsPage}
              onChange={(e) =>
                onLogsPageChange(Math.max(1, parseInt(e.target.value) || 1))
              }
              min="1"
              className={styles.paginationInput}
            />
          </label>
          <label>
            Per page:
            <select
              value={logsOffset}
              onChange={(e) => onLogsOffsetChange(parseInt(e.target.value))}
              className={styles.paginationSelect}
            >
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </label>
        </div>
        <button
          onClick={onFetchLogs}
          className={styles.fetchLogsButton}
          disabled={fetchingLogs || selectedEvents.length === 0}
          type="button"
        >
          {fetchingLogs
            ? "Fetching..."
            : `Fetch Logs (${selectedEvents.length} selected)`}
        </button>
      </div>

      {logsError && (
        <div className={styles.logsErrorBox}>
          <strong>Error:</strong> {logsError}
        </div>
      )}

      {logsFetched && eventLogs.length === 0 && !logsError && (
        <div className={styles.logsEmptyBox}>
          No logs found in the specified block range.
        </div>
      )}

      {eventLogs.length > 0 && (
        <div className={styles.logsResults}>
          <div className={styles.logsResultsHeader}>
            <span>
              {logsFilter.trim()
                ? `Showing ${filteredLogs.length} of ${eventLogs.length} logs`
                : `Found ${eventLogs.length} logs`}
            </span>
            <div className={styles.logsHeaderActions}>
              <div className={styles.filterInputWrapper}>
                <input
                  type="text"
                  value={logsFilter}
                  onChange={(e) => onLogsFilterChange(e.target.value)}
                  placeholder="event = Transfer and args.to = 0x..."
                  className={styles.logsFilterInput}
                />
                <span className={styles.filterHelpIcon}>
                  ?
                  <div className={styles.filterHelpPopup}>
                    <div className={styles.filterHelpTitle}>Filter Syntax</div>
                    <div className={styles.filterHelpRow}>
                      <span className={styles.filterHelpLabel}>Fields:</span>
                      <code>event</code> <code>args.*</code>{" "}
                      <code>topic0-3</code> <code>data</code> <code>block</code>{" "}
                      <code>tx</code>
                    </div>
                    <div className={styles.filterHelpRow}>
                      <span className={styles.filterHelpLabel}>Operators:</span>
                      <code>=</code> <code>!=</code> <code>&gt;</code>{" "}
                      <code>&lt;</code> <code>contains</code>
                    </div>
                    <div className={styles.filterHelpRow}>
                      <span className={styles.filterHelpLabel}>Boolean:</span>
                      <code>and</code> <code>or</code>
                    </div>
                    <div className={styles.filterHelpExample}>
                      Example: event = Transfer and args.value &gt; 1000
                    </div>
                  </div>
                </span>
              </div>
              <button
                onClick={onDownloadCsv}
                className={styles.downloadCsvButton}
                type="button"
              >
                Download CSV
              </button>
            </div>
          </div>
          <div className={styles.logsTableContainer}>
            <table className={styles.logsTable}>
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Tx Hash</th>
                  <th>Event</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, idx) => (
                  <tr key={idx} className={styles.logRow}>
                    <td className={styles.logBlockCell}>
                      <div className={styles.logBlockNumber}>
                        {parseInt(log.blockNumber, 16)}
                      </div>
                      {log.timeStamp && (
                        <div className={styles.logTimestamp}>
                          {new Date(
                            parseInt(log.timeStamp, 16) * 1000,
                          ).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className={styles.logTxHash}>
                      <a
                        href={`https://etherscan.io/tx/${log.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {log.transactionHash.slice(0, 10)}...
                      </a>
                    </td>
                    <td className={styles.logEventName}>
                      {log.decodedName || "Unknown"}
                    </td>
                    <td className={styles.logDataCell}>
                      {log.decodedArgs ? (
                        <pre className={styles.logDecodedArgs}>
                          {JSON.stringify(
                            log.decodedArgs,
                            (key, value) =>
                              typeof value === "bigint"
                                ? value.toString()
                                : value,
                            2,
                          )}
                        </pre>
                      ) : (
                        <span className={styles.logRawData}>
                          {log.data?.slice(0, 20)}...
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
