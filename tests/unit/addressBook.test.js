import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAddressBook,
  addToAddressBook,
  removeFromAddressBook,
  exportToCSV,
  importFromCSV,
} from '../../app/utils/addressBook.js'

const VALID_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const VALID_ADDRESS_2 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

beforeEach(() => {
  localStorage.clear()
})

describe('getAddressBook', () => {
  it('returns an empty array when localStorage is empty', () => {
    expect(getAddressBook()).toEqual([])
  })
})

describe('addToAddressBook', () => {
  it('adds a new entry with id, createdAt, updatedAt fields', () => {
    const result = addToAddressBook({ address: VALID_ADDRESS, label: 'USDC' })
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('USDC')
    expect(result[0].address).toBe(VALID_ADDRESS)
    expect(result[0].id).toBeDefined()
    expect(result[0].createdAt).toBeDefined()
    expect(result[0].updatedAt).toBeDefined()
  })

  it('updates the existing entry when the same address is added again (case-insensitive)', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'Old Label' })
    const result = addToAddressBook({
      address: VALID_ADDRESS.toLowerCase(),
      label: 'New Label',
    })
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('New Label')
  })

  it('adds multiple distinct addresses', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'First' })
    const result = addToAddressBook({ address: VALID_ADDRESS_2, label: 'Second' })
    expect(result).toHaveLength(2)
  })
})

describe('removeFromAddressBook', () => {
  it('removes the entry with the matching id', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'USDC' })
    const book = getAddressBook()
    const id = book[0].id
    const result = removeFromAddressBook(id)
    expect(result).toHaveLength(0)
  })

  it('is a no-op when the id does not exist', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'USDC' })
    const result = removeFromAddressBook(999999999)
    expect(result).toHaveLength(1)
  })
})

describe('exportToCSV', () => {
  it('produces the correct header row', () => {
    const csv = exportToCSV([])
    expect(csv.split('\n')[0]).toBe('label,address,contractName,notes,createdAt')
  })

  it('includes entry data in subsequent rows', () => {
    const book = [{
      id: 1,
      label: 'USDC',
      address: VALID_ADDRESS,
      contractName: 'ERC20',
      notes: '',
      createdAt: '2024-01-01T00:00:00.000Z',
    }]
    const csv = exportToCSV(book)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(VALID_ADDRESS)
    expect(lines[1]).toContain('USDC')
  })

  it('wraps values containing commas in double quotes', () => {
    const book = [{
      id: 1,
      label: 'Token, Stable',
      address: VALID_ADDRESS,
      contractName: '',
      notes: '',
      createdAt: '',
    }]
    const csv = exportToCSV(book)
    expect(csv).toContain('"Token, Stable"')
  })
})

describe('importFromCSV', () => {
  it('parses a valid CSV and returns structured entries', () => {
    const csv = `label,address\nUSDC,${VALID_ADDRESS}`
    const entries = importFromCSV(csv)
    expect(entries).toHaveLength(1)
    expect(entries[0].address).toBe(VALID_ADDRESS)
    expect(entries[0].label).toBe('USDC')
    expect(entries[0].id).toBeDefined()
  })

  it('throws for a CSV with an invalid Ethereum address', () => {
    const csv = `label,address\nBad Token,not-an-address`
    expect(() => importFromCSV(csv)).toThrow(/Invalid address format/)
  })

  it('throws for an empty string', () => {
    expect(() => importFromCSV('')).toThrow(/empty/)
  })

  it('throws when the required address column is missing', () => {
    const csv = `label,notes\nUSDC,a stablecoin`
    expect(() => importFromCSV(csv)).toThrow(/Missing required columns/)
  })
})
