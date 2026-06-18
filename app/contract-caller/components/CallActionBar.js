"use client";

import React from "react";
import styles from "./CallActionBar.module.css";

/**
 * CallActionBar — primary action buttons for contract call/simulate,
 * plus Copy Calldata, Share URL, session banner, and sim progress bar.
 *
 * Props:
 *   selectedFunction   {string}       – disable when none picked
 *   isWrite            {boolean}      – show simulate vs call label
 *   loading            {boolean}      – in-flight state
 *   useLocalSimulation {boolean}      – show L vs T mode label
 *   simProgress        {number|null}  – 0–100 percent, or null when idle
 *   sessionActive      {boolean}      – session banner visible
 *   sessionBlock       {number|null}  – session block label
 *   sessionStarting    {boolean}      – starting spinner
 *   onCall             {() => void}   – trigger call/simulate
 *   onCancel           {() => void}   – cancel in-flight local sim
 *   onCopyCalldata     {() => void}   – encode and copy calldata
 *   onShareUrl         {() => void}   – copy shareable URL
 *   onStartSession     {() => void}   – start tevm session
 *   onResetSession     {() => void}   – end and persist session
 *   calldataCopied     {boolean}      – show 'copied' feedback
 *   urlCopied          {boolean}      – show 'copied' feedback
 *   activeTab          {string}       – hide buttons on Events tab
 */
export default function CallActionBar({
  selectedFunction,
  isWrite,
  loading,
  useLocalSimulation,
  simProgress,
  sessionActive,
  sessionBlock,
  sessionStarting,
  onCall,
  onCancel,
  onCopyCalldata,
  onShareUrl,
  onStartSession,
  onResetSession,
  calldataCopied,
  urlCopied,
  activeTab,
}) {
  // Build session banner content
  const sessionBannerContent = sessionActive
    ? React.createElement(
        React.Fragment,
        null,
        React.createElement("span", { className: styles.sessionActiveDot }),
        React.createElement(
          "span",
          { className: styles.sessionBannerText },
          "Session active  ·  Block: ",
          sessionBlock,
        ),
        React.createElement(
          "button",
          { className: styles.sessionResetBtn, onClick: onResetSession },
          "Reset",
        ),
      )
    : React.createElement(
        "button",
        {
          className: styles.sessionStartBtn,
          onClick: onStartSession,
          disabled: sessionStarting || loading,
        },
        sessionStarting ? "Starting..." : "Start Session",
      );

  // Build call button label
  let callButtonLabel;
  if (loading) {
    callButtonLabel = isWrite ? "Simulating..." : "Calling...";
  } else if (isWrite) {
    callButtonLabel = React.createElement(
      React.Fragment,
      null,
      sessionActive ? "Execute in Session" : "Simulate Call",
      " ",
      React.createElement(
        "span",
        { className: styles.simModeTag },
        useLocalSimulation ? "L" : "T",
      ),
    );
  } else {
    callButtonLabel = "Call Contract";
  }

  const callButtonClass = isWrite
    ? `${styles.button} ${styles.simulateButton}`
    : styles.button;
  const showCancel = simProgress !== null || (loading && isWrite);

  return React.createElement(
    React.Fragment,
    null,

    // Session mode banner — only shown in local simulation mode
    useLocalSimulation &&
      React.createElement(
        "div",
        { className: styles.sessionBanner },
        sessionBannerContent,
      ),

    // Action buttons — only shown on the functions tab
    activeTab === "functions" &&
      React.createElement(
        "div",
        { className: styles.buttonGroup },

        // Primary call/simulate button
        React.createElement(
          "button",
          {
            onClick: onCall,
            className: callButtonClass,
            disabled: loading || !selectedFunction || sessionStarting,
          },
          callButtonLabel,
        ),

        showCancel &&
          React.createElement(
            "button",
            {
              type: "button",
              className: styles.cancelSimBtn,
              onClick: onCancel,
            },
            "Cancel",
          ),

        // Copy Calldata + Share URL — only when a function is selected
        selectedFunction &&
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "button",
              {
                onClick: onCopyCalldata,
                className: styles.calldataButton,
                disabled: loading,
                type: "button",
              },
              calldataCopied ? "Copied!" : "Copy Calldata",
            ),
            React.createElement(
              "button",
              {
                onClick: onShareUrl,
                className: styles.shareButton,
                disabled: loading,
                type: "button",
              },
              urlCopied ? "Copied!" : "Share URL",
            ),
          ),
      ),

    // Progress bar — only visible while local sim is running
    simProgress !== null &&
      React.createElement(
        "div",
        { className: styles.simProgressWrapper },
        React.createElement(
          "div",
          { className: styles.simProgressBar },
          React.createElement("div", {
            className: styles.simProgressFill,
            style: { width: `${simProgress}%` },
          }),
        ),
        React.createElement(
          "span",
          { className: styles.simProgressLabel },
          simProgress < 100 ? `Simulating… ${simProgress}%` : "Finalizing…",
        ),
      ),
  );
}
