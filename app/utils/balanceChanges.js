import { formatTokenAmount } from "./tokenFormatting";
import { buildTokenAccountMap } from "./tokenTransfers";

export const NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000";

function parseBigInt(value) {
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

function signedAmount(rawAmount, decimals) {
  const formatted = formatTokenAmount(rawAmount, decimals);
  if (formatted === null) return null;
  return rawAmount < 0n ? `-${formatted}` : formatted;
}

function usdValue(rawAmount, decimals, price) {
  if (price == null) return null;
  return (Number(rawAmount) / 10 ** decimals) * price;
}

function tokenName(tokenAddress, symbol) {
  if (tokenAddress === NATIVE_TOKEN_ADDRESS) return "ETH";
  return symbol || `${tokenAddress.slice(0, 6)}…`;
}

function enrichNativeChange(change, rawAmount, price) {
  const amount = signedAmount(rawAmount, 18);
  if (amount === null) return null;
  return {
    ...change,
    address: change.address?.toLowerCase(),
    tokenAddress: NATIVE_TOKEN_ADDRESS,
    symbol: "ETH",
    name: "ETH",
    decimals: 18,
    rawAmount: rawAmount.toString(),
    amount,
    price: price ?? null,
    valueUsd: usdValue(rawAmount, 18, price),
    diff: rawAmount.toString(),
  };
}

function enrichTokenChange(address, tokenAddress, rawAmount, options) {
  const decimals =
    options.tokenDecimals[tokenAddress] ??
    options.resolveTokenDecimals(tokenAddress) ??
    18;
  const amount = signedAmount(rawAmount, decimals);
  if (amount === null) return null;
  const symbol =
    options.tokenSymbols[tokenAddress] ||
    options.resolveTokenSymbol(tokenAddress) ||
    null;
  const price = options.tokenPrices[tokenAddress];
  return {
    address,
    tokenAddress,
    symbol: tokenName(tokenAddress, symbol),
    name: tokenName(tokenAddress, symbol),
    decimals,
    rawAmount: rawAmount.toString(),
    amount,
    price: price ?? null,
    valueUsd: usdValue(rawAmount, decimals, price),
    diff: rawAmount.toString(),
  };
}

function isNativeChange(change) {
  const tokenAddress = change.tokenAddress?.toLowerCase();
  return !tokenAddress || tokenAddress === NATIVE_TOKEN_ADDRESS;
}

function addStoredTokenChange(accountMap, change) {
  const address = change.address?.toLowerCase();
  const tokenAddress = change.tokenAddress?.toLowerCase();
  if (!address || !tokenAddress || tokenAddress === NATIVE_TOKEN_ADDRESS) {
    return;
  }
  const rawAmount = parseBigInt(change.rawAmount ?? change.diff);
  if (rawAmount === null || rawAmount === 0n) return;
  if (!accountMap[address]) accountMap[address] = { native: null, tokens: {} };
  if (accountMap[address].tokens[tokenAddress] == null) {
    accountMap[address].tokens[tokenAddress] = rawAmount;
  }
}

export function enrichBalanceChanges({
  logs = [],
  balanceChanges = [],
  tokenSymbols = {},
  tokenDecimals = {},
  tokenPrices = {},
  resolveTokenSymbol = () => null,
  resolveTokenDecimals = () => null,
}) {
  const accountMap = buildTokenAccountMap(logs);
  const nativeChanges = {};

  for (const change of balanceChanges ?? []) {
    const address = change.address?.toLowerCase();
    if (!address) continue;

    if (!isNativeChange(change)) {
      addStoredTokenChange(accountMap, change);
      continue;
    }

    const rawAmount = parseBigInt(change.diff ?? change.rawAmount);
    if (rawAmount === null || rawAmount === 0n) continue;
    if (!accountMap[address])
      accountMap[address] = { native: null, tokens: {} };
    accountMap[address].native = rawAmount;
    nativeChanges[address] = { ...change, address };
  }

  const options = {
    tokenSymbols,
    tokenDecimals,
    tokenPrices,
    resolveTokenSymbol,
    resolveTokenDecimals,
  };
  const rows = [];
  for (const [address, data] of Object.entries(accountMap)) {
    if (data.native != null) {
      const nativeRow = enrichNativeChange(
        nativeChanges[address] ?? { address },
        data.native,
        tokenPrices[NATIVE_TOKEN_ADDRESS],
      );
      if (nativeRow) rows.push(nativeRow);
    }

    for (const [tokenAddress, rawAmount] of Object.entries(data.tokens)) {
      if (rawAmount === 0n) continue;
      const tokenRow = enrichTokenChange(
        address,
        tokenAddress,
        rawAmount,
        options,
      );
      if (tokenRow) rows.push(tokenRow);
    }
  }

  return rows;
}
