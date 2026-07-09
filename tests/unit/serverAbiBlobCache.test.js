import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  get: vi.fn(),
}));

import { put as putBlob, get as getBlob } from "@vercel/blob";

const TEST_CACHE_DIR = join(tmpdir(), `abiBlobCache-test-${process.pid}`);
const ORIGINAL_ENV = {
  VERCEL: process.env.VERCEL,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
  CACHE_DIR: process.env.CACHE_DIR,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const MOCK_ABI = [
  { type: "function", name: "transfer", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
];

const MOCK_ABI_ENTRY = {
  abi: MOCK_ABI,
  contractName: "TestToken",
  isProxy: false,
  implAddress: null,
  implContractName: null,
  fetchedAt: Date.now(),
};

describe("serverAbiBlobCache", () => {
  beforeEach(async () => {
    putBlob.mockReset();
    getBlob.mockReset();
    delete process.env.VERCEL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.CACHE_DIR;

    vi.resetModules();
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
    restoreEnv();
  });

  describe("getAbiFromCache / setAbiInCache", () => {
    it("returns null when blob has no data and local cache is empty", async () => {
      getBlob.mockRejectedValue(new Error("Not found"));

      const { getAbiFromCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const result = await getAbiFromCache(1, "0x1234");

      expect(result).toBeNull();
    });

    it("reads from blob when on Vercel with credentials", async () => {
      process.env.VERCEL = "1";
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      const now = Date.now();
      const entry = { data: MOCK_ABI_ENTRY, createdAt: now, expiresAt: now + 60_000 };
      getBlob.mockResolvedValue({
        stream: new Response(JSON.stringify(entry)).body,
      });

      const { getAbiFromCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const result = await getAbiFromCache(1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

      expect(result).toEqual(MOCK_ABI_ENTRY);
      expect(getBlob).toHaveBeenCalledWith(
        "abis/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.json",
        { access: "private" },
      );
    });

    it("writes to blob and local FS when on Vercel with credentials", async () => {
      process.env.VERCEL = "1";
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      process.env.CACHE_DIR = TEST_CACHE_DIR;
      putBlob.mockResolvedValue({});

      const { setAbiInCache } = await import("../../app/utils/serverAbiBlobCache.js");
      await setAbiInCache(1, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", MOCK_ABI_ENTRY);

      expect(putBlob).toHaveBeenCalledTimes(1);
      const [blobPath, data, opts] = putBlob.mock.calls[0];
      expect(blobPath).toBe("abis/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.json");
      const parsed = JSON.parse(data);
      expect(parsed.data).toEqual(MOCK_ABI_ENTRY);
      expect(parsed.createdAt).toBeGreaterThan(0);
      expect(parsed.expiresAt).toBeGreaterThan(parsed.createdAt);

      await expect(
        fs.access(join(TEST_CACHE_DIR, "1", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.json")),
      ).resolves.toBeUndefined();
    });

    it("falls through to local FS when blob is unavailable", async () => {
      process.env.VERCEL = "1";
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      getBlob.mockRejectedValue(new Error("Not found"));

      const { getAbiFromCache, setAbiInCache } = await import("../../app/utils/serverAbiBlobCache.js");
      await setAbiInCache(1, "0xdead", MOCK_ABI_ENTRY);

      const result = await getAbiFromCache(1, "0xdead");
      expect(result).toEqual(MOCK_ABI_ENTRY);
    });

    it("skips blob when not on Vercel", async () => {
      const { getAbiFromCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const result = await getAbiFromCache(1, "0x1234");

      expect(getBlob).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("returns null for expired blob entries", async () => {
      process.env.VERCEL = "1";
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      const entry = { data: MOCK_ABI_ENTRY, createdAt: 1, expiresAt: 2 };
      getBlob.mockResolvedValue({
        stream: new Response(JSON.stringify(entry)).body,
      });

      const { getAbiFromCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const result = await getAbiFromCache(1, "0x1234");

      expect(result).toBeNull();
    });
  });

  describe("getSignaturesFromBlobCache / setSignaturesInBlobCache", () => {
    it("returns null when blob cache is disabled", async () => {
      const { getSignaturesFromBlobCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const result = await getSignaturesFromBlobCache("0xa9059cbb");
      expect(result).toBeNull();
      expect(getBlob).not.toHaveBeenCalled();
    });

    it("returns cached signatures when available", async () => {
      process.env.VERCEL = "1";
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      const now = Date.now();
      const sigs = ["transfer(address,uint256)"];
      const entry = { data: sigs, createdAt: now, expiresAt: now + 60_000 };
      getBlob.mockResolvedValue({
        stream: new Response(JSON.stringify(entry)).body,
      });

      const { getSignaturesFromBlobCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const result = await getSignaturesFromBlobCache("0xa9059cbb");

      expect(result).toEqual(sigs);
      expect(getBlob).toHaveBeenCalledWith(
        "signatures/0xa9059cbb.json",
        { access: "private" },
      );
    });

    it("writes signatures to blob", async () => {
      process.env.VERCEL = "1";
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      putBlob.mockResolvedValue({});

      const { setSignaturesInBlobCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const sigs = ["transfer(address,uint256)", "transferFrom(address,address,uint256)"];
      await setSignaturesInBlobCache("0x23b872dd", sigs);

      expect(putBlob).toHaveBeenCalledTimes(1);
      const [blobPath, data] = putBlob.mock.calls[0];
      expect(blobPath).toBe("signatures/0x23b872dd.json");
      const parsed = JSON.parse(data);
      expect(parsed.data).toEqual(sigs);
    });

    it("returns null for expired signature entries", async () => {
      process.env.VERCEL = "1";
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      const entry = { data: ["some(old)sig(uint256)"], createdAt: 1, expiresAt: 2 };
      getBlob.mockResolvedValue({
        stream: new Response(JSON.stringify(entry)).body,
      });

      const { getSignaturesFromBlobCache } = await import("../../app/utils/serverAbiBlobCache.js");
      const result = await getSignaturesFromBlobCache("0x12345678");

      expect(result).toBeNull();
    });
  });
});
