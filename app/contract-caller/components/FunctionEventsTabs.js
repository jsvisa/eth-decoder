import React from "react";
import styles from "./FunctionEventsTabs.module.css";

/**
 * Tab bar that switches between Functions and Events tab content.
 *
 * @param {{ activeTab: 'functions'|'events', onTabChange: (t: string) => void, functionsContent: React.ReactNode, eventsContent: React.ReactNode, functionsCount: number, eventsCount: number }} props
 */
export default function FunctionEventsTabs({
  activeTab,
  onTabChange,
  functionsContent,
  eventsContent,
  functionsCount,
  eventsCount,
}) {
  return React.createElement(
    "div",
    { className: styles.tabSection },
    React.createElement(
      "div",
      { className: styles.tabContainer },
      React.createElement(
        "button",
        {
          className: `${styles.tab} ${activeTab === "functions" ? styles.tabActive : ""}`,
          onClick: () => onTabChange("functions"),
        },
        `Functions (${functionsCount})`,
      ),
      React.createElement(
        "button",
        {
          className: `${styles.tab} ${activeTab === "events" ? styles.tabActive : ""}`,
          onClick: () => onTabChange("events"),
        },
        `Events (${eventsCount})`,
      ),
    ),
    activeTab === "functions" ? functionsContent : null,
    activeTab === "events" ? eventsContent : null,
  );
}
