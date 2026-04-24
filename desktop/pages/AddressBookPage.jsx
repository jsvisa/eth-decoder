// desktop/pages/AddressBookPage.jsx
import { useState, useMemo } from 'react'
import {
  getAddressBook, addToAddressBook, updateAddressBookEntry,
  removeFromAddressBook, exportToCSV, importFromCSV, mergeAddressBook, saveAddressBook,
} from '@app/utils/addressBook'
import styles from './AddressBookPage.module.css'

export default function AddressBookPage() {
  const [entries, setEntries] = useState(getAddressBook)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')

  const filtered = useMemo(() => {
    if (!query) return entries
    const q = query.toLowerCase()
    return entries.filter(e =>
      e.address?.toLowerCase().includes(q) || e.label?.toLowerCase().includes(q)
    )
  }, [entries, query])

  function refresh() { setEntries(getAddressBook()) }

  function handleAdd() {
    const label = prompt('Label:')
    const address = prompt('Address (0x…):')
    if (label && address) { addToAddressBook({ label, address }); refresh() }
  }

  function commitEdit(id) {
    updateAddressBookEntry(id, { label: editLabel })
    setEditingId(null)
    refresh()
  }

  function handleDelete(id) {
    removeFromAddressBook(id)
    refresh()
  }

  function handleExport() {
    const csv = exportToCSV(entries)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'address-book.csv'
    a.click()
  }

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async () => {
      const text = await input.files[0].text()
      const imported = importFromCSV(text)
      const merged = mergeAddressBook(entries, imported, false)
      saveAddressBook(merged)
      refresh()
    }
    input.click()
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Address Book</span>
        <div className={styles.spacer} />
        <input
          className={styles.search}
          placeholder="Search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button className={styles.tbarBtn} onClick={handleAdd}>+ Add</button>
        <button className={styles.tbarBtn} onClick={handleImport}>Import CSV</button>
        <button className={styles.tbarBtn} onClick={handleExport}>Export CSV</button>
      </div>

      <div className={styles.content}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {entries.length === 0 ? 'No saved addresses yet' : `No results for "${query}"`}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Label</th><th>Address</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td onDoubleClick={() => { setEditingId(e.id); setEditLabel(e.label) }}>
                    {editingId === e.id ? (
                      <input
                        autoFocus
                        className={styles.editInput}
                        value={editLabel}
                        onChange={ev => setEditLabel(ev.target.value)}
                        onBlur={() => commitEdit(e.id)}
                        onKeyDown={ev => {
                          if (ev.key === 'Enter') commitEdit(e.id)
                          if (ev.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (e.label || '—')}
                  </td>
                  <td><span className={styles.mono}>{e.address}</span></td>
                  <td>
                    <button className={styles.actionBtn} onClick={() => navigator.clipboard.writeText(e.address)}>Copy</button>
                    <button className={styles.actionBtn} onClick={() => handleDelete(e.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
