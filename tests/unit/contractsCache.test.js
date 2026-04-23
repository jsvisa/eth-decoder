import { describe, it, expect, beforeEach } from 'vitest'
import {
  ABI_CACHE_PREFIX,
  parseCSVLine,
  escapeCSVField,
  exportContractsToCSV,
  importContractsFromCSV,
} from '../../app/utils/contractsCache.js'

const ADDR_1 = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ADDR_2 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const SAMPLE_ABI = [
  { type: 'function', name: 'transfer', inputs: [], outputs: [] },
  { type: 'event', name: 'Transfer', inputs: [] },
]

// Helper: build a minimal contract entry as getCachedContracts would return it
const makeContract = (overrides = {}) => ({
  key: `${ABI_CACHE_PREFIX}ethereum-${ADDR_1}`,
  chain: 'ethereum',
  address: ADDR_1,
  contractName: 'TestToken',
  implContractName: null,
  implAddress: null,
  isProxy: false,
  timestamp: 1700000000000,
  functionCount: 1,
  eventCount: 1,
  ...overrides,
})

// Helper: seed localStorage with the full cached entry (including ABI)
const seedLocalStorage = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data))
}

beforeEach(() => {
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// parseCSVLine
// ---------------------------------------------------------------------------

describe('parseCSVLine', () => {
  it('splits a plain unquoted line', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('handles a quoted field containing a comma', () => {
    expect(parseCSVLine('"hello, world",b')).toEqual(['hello, world', 'b'])
  })

  it('handles escaped double-quotes inside a quoted field', () => {
    expect(parseCSVLine('"say ""hi""",b')).toEqual(['say "hi"', 'b'])
  })

  it('returns a single-element array for a line with no commas', () => {
    expect(parseCSVLine('onlyone')).toEqual(['onlyone'])
  })

  it('preserves empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c'])
  })

  it('parses a JSON array stored as a quoted CSV field', () => {
    const json = JSON.stringify(SAMPLE_ABI)
    const line = `ethereum,${ADDR_1},"${json.replace(/"/g, '""')}"`
    const result = parseCSVLine(line)
    expect(result).toHaveLength(3)
    expect(JSON.parse(result[2])).toEqual(SAMPLE_ABI)
  })
})

// ---------------------------------------------------------------------------
// escapeCSVField
// ---------------------------------------------------------------------------

