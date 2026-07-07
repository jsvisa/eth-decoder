import { formatTokenAmount } from "./tokenFormatting";
import { buildTokenAccountMap } from "./tokenTransfers";

export const NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export const NATIVE_TOKEN_SYMBOLS = {
  ethereum: "ETH",
  arbitrum: "ETH",
  base: "ETH",
  polygon: "MATIC",
  bsc: "BNB",
};

function parseBigInt(value) {
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

function normalizeDecimals(value) {
  const decimals = Number(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return 18;
  return decimals;
}

function normalizePrice(value) {
  if (value == null) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function normalizeSymbol(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimalAmountNumber(rawAmount, decimals) {
  const sign = rawAmount < 0n ? -1 : 1;
  const absValue = rawAmount < 0n ? -rawAmount : rawAmount;
  const digits = absValue.toString();

  if (decimals === 0) {
    const integerValue = Number(digits);
    return Number.isFinite(integerValue) ? sign * integerValue : null;
  }

  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  const decimalValue = Number(
    fraction ? `${whole}.${fraction.slice(0, 18)}` : whole,
  );
  return Number.isFinite(decimalValue) ? sign * decimalValue : null;
}

function signedAmount(rawAmount, decimals) {
  const formatted = formatTokenAmount(rawAmount, decimals);
  if (formatted === null) return null;
  return rawAmount < 0n ? `-${formatted}` : formatted;
}

function usdValue(rawAmount, decimals, price) {
  const normalizedPrice = normalizePrice(price);
  if (normalizedPrice === null) return null;
  const tokenAmount = decimalAmountNumber(rawAmount, decimals);
  return tokenAmount === null ? null : tokenAmount * normalizedPrice;
}

function tokenName(tokenAddress, symbol) {
  if (tokenAddress === NATIVE_TOKEN_ADDRESS) return symbol;
  return symbol || `${tokenAddress.slice(0, 6)}…`;
}

function changeKey(address, tokenAddress) {
  return `${address}:${tokenAddress}`;
}

function enrichNativeChange(change, rawAmount, options) {
  const amount = signedAmount(rawAmount, 18);
  if (amount === null) return null;
  const symbol = normalizeSymbol(options.nativeTokenSymbol) || "ETH";
  const price = normalizePrice(options.tokenPrices[NATIVE_TOKEN_ADDRESS]);
  return {
    ...change,
    address: change.address?.toLowerCase(),
    tokenAddress: NATIVE_TOKEN_ADDRESS,
    symbol,
    name: symbol,
    decimals: 18,
    rawAmount: rawAmount.toString(),
    amount,
    price,
    valueUsd: usdValue(rawAmount, 18, price),
    diff: rawAmount.toString(),
  };
}

function enrichTokenChange(address, tokenAddress, rawAmount, options) {
  const storedChange =
    options.storedTokenChanges[changeKey(address, tokenAddress)];
  const decimals = normalizeDecimals(
    options.tokenDecimals[tokenAddress] ??
      storedChange?.decimals ??
      options.resolveTokenDecimals(tokenAddress) ??
      18,
  );
  const amount = signedAmount(rawAmount, decimals);
  if (amount === null) return null;
  const symbol = normalizeSymbol(
    options.tokenSymbols[tokenAddress] ||
      storedChange?.symbol ||
      storedChange?.name ||
      options.resolveTokenSymbol(tokenAddress),
  );
  const price = options.tokenPrices[tokenAddress] ?? storedChange?.price;
  return {
    ...storedChange,
    address,
    tokenAddress,
    symbol: tokenName(tokenAddress, symbol),
    name: tokenName(tokenAddress, symbol),
    decimals,
    rawAmount: rawAmount.toString(),
    amount,
    price: normalizePrice(price),
    valueUsd: usdValue(rawAmount, decimals, price),
    diff: rawAmount.toString(),
  };
}

function isNativeChange(change) {
  const tokenAddress = change.tokenAddress?.toLowerCase();
  return !tokenAddress || tokenAddress === NATIVE_TOKEN_ADDRESS;
}

function addStoredTokenChange(accountMap, storedTokenChanges, change) {
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
    storedTokenChanges[changeKey(address, tokenAddress)] = change;
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
  nativeTokenSymbol = "ETH",
}) {
  const accountMap = buildTokenAccountMap(Array.isArray(logs) ? logs : []);
  const nativeChanges = {};
  const storedTokenChanges = {};

  for (const change of Array.isArray(balanceChanges) ? balanceChanges : []) {
    const address = change.address?.toLowerCase();
    if (!address) continue;

    if (!isNativeChange(change)) {
      addStoredTokenChange(accountMap, storedTokenChanges, change);
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
    nativeTokenSymbol,
    storedTokenChanges,
  };
  const rows = [];
  for (const [address, data] of Object.entries(accountMap)) {
    if (data.native != null) {
      const nativeRow = enrichNativeChange(
        nativeChanges[address] ?? { address },
        data.native,
        options,
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
