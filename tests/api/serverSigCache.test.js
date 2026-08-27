import { describe, it, expect, afterAll, vi } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";
import {
  getSignaturesFromCache,
  setSignaturesInCache,
} from "../../app/utils/serverSigCache.js";

const TEST_DIR = join(tmpdir(), `serverSigCache-test-${process.pid}`);
const DEFAULT_CACHE_TEST_DIR = join(
  tmpdir(),
  `serverSigCache-default-test-${process.pid}`,
);

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });
});

const SIGS = [
  "transfer(address,uint256)",
  "transferFrom(address,address,uint256)",
];

describe("serverSigCache", () => {
  it("returns null for a cache miss", async () => {
    const result = await getSignaturesFromCache("0xa9059cbb", TEST_DIR);
    expect(result).toBeNull();
  });

  it("returns null for corrupt JSON without throwing", async () => {
    const dir = join(TEST_DIR, "signatures");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, "0xdeadbeef.json"), "not-json", "utf-8");
    const result = await getSignaturesFromCache("0xdeadbeef", TEST_DIR);
    expect(result).toBeNull();
  });

  it("rejects non-selector keys at the disk boundary (traversal-safe)", async () => {
    expect(
      await getSignaturesFromCache("../../etc/passwd", TEST_DIR),
    ).toBeNull();
    await setSignaturesInCache("../escape", SIGS, TEST_DIR);
    await setSignaturesInCache("not-a-selector", SIGS, TEST_DIR);
    const entries = await fs
      .readdir(join(TEST_DIR, "signatures"))
      .catch(() => []);
    expect(entries.filter((f) => f !== "0xdeadbeef.json")).toEqual([]);
  });

  it("stores and retrieves cached signatures", async () => {
    await setSignaturesInCache("0xa9059cbb", SIGS, TEST_DIR);
    const result = await getSignaturesFromCache("0xa9059cbb", TEST_DIR);
    expect(result).toEqual(SIGS);
  });

  it("lowercases the selector before writing", async () => {
    await setSignaturesInCache("0xA9059CBB", SIGS, TEST_DIR);
    const raw = await fs.readFile(
      join(TEST_DIR, "signatures", "0xa9059cbb.json"),
      "utf-8",
    );
    expect(JSON.parse(raw)).toEqual(SIGS);
  });

  it("creates the signatures directory if it does not exist", async () => {
    await setSignaturesInCache("0x23b872dd", SIGS, TEST_DIR);
    const stat = await fs.stat(join(TEST_DIR, "signatures"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("uses CACHE_DIR when provided", async () => {
    const oldCacheDir = process.env.CACHE_DIR;
    process.env.CACHE_DIR = TEST_DIR;
    vi.resetModules();

    try {
      const cache = await import("../../app/utils/serverSigCache.js");
      await cache.setSignaturesInCache("0xdeadbeef", SIGS);
      await expect(cache.getSignaturesFromCache("0xdeadbeef")).resolves.toEqual(
        SIGS,
      );
    } finally {
      if (oldCacheDir) process.env.CACHE_DIR = oldCacheDir;
      else delete process.env.CACHE_DIR;
      vi.resetModules();
    }
  });
});
