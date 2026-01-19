'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './page.module.css'
import {
  getAddressBook,
  saveAddressBook,
  addToAddressBook,
  updateAddressBookEntry,
  removeFromAddressBook,
  exportToCSV,
  importFromCSV,
  mergeAddressBook,
} from '../utils/addressBook'
import { isValidEthAddress } from '../utils/validation'

export default function AddressBook() {
  const [addressBook, setAddressBook] = useState([])
  const [searchFilter, setSearchFilter] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importOverwrite, setImportOverwrite] = useState(false)
  const fileInputRef = useRef(null)
  const editInputRef = useRef(null)
  const addAddressInputRef = useRef(null)

  // Load address book on mount
  useEffect(() => {
    setAddressBook(getAddressBook())
  }, [])

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingId])

  // Focus add address input when modal opens
  useEffect(() => {
    if (showAddModal && addAddressInputRef.current) {
      addAddressInputRef.current.focus()
    }
  }, [showAddModal])

  // Filter addresses
  const filteredAddresses = addressBook.filter(item => {
    if (!searchFilter.trim()) return true
    const search = searchFilter.toLowerCase()
    return (
      item.address.toLowerCase().includes(search) ||
      (item.label && item.label.toLowerCase().includes(search)) ||
      (item.contractName && item.contractName.toLowerCase().includes(search)) ||
      (item.notes && item.notes.toLowerCase().includes(search))
    )
  })

  // Start editing an entry
  const handleEdit = (item) => {
    setEditingId(item.id)
    setEditLabel(item.label || '')
    setEditNotes(item.notes || '')
  }

  // Save edit
  const handleSaveEdit = (id) => {
    const updated = updateAddressBookEntry(id, {
      label: editLabel,
      notes: editNotes,
    })
    setAddressBook(updated)
    setEditingId(null)
    setEditLabel('')
    setEditNotes('')
  }

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditLabel('')
    setEditNotes('')
  }

  // Delete entry
  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to remove this address from your address book?')) {
      return
    }
    const updated = removeFromAddressBook(id)
    setAddressBook(updated)
  }

  // Add new address
  const handleAddAddress = () => {
    setError(null)

    if (!newAddress.trim()) {
      setError('Please enter an address')
      return
    }

    if (!isValidEthAddress(newAddress)) {
      setError('Invalid address format')
      return
    }

    const updated = addToAddressBook({
      address: newAddress,
      label: newLabel,
      notes: newNotes,
    })

    setAddressBook(updated)
    setShowAddModal(false)
    setNewAddress('')
    setNewLabel('')
    setNewNotes('')
    setSuccess('Address added successfully')
    setTimeout(() => setSuccess(null), 3000)
  }

  // Export to CSV
  const handleExport = () => {
    const csv = exportToCSV(addressBook)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `address-book-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setSuccess('Address book exported successfully')
    setTimeout(() => setSuccess(null), 3000)
  }

  // Handle file selection for import
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const csvContent = event.target.result
        const importedEntries = importFromCSV(csvContent)

        if (importedEntries.length === 0) {
          setError('No valid entries found in CSV file')
          return
        }

        const merged = mergeAddressBook(addressBook, importedEntries, importOverwrite)
        saveAddressBook(merged)
        setAddressBook(merged)

        const newCount = merged.length - addressBook.length
        const updatedCount = importOverwrite ? importedEntries.length - newCount : 0

        setShowImportModal(false)
        setSuccess(`Imported ${importedEntries.length} entries (${newCount} new${updatedCount > 0 ? `, ${updatedCount} updated` : ''})`)
        setTimeout(() => setSuccess(null), 5000)
      } catch (err) {
        setError(`Import failed: ${err.message}`)
      }
    }
    reader.readAsText(file)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Copy address to clipboard
  const handleCopyAddress = async (address) => {
    try {
      await navigator.clipboard.writeText(address)
      setSuccess('Address copied to clipboard')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Address Book</h1>
          <div className={styles.headerActions}>
            <button
              onClick={() => setShowAddModal(true)}
              className={styles.addButton}
            >
              + Add Address
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className={styles.importButton}
            >
              Import CSV
            </button>
            <button
              onClick={handleExport}
              className={styles.exportButton}
              disabled={addressBook.length === 0}
            >
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.error}>
            {error}
            <button onClick={() => setError(null)} className={styles.dismissButton}>×</button>
          </div>
        )}

        {success && (
          <div className={styles.success}>
            {success}
            <button onClick={() => setSuccess(null)} className={styles.dismissButton}>×</button>
          </div>
        )}

        <div className={styles.searchRow}>
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search by address, label, or notes..."
            className={styles.searchInput}
          />
          <span className={styles.count}>
            {filteredAddresses.length} of {addressBook.length} addresses
          </span>
        </div>

        {addressBook.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>★</div>
            <h2>No Saved Addresses</h2>
            <p>Add addresses from the Contract Caller or click "Add Address" to get started.</p>
          </div>
        ) : filteredAddresses.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No addresses match your search.</p>
          </div>
        ) : (
          <div className={styles.addressList}>
            {filteredAddresses.map((item) => (
              <div key={item.id} className={styles.addressItem}>
                {editingId === item.id ? (
                  // Edit mode
                  <div className={styles.editForm}>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Label</label>
                      <input
                        type="text"
                        ref={editInputRef}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className={styles.editInput}
                      />
                    </div>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Notes</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className={styles.editTextarea}
                        rows={2}
                      />
                    </div>
                    <div className={styles.editActions}>
                      <button
                        onClick={handleCancelEdit}
                        className={styles.cancelButton}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        className={styles.saveButton}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <>
                    <div className={styles.addressHeader}>
                      <span className={styles.star}>★</span>
                      <span className={styles.label}>
                        {item.label || item.contractName || 'Unnamed'}
                      </span>
                      {item.contractName && item.label && item.label !== item.contractName && (
                        <span className={styles.contractName}>({item.contractName})</span>
                      )}
                    </div>
                    <div
                      className={styles.address}
                      onClick={() => handleCopyAddress(item.address)}
                      title="Click to copy"
                    >
                      {item.address}
                    </div>
                    {item.notes && (
                      <div className={styles.notes}>{item.notes}</div>
                    )}
                    <div className={styles.meta}>
                      <span className={styles.date}>
                        Added {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className={styles.actions}>
                      <a
                        href={`/contract-caller?address=${item.address}`}
                        className={styles.useButton}
                      >
                        Use in Contract Caller
                      </a>
                      <button
                        onClick={() => handleEdit(item)}
                        className={styles.editButton}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className={styles.deleteButton}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Address Modal */}
      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add New Address</h3>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Address *</label>
                <input
                  type="text"
                  ref={addAddressInputRef}
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x..."
                  className={styles.modalInput}
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g., USDC Token, Uniswap Router..."
                  className={styles.modalInput}
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Notes (optional)</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Add any notes..."
                  className={styles.modalTextarea}
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowAddModal(false)}
                className={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={handleAddAddress}
                className={styles.modalSaveButton}
              >
                Add Address
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className={styles.modalOverlay} onClick={() => setShowImportModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Import Addresses from CSV</h3>
            <div className={styles.modalBody}>
              <p className={styles.importInfo}>
                Upload a CSV file with the following columns:
              </p>
              <code className={styles.csvFormat}>
                label, address, contractName, notes
              </code>
              <p className={styles.importNote}>
                The <strong>address</strong> column is required. Other columns are optional.
              </p>
              <div className={styles.modalField}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={importOverwrite}
                    onChange={(e) => setImportOverwrite(e.target.checked)}
                  />
                  Overwrite existing entries with same address
                </label>
              </div>
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className={styles.fileInput}
              />
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowImportModal(false)}
                className={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className={styles.modalSaveButton}
              >
                Select File
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
