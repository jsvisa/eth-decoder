// Transfer(address indexed from, address indexed to, uint256 value)
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// ERC20Transfer(address indexed from, address indexed to, uint256 amount)
export const ERC20_TRANSFER_TOPIC =
  "0xe59fdd36d0d223c0c7d996db7ad796880f45e1936cb0bb7ac102e7082e031487";
// Deposit(address indexed dst, uint256 wad)
export const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
// Withdrawal(address indexed src, uint256 wad)
export const WITHDRAWAL_TOPIC =
  "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";

export const ZERO_ADDR = "0x" + "0".repeat(40);

/**
 * Parse a single log into a token transfer {tokenAddr, from, to, value} or null.
 * Recognises ERC-20 Transfer, ERC20Transfer, WETH Deposit, and WETH Withdrawal
 * by topic0 — never relies on decoded input names.
 */
export function parseTokenTransferLog(log) {
  const topics = log.topics ?? [];
  const topic0 = topics[0];
  const tokenAddr = log.address?.toLowerCase();
  if (!tokenAddr) return null;

  let value;
  try {
    value = BigInt(log.data ?? "0x0");
  } catch {
    return null;
  }

  let from, to;
  if (topic0 === TRANSFER_TOPIC || topic0 === ERC20_TRANSFER_TOPIC) {
    if (topics.length < 3) return null;
    from = ("0x" + topics[1].slice(-40)).toLowerCase();
    to = ("0x" + topics[2].slice(-40)).toLowerCase();
  } else if (topic0 === DEPOSIT_TOPIC) {
    if (topics.length < 2) return null;
    from = ZERO_ADDR;
    to = ("0x" + topics[1].slice(-40)).toLowerCase();
  } else if (topic0 === WITHDRAWAL_TOPIC) {
    if (topics.length < 2) return null;
    from = ("0x" + topics[1].slice(-40)).toLowerCase();
    to = ZERO_ADDR;
  } else {
    return null;
  }

  return { tokenAddr, from, to, value };
}

/**
 * Build an accountMap { address -> { native: null, tokens: { tokenAddr -> BigInt } } }
 * from a list of logs.
 */
export function buildTokenAccountMap(logs) {
  const accountMap = {};

  for (const log of logs ?? []) {
    const transfer = parseTokenTransferLog(log);
    if (!transfer) continue;
    const { tokenAddr, from, to, value } = transfer;

    if (from) {
      if (!accountMap[from]) accountMap[from] = { native: null, tokens: {} };
      accountMap[from].tokens[tokenAddr] =
        (accountMap[from].tokens[tokenAddr] ?? 0n) - value;
    }
    if (to) {
      if (!accountMap[to]) accountMap[to] = { native: null, tokens: {} };
      accountMap[to].tokens[tokenAddr] =
        (accountMap[to].tokens[tokenAddr] ?? 0n) + value;
    }
  }

  return accountMap;
}
