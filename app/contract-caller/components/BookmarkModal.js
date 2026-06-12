"use client";

import React from "react";
import styles from "./BookmarkModal.module.css";

export default function BookmarkModal({
  open,
  address,
  label,
  notes,
  onLabelChange,
  onNotesChange,
  onSave,
  onRemove,
  onClose,
}) {
  if (!open) return null;

  return (
    <div
      className={styles.modalOverlay}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      tabIndex={-1}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>
          {label ? "Edit Bookmark" : "Add to Address Book"}
        </h3>
        <div className={styles.modalBody}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Address</label>
            <div className={styles.modalAddress}>{address}</div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="e.g., USDC Token, Uniswap Router..."
              className={styles.modalInput}
            />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Add any notes..."
              className={styles.modalTextarea}
              rows={3}
            />
          </div>
        </div>
        <div className={styles.modalActions}>
          {onRemove && (
            <button
              onClick={onRemove}
              className={styles.modalDeleteButton}
              type="button"
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            className={styles.modalCancelButton}
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className={styles.modalSaveButton}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
