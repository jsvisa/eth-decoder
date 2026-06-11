import { describe, it, expect } from "vitest";
import {
  parseTokenTransferLog,
  buildTokenAccountMap,
  TRANSFER_TOPIC,
  ERC20_TRANSFER_TOPIC,
  DEPOSIT_TOPIC,
  WITHDRAWAL_TOPIC,
  ZERO_ADDR,
} from "../../app/utils/tokenTransfers";

const TOKEN = "0x29ee6138dd4c9815f46d34a4a1ed48f46758a402";
const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

// Pad an address to a 32-byte topic (66 hex chars with 0x)
const padAddr = (addr) => "0x" + addr.slice(2).padStart(64, "0");

describe("parseTokenTransferLog", () => {
  it("parses a standard ERC-20 Transfer log", () => {
    const log = {
      address: TOKEN,
      topics: [TRANSFER_TOPIC, padAddr(ADDR_A), padAddr(ADDR_B)],
      data: "0x0000000000000000000000000000000000000000000000000000000893883ff8",
    };
    const result = parseTokenTransferLog(log);
    expect(result).toEqual({
      tokenAddr: TOKEN,
      from: ADDR_A,
      to: ADDR_B,
      value: 36834918392n,
    });
  });

  it("parses an ERC20Transfer log (alternate topic)", () => {
    const log = {
      address: TOKEN,
      topics: [ERC20_TRANSFER_TOPIC, padAddr(ADDR_A), padAddr(ADDR_B)],
      data: "0x0000000000000000000000000000000000000000000000000000000000000064",
    };
    const result = parseTokenTransferLog(log);
    expect(result).toEqual({
      tokenAddr: TOKEN,
      from: ADDR_A,
      to: ADDR_B,
      value: 100n,
    });
  });

  it("parses a Deposit log (from = zero address)", () => {
    const log = {
      address: TOKEN,
      topics: [DEPOSIT_TOPIC, padAddr(ADDR_B)],
      data: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
    };
    const result = parseTokenTransferLog(log);
    expect(result).toEqual({
      tokenAddr: TOKEN,
      from: ZERO_ADDR,
      to: ADDR_B,
      value: 1000000000000000000n,
    });
  });

  it("parses a Withdrawal log (to = zero address)", () => {
    const log = {
      address: TOKEN,
      topics: [WITHDRAWAL_TOPIC, padAddr(ADDR_A)],
      data: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
    };
    const result = parseTokenTransferLog(log);
    expect(result).toEqual({
      tokenAddr: TOKEN,
      from: ADDR_A,
      to: ZERO_ADDR,
      value: 1000000000000000000n,
    });
  });

  it("works with non-standard input names (fromAddress/toAddress)", () => {
    // Decoded input names are ignored — only topics matter
    const log = {
      address: TOKEN,
      topics: [TRANSFER_TOPIC, padAddr(ADDR_A), padAddr(ADDR_B)],
      data: "0x0000000000000000000000000000000000000000000000000000000000000001",
      name: "Transfer",
      inputs: [
        { name: "fromAddress", value: "0x1111111111111111111111111111111111111111" },
        { name: "toAddress", value: "0x2222222222222222222222222222222222222222" },
        { name: "value", value: "999" },
      ],
    };
    const result = parseTokenTransferLog(log);
    expect(result.from).toBe(ADDR_A);
    expect(result.to).toBe(ADDR_B);
    expect(result.value).toBe(1n);
  });

  it("returns null for an unrelated log topic", () => {
    const log = {
      address: TOKEN,
      topics: ["0x91b01baeee3a24b590d112613814d86801005c7ef9353e7fc1eaeaf33ccf83b0"],
      data: "0x",
    };
    expect(parseTokenTransferLog(log)).toBeNull();
  });

  it("returns null for Transfer with fewer than 3 topics", () => {
    const log = {
      address: TOKEN,
      topics: [TRANSFER_TOPIC, padAddr(ADDR_A)],
      data: "0x0000000000000000000000000000000000000000000000000000000000000001",
    };
    expect(parseTokenTransferLog(log)).toBeNull();
  });

  it("returns null for Deposit with fewer than 2 topics", () => {
    const log = {
      address: TOKEN,
      topics: [DEPOSIT_TOPIC],
      data: "0x0000000000000000000000000000000000000000000000000000000000000001",
    };
    expect(parseTokenTransferLog(log)).toBeNull();
  });

  it("returns null when address is missing", () => {
    const log = {
      topics: [TRANSFER_TOPIC, padAddr(ADDR_A), padAddr(ADDR_B)],
      data: "0x01",
    };
    expect(parseTokenTransferLog(log)).toBeNull();
  });
});

describe("buildTokenAccountMap", () => {
  it("nets debits and credits for same token across multiple transfers", () => {
    const logs = [
      {
        address: TOKEN,
        topics: [TRANSFER_TOPIC, padAddr(ADDR_A), padAddr(ADDR_B)],
        data: "0x0000000000000000000000000000000000000000000000000000000000000064", // 100
      },
      {
        address: TOKEN,
        topics: [TRANSFER_TOPIC, padAddr(ADDR_B), padAddr(ADDR_A)],
        data: "0x000000000000000000000000000000000000000000000000000000000000001e", // 30
      },
    ];
    const map = buildTokenAccountMap(logs);
    // ADDR_A: sent 100, received 30 → net -70
    expect(map[ADDR_A].tokens[TOKEN]).toBe(-70n);
    // ADDR_B: received 100, sent 30 → net +70
    expect(map[ADDR_B].tokens[TOKEN]).toBe(70n);
  });

  it("handles Deposit and Withdrawal alongside Transfer", () => {
    const logs = [
      // ADDR_A deposits 1 ETH into WETH
      {
        address: TOKEN,
        topics: [DEPOSIT_TOPIC, padAddr(ADDR_A)],
        data: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
      },
      // ADDR_A withdraws 0.5 ETH from WETH
      {
        address: TOKEN,
        topics: [WITHDRAWAL_TOPIC, padAddr(ADDR_A)],
        data: "0x00000000000000000000000000000000000000000000000006f05b59d3b20000",
      },
    ];
    const map = buildTokenAccountMap(logs);
    // net: +1e18 - 0.5e18 = 0.5e18
    expect(map[ADDR_A].tokens[TOKEN]).toBe(500000000000000000n);
    expect(map[ZERO_ADDR].tokens[TOKEN]).toBe(-500000000000000000n);
  });

  it("returns empty map for empty logs", () => {
    expect(buildTokenAccountMap([])).toEqual({});
    expect(buildTokenAccountMap(null)).toEqual({});
  });

  it("skips unrelated logs without throwing", () => {
    const logs = [
      {
        address: TOKEN,
        topics: ["0xdeadbeef"],
        data: "0x01",
      },
    ];
    expect(buildTokenAccountMap(logs)).toEqual({});
  });
});
