import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";
import {
  saveSimulationResult,
  getSimulationResult,
} from "../../app/utils/simulationCache.js";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  get: vi.fn(),
}));

import { put as putBlob, get as getBlob } from "@vercel/blob";

const DEFAULT_CACHE_TEST_DIR = join(
  tmpdir(),
  `simulationStorage-default-test-${process.pid}`,
);
const SIM_DATA = {
  success: true,
  simulated: true,
  gasUsed: 63086,
  logs: [],
  callTrace: null,
  balanceChanges: [
    {
      address: "0xb826224b742ead5cf91ea432340e3763fac09cdd",
      tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      name: "USDC",
      amount: "-1,000",
      price: 1,
      valueUsd: -1000,
      diff: "-1000000000",
    },
  ],
  _tokenMeta: {
    tokenSymbols: {
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
    },
    tokenDecimals: {
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,
    },
    tokenPrices: {
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 1,
    },
  },
};
const ORIGINAL_ENV = {
  VERCEL: process.env.VERCEL,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
  CACHE_DIR: process.env.CACHE_DIR,
  SIMULATION_CACHE_DIR: process.env.SIMULATION_CACHE_DIR,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("simulation result storage backends", () => {
  async function importWithEnv() {
    vi.resetModules();
    return import("../../app/utils/simulationCache.js");
  }

  beforeEach(async () => {
    putBlob.mockReset();
    getBlob.mockReset();
    delete process.env.VERCEL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.CACHE_DIR;
    delete process.env.SIMULATION_CACHE_DIR;
    await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });
    restoreEnv();
  });

  it("saves Vercel deployments to private Blob storage when credentials exist", async () => {
    process.env.VERCEL = "1";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel-blob-token";
    putBlob.mockResolvedValue({
      pathname: "simulations/mock.json",
      url: "https://example.com/mock.json",
    });

    const id = await saveSimulationResult(SIM_DATA);

    expect(id).toMatch(/^vb1_/);
    expect(putBlob).toHaveBeenCalledOnce();
    expect(putBlob.mock.calls[0][0]).toBe(
      `simulations/${id.slice("vb1_".length)}.json`,
    );
    expect(JSON.parse(putBlob.mock.calls[0][1]).data).toEqual(SIM_DATA);
    expect(putBlob.mock.calls[0][2]).toMatchObject({
      access: "private",
      contentType: "application/json",
      allowOverwrite: false,
    });
  });

  it("retrieves Vercel Blob simulation results by Blob id", async () => {
    const entry = {
      data: SIM_DATA,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    getBlob.mockResolvedValue({
      statusCode: 200,
      stream: new Response(JSON.stringify(entry)).body,
      headers: new Headers(),
      blob: {},
    });

    const result = await getSimulationResult(
      "vb1_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );

    expect(result).toEqual(SIM_DATA);
    expect(getBlob).toHaveBeenCalledWith(
      "simulations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json",
      { access: "private" },
    );
  });

  it("uses home cache by default outside Vercel", async () => {
    const oldHome = process.env.HOME;
    const oldTmpdir = process.env.TMPDIR;
    process.env.HOME = join(DEFAULT_CACHE_TEST_DIR, "home");
    process.env.TMPDIR = join(DEFAULT_CACHE_TEST_DIR, "tmp");

    try {
      const cache = await importWithEnv();
      const id = await cache.saveSimulationResult(SIM_DATA);

      await expect(
        fs.access(
          join(
            DEFAULT_CACHE_TEST_DIR,
            "home",
            ".cache",
            "eth-decoder",
            "simulations",
            `${id}.json`,
          ),
        ),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(
          join(
            DEFAULT_CACHE_TEST_DIR,
            "tmp",
            "eth-decoder",
            "simulations",
            `${id}.json`,
          ),
        ),
      ).rejects.toThrow();
      await expect(cache.getSimulationResult(id)).resolves.toEqual(SIM_DATA);
    } finally {
      if (oldHome) process.env.HOME = oldHome;
      else delete process.env.HOME;
      if (oldTmpdir) process.env.TMPDIR = oldTmpdir;
      else delete process.env.TMPDIR;
      vi.resetModules();
    }
  });

  it("uses tmpdir on Vercel when Blob credentials are not configured", async () => {
    const oldHome = process.env.HOME;
    const oldTmpdir = process.env.TMPDIR;
    process.env.HOME = join(DEFAULT_CACHE_TEST_DIR, "vercel-home");
    process.env.TMPDIR = join(DEFAULT_CACHE_TEST_DIR, "vercel-tmp");
    process.env.VERCEL = "1";

    try {
      const cache = await importWithEnv();
      const id = await cache.saveSimulationResult(SIM_DATA);

      await expect(
        fs.access(
          join(
            DEFAULT_CACHE_TEST_DIR,
            "vercel-tmp",
            "eth-decoder",
            "simulations",
            `${id}.json`,
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
            "simulations",
            `${id}.json`,
          ),
        ),
      ).rejects.toThrow();
      await expect(cache.getSimulationResult(id)).resolves.toEqual(SIM_DATA);
    } finally {
      if (oldHome) process.env.HOME = oldHome;
      else delete process.env.HOME;
      if (oldTmpdir) process.env.TMPDIR = oldTmpdir;
      else delete process.env.TMPDIR;
      vi.resetModules();
    }
  });
});
