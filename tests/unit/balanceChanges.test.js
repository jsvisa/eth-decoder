import { describe, expect, it } from "vitest";
import {
  NATIVE_TOKEN_ADDRESS,
  enrichBalanceChanges,
} from "../../app/utils/balanceChanges.js";
import { TRANSFER_TOPIC } from "../../app/utils/tokenTransfers.js";

const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const FROM = "0xb826224b742ead5cf91ea432340e3763fac09cdd";
const TO = "0xdeadbeef00000000000000000000000000000001";

const padAddress = (address) => `0x${address.slice(2).padStart(64, "0")}`;
const encodeUint256 = (value) =>
  `0x${BigInt(value).toString(16).padStart(64, "0")}`;

describe("enrichBalanceChanges", () => {
  it("stores native and token balance changes with amount, name, price, and USD value", () => {
    const rows = enrichBalanceChanges({
      logs: [
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, padAddress(FROM), padAddress(TO)],
          data: encodeUint256("1000000000"),
        },
      ],
      balanceChanges: [
        {
          address: FROM,
          before: "10000000000000000000",
          after: "9000000000000000000",
          value: "-1000000000000000000",
        },
      ],
      tokenSymbols: { [TOKEN]: "USDC" },
      tokenDecimals: { [TOKEN]: 6 },
      tokenPrices: {
        [NATIVE_TOKEN_ADDRESS]: 2500,
        [TOKEN]: 1,
      },
    });

    expect(rows).toEqual([
      {
        address: FROM,
        before: "10000000000000000000",
        after: "9000000000000000000",
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        symbol: "ETH",
        name: "ETH",
        decimals: 18,
        value: "-1000000000000000000",
        amount: "-1",
        price: 2500,
        valueUsd: -2500,
      },
      {
        address: FROM,
        tokenAddress: TOKEN,
        symbol: "USDC",
        name: "USDC",
        decimals: 6,
        value: "-1000000000",
        amount: "-1,000",
        price: 1,
        valueUsd: -1000,
      },
      {
        address: TO,
        tokenAddress: TOKEN,
        symbol: "USDC",
        name: "USDC",
        decimals: 6,
        value: "1000000000",
        amount: "1,000",
        price: 1,
        valueUsd: 1000,
      },
    ]);
  });

  it("uses the selected chain native token symbol", () => {
    const rows = enrichBalanceChanges({
      balanceChanges: [
        {
          address: FROM,
          value: "-1000000000000000000",
        },
      ],
      nativeTokenSymbol: "MATIC",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        address: FROM,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        symbol: "MATIC",
        name: "MATIC",
        amount: "-1",
      }),
    ]);
  });

  it("normalizes malformed metadata without throwing", () => {
    const rows = enrichBalanceChanges({
      logs: [
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, padAddress(FROM), padAddress(TO)],
          data: encodeUint256("1000000000"),
        },
      ],
      balanceChanges: "not-an-array",
      tokenSymbols: { [TOKEN]: 123 },
      tokenDecimals: { [TOKEN]: "bad-decimals" },
      tokenPrices: { [TOKEN]: "bad-price" },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        address: FROM,
        tokenAddress: TOKEN,
        symbol: "0xa0b8…",
        name: "0xa0b8…",
        decimals: 18,
        price: null,
        valueUsd: null,
      }),
      expect.objectContaining({
        address: TO,
        tokenAddress: TOKEN,
        symbol: "0xa0b8…",
        name: "0xa0b8…",
        decimals: 18,
        price: null,
        valueUsd: null,
      }),
    ]);
  });

  it("preserves metadata from stored enriched token rows without side metadata", () => {
    const rows = enrichBalanceChanges({
      balanceChanges: [
        {
          address: FROM,
          tokenAddress: TOKEN,
          symbol: "USDC",
          name: "USDC",
          decimals: 6,
          value: "-1000000000",
          price: 1,
          valueUsd: -1000,
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        address: FROM,
        tokenAddress: TOKEN,
        symbol: "USDC",
        name: "USDC",
        decimals: 6,
        value: "-1000000000",
        amount: "-1,000",
        price: 1,
        valueUsd: -1000,
      }),
    ]);
  });
});
