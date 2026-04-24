import { describe, it, expect } from 'vitest'
import { groupFunctions, filterFunctions } from '../../desktop/utils/functionGroup.js'

const ABI = [
  { type: 'function', name: 'balanceOf',   stateMutability: 'view'       },
  { type: 'function', name: 'totalSupply', stateMutability: 'pure'       },
  { type: 'function', name: 'transfer',    stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve',     stateMutability: 'nonpayable' },
  { type: 'function', name: 'deposit',     stateMutability: 'payable'    },
  { type: 'event',    name: 'Transfer'                                    },
]

describe('groupFunctions', () => {
  it('puts view and pure into read group', () => {
    const { read } = groupFunctions(ABI)
    expect(read.map(f => f.name)).toEqual(['balanceOf', 'totalSupply'])
  })
  it('puts nonpayable and payable into write group', () => {
    const { write } = groupFunctions(ABI)
    expect(write.map(f => f.name)).toEqual(['transfer', 'approve', 'deposit'])
  })
  it('ignores events and other non-function items', () => {
    const { read, write } = groupFunctions(ABI)
    expect(read.length + write.length).toBe(5)
  })
})

describe('filterFunctions', () => {
  const fns = [{ name: 'balanceOf' }, { name: 'transfer' }, { name: 'totalSupply' }]
  it('returns all when query is empty', () => {
    expect(filterFunctions(fns, '')).toEqual(fns)
  })
  it('filters case-insensitively', () => {
    expect(filterFunctions(fns, 'BALANCE')).toEqual([{ name: 'balanceOf' }])
  })
  it('returns empty array when no match', () => {
    expect(filterFunctions(fns, 'xyz')).toEqual([])
  })
})