describe('escapeCSVField', () => {
  it('returns the value unchanged when no special characters are present', () => {
    expect(escapeCSVField('simple')).toBe('simple')
  })

  it('wraps a value containing a comma in double quotes', () => {
    expect(escapeCSVField('hello, world')).toBe('"hello, world"')
  })

  it('escapes internal double quotes as ""', () => {
    expect(escapeCSVField('say "hi"')).toBe('"say ""hi"""')
  })

  it('wraps a value containing a newline', () => {
    expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('converts null/undefined to an empty string', () => {
    expect(escapeCSVField(null)).toBe('')
    expect(escapeCSVField(undefined)).toBe('')
  })

  it('converts numbers to strings', () => {
    expect(escapeCSVField(42)).toBe('42')
  })
})

// ---------------------------------------------------------------------------
// exportContractsToCSV
// ---------------------------------------------------------------------------

describe('exportContractsToCSV', () => {
  it('produces the correct header row', () => {
    const csv = exportContractsToCSV([])
    const header = csv.split('\n')[0]
    expect(header).toBe('chain,address,contractName,implContractName,implAddress,isProxy,timestamp,abi')
  })

  it('returns only the header row when given an empty list', () => {
    const csv = exportContractsToCSV([])
    expect(csv.split('\n')).toHaveLength(1)
  })

  it('includes one data row per contract', () => {
    const c1 = makeContract()
    const c2 = makeContract({ key: `${ABI_CACHE_PREFIX}ethereum-${ADDR_2}`, address: ADDR_2 })
    seedLocalStorage(c1.key, { abi: SAMPLE_ABI })
    seedLocalStorage(c2.key, { abi: [] })
    const csv = exportContractsToCSV([c1, c2])
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('embeds chain and address in the data row', () => {
    const c = makeContract()
    seedLocalStorage(c.key, { abi: [] })
    const csv = exportContractsToCSV([c])
    const dataRow = csv.split('\n')[1]
    expect(dataRow).toContain('ethereum')
    expect(dataRow).toContain(ADDR_1)
  })

  it('serialises the ABI from localStorage as compact JSON in the abi column', () => {
    const c = makeContract()
    seedLocalStorage(c.key, { abi: SAMPLE_ABI })
    const csv = exportContractsToCSV([c])
    // The ABI column is the last field; it should be quoted because it contains commas/quotes
    expect(csv).toContain(JSON.stringify(SAMPLE_ABI).replace(/"/g, '""'))
  })

  it('exports isProxy as "true" / "false" strings', () => {
    const c = makeContract({ isProxy: true, implContractName: 'Impl', implAddress: ADDR_2 })
    seedLocalStorage(c.key, { abi: [] })
    const csv = exportContractsToCSV([c])
    const row = csv.split('\n')[1]
    expect(row).toContain('true')
  })

  it('uses an empty ABI array when the localStorage entry has no abi field', () => {
    const c = makeContract()
    seedLocalStorage(c.key, { contractName: 'NoAbi' })
    const csv = exportContractsToCSV([c])
    expect(csv).toContain('[]')
  })

  it('gracefully handles a missing localStorage entry', () => {
    const c = makeContract() // nothing seeded for this key
    const csv = exportContractsToCSV([c])
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('[]')
  })
})

// ---------------------------------------------------------------------------
// importContractsFromCSV
// ---------------------------------------------------------------------------

describe('importContractsFromCSV', () => {
  it('returns an empty array when given fewer than two lines', () => {
    expect(importContractsFromCSV('')).toEqual([])
    expect(importContractsFromCSV('chain,address')).toEqual([])
  })

  it('parses a minimal CSV with only chain and address columns', () => {
    const csv = `chain,address\nethereum,${ADDR_1}`
    const result = importContractsFromCSV(csv)
    expect(result).toHaveLength(1)
    expect(result[0].chain).toBe('ethereum')
    expect(result[0].address).toBe(ADDR_1)
  })

  it('builds the correct localStorage key for built-in chains', () => {
    const csv = `chain,address\nethereum,${ADDR_1}`
    const [entry] = importContractsFromCSV(csv)
    expect(entry.key).toBe(`abi-ethereum-${ADDR_1}`)
  })

  it('builds the correct localStorage key for custom chains', () => {
    const csv = `chain,address\nchain-42161,${ADDR_1}`
    const [entry] = importContractsFromCSV(csv)
    expect(entry.key).toBe(`abi-chain-42161-${ADDR_1}`)
  })

  it('parses all optional metadata columns', () => {
    const csv = [
      'chain,address,contractName,implContractName,implAddress,isProxy,timestamp',
      `ethereum,${ADDR_1},TokenProxy,TokenImpl,${ADDR_2},true,1700000000000`,
    ].join('\n')
    const [entry] = importContractsFromCSV(csv)
    expect(entry.data.contractName).toBe('TokenProxy')
    expect(entry.data.implContractName).toBe('TokenImpl')
    expect(entry.data.implAddress).toBe(ADDR_2)
    expect(entry.data.isProxy).toBe(true)
    expect(entry.data.timestamp).toBe(1700000000000)
  })

  it('parses isProxy=false correctly', () => {
    const csv = `chain,address,isProxy\nethereum,${ADDR_1},false`
    const [entry] = importContractsFromCSV(csv)
    expect(entry.data.isProxy).toBe(false)
  })

  it('parses a JSON ABI column and stores it in data.abi', () => {
    const abiJson = JSON.stringify(SAMPLE_ABI)
    // escapeCSVField would wrap this in quotes with internal quotes doubled
    const escapedAbi = '"' + abiJson.replace(/"/g, '""') + '"'
    const csv = `chain,address,abi\nethereum,${ADDR_1},${escapedAbi}`
    const [entry] = importContractsFromCSV(csv)
    expect(entry.data.abi).toEqual(SAMPLE_ABI)
  })

  it('defaults data.abi to [] when the abi column is absent', () => {
    const csv = `chain,address\nethereum,${ADDR_1}`
    const [entry] = importContractsFromCSV(csv)
    expect(entry.data.abi).toEqual([])
  })

  it('defaults data.abi to [] when the abi column contains invalid JSON', () => {
    const csv = `chain,address,abi\nethereum,${ADDR_1},not-valid-json`
    const [entry] = importContractsFromCSV(csv)
    expect(entry.data.abi).toEqual([])
  })

  it('skips rows that are missing both chain and address', () => {
    const csv = `chain,address\n,\nethereum,${ADDR_1}`
    const result = importContractsFromCSV(csv)
    expect(result).toHaveLength(1)
  })

  it('handles CRLF line endings', () => {
    const csv = `chain,address\r\nethereum,${ADDR_1}`
    const result = importContractsFromCSV(csv)
    expect(result).toHaveLength(1)
    expect(result[0].address).toBe(ADDR_1)
  })

  it('is case-insensitive for column headers', () => {
    const csv = `Chain,Address,ContractName\nethereum,${ADDR_1},MyToken`
    const [entry] = importContractsFromCSV(csv)
    expect(entry.chain).toBe('ethereum')
    expect(entry.data.contractName).toBe('MyToken')
  })

  it('round-trips: importContractsFromCSV(exportContractsToCSV(x)) restores the original data', () => {
    const contract = makeContract()
    seedLocalStorage(contract.key, { abi: SAMPLE_ABI, contractName: 'TestToken', isProxy: false, timestamp: 1700000000000 })

    const csv = exportContractsToCSV([contract])
    const [imported] = importContractsFromCSV(csv)

    expect(imported.chain).toBe(contract.chain)
    expect(imported.address).toBe(contract.address)
    expect(imported.data.contractName).toBe('TestToken')
    expect(imported.data.abi).toEqual(SAMPLE_ABI)
    expect(imported.data.isProxy).toBe(false)
    expect(imported.data.timestamp).toBe(1700000000000)
  })
})
