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
          diff: "-1000000000000000000",
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
        diff: "-1000000000000000000",
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        symbol: "ETH",
        name: "ETH",
        decimals: 18,
        rawAmount: "-1000000000000000000",
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
        rawAmount: "-1000000000",
        amount: "-1,000",
        price: 1,
        valueUsd: -1000,
        diff: "-1000000000",
      },
      {
        address: TO,
        tokenAddress: TOKEN,
        symbol: "USDC",
        name: "USDC",
        decimals: 6,
        rawAmount: "1000000000",
        amount: "1,000",
        price: 1,
        valueUsd: 1000,
        diff: "1000000000",
      },
    ]);
  });
});
