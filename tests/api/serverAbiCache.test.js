import { describe, it, expect, afterAll, vi } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";
import {
  getAbiFromCache,
  setAbiInCache,
} from "../../app/utils/serverAbiCache.js";

const TEST_DIR = join(tmpdir(), `serverAbiCache-test-${process.pid}`);
const DEFAULT_CACHE_TEST_DIR = join(
  tmpdir(),
  `serverAbiCache-default-test-${process.pid}`,
);
const OVERRIDE_CACHE_TEST_DIR = join(
  tmpdir(),
  `serverAbiCache-env-test-${process.pid}`,
);

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });
  await fs.rm(OVERRIDE_CACHE_TEST_DIR, { recursive: true, force: true });
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
  async function importWithEnv() {
    vi.resetModules();
    return import("../../app/utils/serverAbiCache.js");
  }

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

  it("uses home cache by default outside Vercel", async () => {
    const oldCacheDir = process.env.CACHE_DIR;
    const oldHome = process.env.HOME;
    const oldTmpdir = process.env.TMPDIR;
    const oldVercel = process.env.VERCEL;
    delete process.env.CACHE_DIR;
    process.env.HOME = join(DEFAULT_CACHE_TEST_DIR, "home");
    process.env.TMPDIR = join(DEFAULT_CACHE_TEST_DIR, "tmp");
    delete process.env.VERCEL;
    await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });

    try {
      const cache = await importWithEnv();
      await cache.setAbiInCache(1, "0xDEAD", ENTRY);

      await expect(
        fs.access(
          join(
            DEFAULT_CACHE_TEST_DIR,
            "home",
            ".cache",
            "eth-decoder",
            "1",
            "0xdead.json",
          ),
        ),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(
          join(
            DEFAULT_CACHE_TEST_DIR,
            "tmp",
            "eth-decoder",
            "1",
            "0xdead.json",
          ),
        ),
      ).rejects.toThrow();
      await expect(cache.getAbiFromCache(1, "0xDEAD")).resolves.toEqual(ENTRY);
    } finally {
      if (oldCacheDir) process.env.CACHE_DIR = oldCacheDir;
      else delete process.env.CACHE_DIR;
      if (oldHome) process.env.HOME = oldHome;
      else delete process.env.HOME;
      if (oldTmpdir) process.env.TMPDIR = oldTmpdir;
      else delete process.env.TMPDIR;
      if (oldVercel) process.env.VERCEL = oldVercel;
      else delete process.env.VERCEL;
      vi.resetModules();
    }
  });

  it("uses tmpdir on Vercel", async () => {
    const oldCacheDir = process.env.CACHE_DIR;
    const oldHome = process.env.HOME;
    const oldTmpdir = process.env.TMPDIR;
    const oldVercel = process.env.VERCEL;
    delete process.env.CACHE_DIR;
    process.env.HOME = join(DEFAULT_CACHE_TEST_DIR, "vercel-home");
    process.env.TMPDIR = join(DEFAULT_CACHE_TEST_DIR, "vercel-tmp");
    process.env.VERCEL = "1";
    await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });

    try {
      const cache = await importWithEnv();
      await cache.setAbiInCache(1, "0xDEAD", ENTRY);

      await expect(
        fs.access(
          join(
            DEFAULT_CACHE_TEST_DIR,
            "vercel-tmp",
            "eth-decoder",
            "1",
            "0xdead.json",
          ),
        ),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(
          join(
            DEFAULT_CACHE_TEST_DIR,
            "vercel-home",
            ".cache",
            "eth-decoder",
            "1",
            "0xdead.json",
          ),
        ),
      ).rejects.toThrow();
      await expect(cache.getAbiFromCache(1, "0xDEAD")).resolves.toEqual(ENTRY);
    } finally {
      if (oldCacheDir) process.env.CACHE_DIR = oldCacheDir;
      else delete process.env.CACHE_DIR;
      if (oldHome) process.env.HOME = oldHome;
      else delete process.env.HOME;
      if (oldTmpdir) process.env.TMPDIR = oldTmpdir;
      else delete process.env.TMPDIR;
      if (oldVercel) process.env.VERCEL = oldVercel;
      else delete process.env.VERCEL;
      vi.resetModules();
    }
  });

  it("uses CACHE_DIR when provided", async () => {
    const oldCacheDir = process.env.CACHE_DIR;
    process.env.CACHE_DIR = OVERRIDE_CACHE_TEST_DIR;
    await fs.rm(OVERRIDE_CACHE_TEST_DIR, { recursive: true, force: true });

    try {
      const cache = await importWithEnv();
      await cache.setAbiInCache(1, "0xBEEF", ENTRY);

      await expect(
        fs.access(join(OVERRIDE_CACHE_TEST_DIR, "1", "0xbeef.json")),
      ).resolves.toBeUndefined();
      await expect(cache.getAbiFromCache(1, "0xBEEF")).resolves.toEqual(ENTRY);
    } finally {
      if (oldCacheDir) process.env.CACHE_DIR = oldCacheDir;
      else delete process.env.CACHE_DIR;
      vi.resetModules();
    }
  });
});
