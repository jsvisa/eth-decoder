"use client";

import { useState, useEffect, useRef } from "react";
import {
  getAddressBook,
  addToAddressBook,
  removeFromAddressBook,
  getBookmarkedAddress,
} from "../../utils/addressBook";
import { isValidEthAddress } from "../../utils/validation";

/**
 * Manages address book state and bookmark modal lifecycle.
 *
 * @param {object} params
 * @param {string} params.address       - The main contract address currently loaded.
 * @param {string} [params.contractName] - The contract name for the main address.
 */
export function useBookmarkModal({ address, contractName } = {}) {
  const [addressBook, setAddressBook] = useState([]);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [bookmarkAddress, setBookmarkAddress] = useState("");
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkNotes, setBookmarkNotes] = useState("");
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressFilter, setAddressFilter] = useState("");

  const labelInputRef = useRef(null);

  // Load address book from localStorage on mount
  useEffect(() => {
    setAddressBook(getAddressBook());
  }, []);

  // Focus label input when bookmark modal opens
  useEffect(() => {
    if (showBookmarkModal && labelInputRef.current) {
      labelInputRef.current.focus();
    }
  }, [showBookmarkModal]);

  // Open bookmark modal for the given address (or main contract address if omitted)
  const openBookmarkModal = (addr) => {
    const targetAddr = addr || address;
    if (!isValidEthAddress(targetAddr)) return;

    const existing = getBookmarkedAddress(targetAddr);
    if (existing) {
      setBookmarkLabel(existing.label || "");
      setBookmarkNotes(existing.notes || "");
    } else {
      // Only use contractName for the main contract (when addr is not provided)
      setBookmarkLabel(addr ? "" : contractName || "");
      setBookmarkNotes("");
    }

    setBookmarkAddress(addr || ""); // empty string means main contract
    setShowBookmarkModal(true);
  };

  // Close the modal without saving
  const closeBookmarkModal = () => {
    setShowBookmarkModal(false);
    setBookmarkAddress("");
  };

  // Save the current bookmark form values
  const saveBookmark = () => {
    const addrToSave = bookmarkAddress || address;
    if (!addrToSave) return;

    const updatedBook = addToAddressBook({
      address: addrToSave,
      label: bookmarkLabel,
      contractName: bookmarkAddress ? "" : contractName || "",
      notes: bookmarkNotes,
    });

    setAddressBook(updatedBook);
    setShowBookmarkModal(false);
    setBookmarkAddress("");
    setBookmarkLabel("");
    setBookmarkNotes("");
  };

  // Remove the bookmarked address (either the one in the modal or the main contract)
  const removeBookmark = () => {
    const addrToRemove = bookmarkAddress || address;
    const existing = getBookmarkedAddress(addrToRemove);
    if (existing) {
      const updatedBook = removeFromAddressBook(existing.id);
      setAddressBook(updatedBook);
    }
    setShowBookmarkModal(false);
    setBookmarkAddress("");
  };

  return {
    addressBook,
    showBookmarkModal,
    bookmarkAddress,
    bookmarkLabel,
    setBookmarkLabel,
    bookmarkNotes,
    setBookmarkNotes,
    openBookmarkModal,
    closeBookmarkModal,
    saveBookmark,
    removeBookmark,
    showAddressSuggestions,
    setShowAddressSuggestions,
    addressFilter,
    setAddressFilter,
    labelInputRef,
  };
}
