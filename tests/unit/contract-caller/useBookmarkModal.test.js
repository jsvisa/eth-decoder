import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBookmarkModal } from "../../../app/contract-caller/hooks/useBookmarkModal.js";

const VALID_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const VALID_ADDRESS_2 = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

beforeEach(() => {
  localStorage.clear();
});

describe("useBookmarkModal – initial state", () => {
  it("returns empty/false defaults on first render", () => {
    const { result } = renderHook(() =>
      useBookmarkModal({ address: VALID_ADDRESS }),
    );

    expect(result.current.addressBook).toEqual([]);
    expect(result.current.showBookmarkModal).toBe(false);
    expect(result.current.bookmarkAddress).toBe("");
    expect(result.current.bookmarkLabel).toBe("");
    expect(result.current.bookmarkNotes).toBe("");
    expect(result.current.showAddressSuggestions).toBe(false);
    expect(result.current.addressFilter).toBe("");
    expect(result.current.labelInputRef).toBeDefined();
  });

  it("loads pre-existing address book from localStorage on mount", () => {
    localStorage.setItem(
      "address_book",
      JSON.stringify([
        {
          id: 1,
          address: VALID_ADDRESS,
          label: "USDC",
          contractName: "",
          notes: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );

    const { result } = renderHook(() =>
      useBookmarkModal({ address: VALID_ADDRESS }),
    );

    expect(result.current.addressBook).toHaveLength(1);
    expect(result.current.addressBook[0].label).toBe("USDC");
  });
});

describe("useBookmarkModal – happy path: open → save", () => {
  it("opens modal with empty label for a new address and saves it", () => {
    const { result } = renderHook(() =>
      useBookmarkModal({ address: VALID_ADDRESS, contractName: "MyContract" }),
    );

    // Open for the main contract address (no addr arg → uses address param)
    act(() => {
      result.current.openBookmarkModal();
    });

    expect(result.current.showBookmarkModal).toBe(true);
    expect(result.current.bookmarkAddress).toBe(""); // empty = main contract
    // contractName should prefill the label for the main contract
    expect(result.current.bookmarkLabel).toBe("MyContract");

    // Change the label
    act(() => {
      result.current.setBookmarkLabel("USDC Token");
    });

    // Save
    act(() => {
      result.current.saveBookmark();
    });

    expect(result.current.showBookmarkModal).toBe(false);
    expect(result.current.bookmarkLabel).toBe("");
    expect(result.current.bookmarkAddress).toBe("");
    // Address book should now contain one entry
    expect(result.current.addressBook).toHaveLength(1);
    expect(result.current.addressBook[0].label).toBe("USDC Token");
    expect(result.current.addressBook[0].address).toBe(VALID_ADDRESS);
  });

  it("pre-fills label and notes when opening for an already-bookmarked address", () => {
    // Pre-seed localStorage
    localStorage.setItem(
      "address_book",
      JSON.stringify([
        {
          id: 1,
          address: VALID_ADDRESS,
          label: "Existing Label",
          contractName: "",
          notes: "Some notes",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );

    const { result } = renderHook(() =>
      useBookmarkModal({ address: VALID_ADDRESS }),
    );

    act(() => {
      result.current.openBookmarkModal();
    });

    expect(result.current.bookmarkLabel).toBe("Existing Label");
    expect(result.current.bookmarkNotes).toBe("Some notes");
  });

  it("opens modal for an explicit secondary address without using contractName", () => {
    const { result } = renderHook(() =>
      useBookmarkModal({
        address: VALID_ADDRESS,
        contractName: "ShouldNotBeUsed",
      }),
    );

    act(() => {
      result.current.openBookmarkModal(VALID_ADDRESS_2);
    });

    expect(result.current.showBookmarkModal).toBe(true);
    expect(result.current.bookmarkAddress).toBe(VALID_ADDRESS_2);
    expect(result.current.bookmarkLabel).toBe(""); // not the contractName
  });
});

describe("useBookmarkModal – edge cases", () => {
  it("does not open the modal for an invalid address", () => {
    const { result } = renderHook(() =>
      useBookmarkModal({ address: "not-an-address" }),
    );

    act(() => {
      result.current.openBookmarkModal();
    });

    expect(result.current.showBookmarkModal).toBe(false);
  });

  it("does not open the modal when no address is provided at all", () => {
    const { result } = renderHook(() => useBookmarkModal({}));

    act(() => {
      result.current.openBookmarkModal();
    });

    expect(result.current.showBookmarkModal).toBe(false);
  });

  it("closeBookmarkModal resets address and hides modal", () => {
    const { result } = renderHook(() =>
      useBookmarkModal({ address: VALID_ADDRESS }),
    );

    act(() => {
      result.current.openBookmarkModal();
    });
    expect(result.current.showBookmarkModal).toBe(true);

    act(() => {
      result.current.closeBookmarkModal();
    });
    expect(result.current.showBookmarkModal).toBe(false);
    expect(result.current.bookmarkAddress).toBe("");
  });

  it("removeBookmark removes the entry and closes the modal", () => {
    localStorage.setItem(
      "address_book",
      JSON.stringify([
        {
          id: 42,
          address: VALID_ADDRESS,
          label: "To Remove",
          contractName: "",
          notes: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );

    const { result } = renderHook(() =>
      useBookmarkModal({ address: VALID_ADDRESS }),
    );

    act(() => {
      result.current.openBookmarkModal();
    });

    act(() => {
      result.current.removeBookmark();
    });

    expect(result.current.showBookmarkModal).toBe(false);
    expect(result.current.bookmarkAddress).toBe("");
    expect(result.current.addressBook).toHaveLength(0);
  });

  it("saveBookmark does nothing when no address is resolvable", () => {
    const { result } = renderHook(() => useBookmarkModal({}));

    // Manually open by setting internal state is not possible, but we can
    // verify that saveBookmark with no address is a no-op
    act(() => {
      result.current.saveBookmark();
    });

    expect(result.current.addressBook).toHaveLength(0);
  });

  it("setShowAddressSuggestions and setAddressFilter work as plain setters", () => {
    const { result } = renderHook(() =>
      useBookmarkModal({ address: VALID_ADDRESS }),
    );

    act(() => {
      result.current.setShowAddressSuggestions(true);
      result.current.setAddressFilter("0xabc");
    });

    expect(result.current.showAddressSuggestions).toBe(true);
    expect(result.current.addressFilter).toBe("0xabc");
  });
});
