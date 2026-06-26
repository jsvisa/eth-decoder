import { describe, it, expect, afterAll } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";
import {
  getAbiFromCache,
  setAbiInCache,
} from "../../app/utils/serverAbiCache.js";

const TEST_DIR = join(tmpdir(), `serverAbiCache-test-${process.pid}`);

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

const ENTRY = {
  abi: [{ type: "function", name: "balanceOf", inputs: [], outputs: [] }],
  isProxy: false,
  implAddress: null,
  contractName: "ERC20",
  implContractName: null,
  fetchedAt: 1719360000000,
};

describe("serverAbiCache", () => {
  it("returns null for a cache miss", async () => {
    const result = await getAbiFromCache(1, "0xabc", TEST_DIR);
    expect(result).toBeNull();
  });

  it("returns null for corrupt JSON without throwing", async () => {
    const dir = join(TEST_DIR, "1");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, "0xcorrupt.json"), "not-json", "utf-8");
    const result = await getAbiFromCache(1, "0xcorrupt", TEST_DIR);
    expect(result).toBeNull();
  });

  it("stores and retrieves a cache entry", async () => {
    await setAbiInCache(
      1,
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      ENTRY,
      TEST_DIR,
    );
    const result = await getAbiFromCache(
      1,
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      TEST_DIR,
    );
    expect(result).toEqual(ENTRY);
  });

  it("lowercases the address before writing", async () => {
    await setAbiInCache(1, "0xDEAD", ENTRY, TEST_DIR);
    const filePath = join(TEST_DIR, "1", "0xdead.json");
    const raw = await fs.readFile(filePath, "utf-8");
    expect(JSON.parse(raw)).toEqual(ENTRY);
  });

  it("creates the chain directory if it does not exist", async () => {
    await setAbiInCache(8453, "0xbase", ENTRY, TEST_DIR);
    const stat = await fs.stat(join(TEST_DIR, "8453"));
    expect(stat.isDirectory()).toBe(true);
  });
});
