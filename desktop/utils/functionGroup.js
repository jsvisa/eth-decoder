// desktop/utils/functionGroup.js

const READ_MUTABILITIES = new Set(['view', 'pure'])

export function groupFunctions(abi) {
  const read = []
  const write = []
  for (const item of abi) {
    if (item.type !== 'function') continue
    if (READ_MUTABILITIES.has(item.stateMutability)) {
      read.push(item)
    } else {
      write.push(item)
    }
  }
  return { read, write }
}

export function filterFunctions(fns, query) {
  if (!query) return fns
  const q = query.toLowerCase()
  return fns.filter(fn => fn.name.toLowerCase().includes(q))
}
