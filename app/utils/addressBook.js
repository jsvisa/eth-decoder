const STORAGE_KEY = 'address_book'

export const getAddressBook = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (err) {
    console.error('Failed to load address book:', err)
  }
  return []
}

export const saveAddressBook = (addressBook) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addressBook))
    return true
  } catch (err) {
    console.error('Failed to save address book:', err)
    return false
  }
}

export const addToAddressBook = (entry) => {
  const addressBook = getAddressBook()

  // Check if address already exists
  const existingIndex = addressBook.findIndex(
    item => item.address.toLowerCase() === entry.address.toLowerCase()
  )

  if (existingIndex !== -1) {
    // Update existing entry
    addressBook[existingIndex] = {
      ...addressBook[existingIndex],
      ...entry,
      updatedAt: new Date().toISOString(),
    }
  } else {
    // Add new entry
    addressBook.unshift({
      id: Date.now(),
      label: entry.label || '',
      address: entry.address,
      contractName: entry.contractName || '',
      notes: entry.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  saveAddressBook(addressBook)
  return addressBook
}

export const updateAddressBookEntry = (id, updates) => {
  const addressBook = getAddressBook()
  const index = addressBook.findIndex(item => item.id === id)

  if (index !== -1) {
    addressBook[index] = {
      ...addressBook[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    saveAddressBook(addressBook)
  }

  return addressBook
}

export const removeFromAddressBook = (id) => {
  const addressBook = getAddressBook()
  const filtered = addressBook.filter(item => item.id !== id)
  saveAddressBook(filtered)
  return filtered
}

export const isAddressBookmarked = (address) => {
  const addressBook = getAddressBook()
  return addressBook.some(
    item => item.address.toLowerCase() === address.toLowerCase()
  )
}

export const getBookmarkedAddress = (address) => {
  const addressBook = getAddressBook()
  return addressBook.find(
    item => item.address.toLowerCase() === address.toLowerCase()
  )
}

// CSV Export
export const exportToCSV = (addressBook) => {
  const headers = ['label', 'address', 'contractName', 'notes', 'createdAt']
  const csvRows = [headers.join(',')]

  addressBook.forEach(entry => {
    const row = headers.map(header => {
      const value = entry[header] || ''
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      const escaped = String(value).replace(/"/g, '""')
      if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
        return `"${escaped}"`
      }
      return escaped
    })
    csvRows.push(row.join(','))
  })

  return csvRows.join('\n')
}

// CSV Import
export const importFromCSV = (csvContent) => {
  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows')
  }

  const headers = parseCSVLine(lines[0])
  const requiredHeaders = ['address']

  // Validate headers
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`)
  }

  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue

    const entry = {}
    headers.forEach((header, index) => {
      entry[header] = values[index] || ''
    })

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(entry.address)) {
      throw new Error(`Invalid address format at row ${i + 1}: ${entry.address}`)
    }

    entries.push({
      id: Date.now() + i,
      label: entry.label || '',
      address: entry.address,
      contractName: entry.contractName || '',
      notes: entry.notes || '',
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  return entries
}

// Parse a single CSV line handling quoted values
const parseCSVLine = (line) => {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"'
        i++ // Skip next quote
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }

  result.push(current.trim())
  return result
}

// Merge imported entries with existing address book
export const mergeAddressBook = (existingBook, importedEntries, overwrite = false) => {
  const merged = [...existingBook]

  importedEntries.forEach(imported => {
    const existingIndex = merged.findIndex(
      item => item.address.toLowerCase() === imported.address.toLowerCase()
    )

    if (existingIndex !== -1) {
      if (overwrite) {
        merged[existingIndex] = {
          ...merged[existingIndex],
          ...imported,
          id: merged[existingIndex].id, // Keep original ID
          updatedAt: new Date().toISOString(),
        }
      }
      // If not overwrite, skip duplicates
    } else {
      merged.push(imported)
    }
  })

  return merged
}
