import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";
import {
  createShareableSimulationId,
  saveSimulationResult,
  getSimulationResult,
  pruneExpiredResults,
} from "../../app/utils/simulationCache.js";

const TEST_DIR = join(tmpdir(), `simulationCache-test-${process.pid}`);
const DEFAULT_CACHE_TEST_DIR = join(
  tmpdir(),
  `simulationCache-default-test-${process.pid}`,
);
const OVERRIDE_CACHE_TEST_DIR = join(
  tmpdir(),
  `simulationCache-env-test-${process.pid}`,
);
const SIM_DATA = {
  success: true,
  simulated: true,
  gasUsed: 63086,
  logs: [],
  callTrace: null,
};

async function withCacheDir(fn) {
  const old = process.env.SIMULATION_CACHE_DIR;
  process.env.SIMULATION_CACHE_DIR = TEST_DIR;
  try {
    return await fn();
  } finally {
    if (old) process.env.SIMULATION_CACHE_DIR = old;
    else delete process.env.SIMULATION_CACHE_DIR;
  }
}

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });
  await fs.rm(OVERRIDE_CACHE_TEST_DIR, { recursive: true, force: true });
});

describe("simulationCache", () => {
  async function importWithEnv() {
    vi.resetModules();
    return import("../../app/utils/simulationCache.js");
  }

  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("saves data and returns a UUID", async () => {
    const id = await withCacheDir(() => saveSimulationResult(SIM_DATA));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("retrieves saved data by ID", async () => {
    const id = await withCacheDir(() => saveSimulationResult(SIM_DATA));
    const retrieved = await withCacheDir(() => getSimulationResult(id));
    expect(retrieved).toEqual(SIM_DATA);
  });

  it("retrieves falsy saved data values", async () => {
    const id = await withCacheDir(() => saveSimulationResult(false));
    const retrieved = await withCacheDir(() => getSimulationResult(id));
    expect(retrieved).toBe(false);
  });

  it("retrieves shareable IDs without the file cache", async () => {
    const id = await createShareableSimulationId(SIM_DATA);
    expect(id).toMatch(/^z1_/);

    const retrieved = await withCacheDir(async () => {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
      return getSimulationResult(id);
    });

    expect(retrieved).toEqual(SIM_DATA);
  });

  it("returns null for an unknown ID", async () => {
    const result = await withCacheDir(() =>
      getSimulationResult("00000000-0000-0000-0000-000000000000"),
    );
    expect(result).toBeNull();
  });

  it("returns null for corrupt cache file without throwing", async () => {
    await withCacheDir(async () => {
      await fs.mkdir(TEST_DIR, { recursive: true });
      await fs.writeFile(
        join(TEST_DIR, "corrupt.json"),
        "not-valid-json",
        "utf-8",
      );
      const result = await getSimulationResult("corrupt");
      expect(result).toBeNull();
    });
  });

  it("returns null and deletes expired entries", async () => {
    const oldTtl = process.env.SIMULATION_RESULT_TTL;
    try {
      process.env.SIMULATION_RESULT_TTL = "1";
      await withCacheDir(async () => {
        const id = await saveSimulationResult(SIM_DATA);
        await new Promise((r) => setTimeout(r, 10));
        const result = await getSimulationResult(id);
        expect(result).toBeNull();
        await expect(fs.access(join(TEST_DIR, `${id}.json`))).rejects.toThrow();
      });
    } finally {
      if (oldTtl) process.env.SIMULATION_RESULT_TTL = oldTtl;
      else delete process.env.SIMULATION_RESULT_TTL;
    }
  });

  it("pruneExpiredResults removes only expired entries", async () => {
    const oldTtl = process.env.SIMULATION_RESULT_TTL;
    try {
      process.env.SIMULATION_RESULT_TTL = "1";
      const expiredId = await withCacheDir(() =>
        saveSimulationResult(SIM_DATA),
      );

      process.env.SIMULATION_RESULT_TTL = "600000";
      const validId = await withCacheDir(() => saveSimulationResult(SIM_DATA));

      await new Promise((r) => setTimeout(r, 10));

      const pruned = await withCacheDir(() => pruneExpiredResults());
      expect(pruned).toBe(1);

      expect(
        await withCacheDir(() => getSimulationResult(expiredId)),
      ).toBeNull();
      expect(await withCacheDir(() => getSimulationResult(validId))).toEqual(
        SIM_DATA,
      );
    } finally {
      if (oldTtl) process.env.SIMULATION_RESULT_TTL = oldTtl;
      else delete process.env.SIMULATION_RESULT_TTL;
    }
  });

  it("pruneExpiredResults handles empty directory", async () => {
    const count = await withCacheDir(async () => {
      await fs.mkdir(TEST_DIR, { recursive: true });
      return pruneExpiredResults();
    });
    expect(count).toBe(0);
  });

  it("uses tmpdir by default", async () => {
    const oldCacheDir = process.env.CACHE_DIR;
    const oldSimulationCacheDir = process.env.SIMULATION_CACHE_DIR;
    const oldHome = process.env.HOME;
    const oldTmpdir = process.env.TMPDIR;
    delete process.env.CACHE_DIR;
    process.env.HOME = join(DEFAULT_CACHE_TEST_DIR, "home");
    process.env.TMPDIR = join(DEFAULT_CACHE_TEST_DIR, "tmp");
    delete process.env.SIMULATION_CACHE_DIR;
    await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });

    try {
      const cache = await importWithEnv();
      const id = await cache.saveSimulationResult(SIM_DATA);

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
      ).resolves.toBeUndefined();
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
      ).rejects.toThrow();
      await expect(cache.getSimulationResult(id)).resolves.toEqual(SIM_DATA);
    } finally {
      if (oldCacheDir) process.env.CACHE_DIR = oldCacheDir;
      else delete process.env.CACHE_DIR;
      if (oldSimulationCacheDir)
        process.env.SIMULATION_CACHE_DIR = oldSimulationCacheDir;
      else delete process.env.SIMULATION_CACHE_DIR;
      if (oldHome) process.env.HOME = oldHome;
      else delete process.env.HOME;
      if (oldTmpdir) process.env.TMPDIR = oldTmpdir;
      else delete process.env.TMPDIR;
      vi.resetModules();
    }
  });

  it("uses CACHE_DIR as the default base when provided", async () => {
    const oldCacheDir = process.env.CACHE_DIR;
    const oldSimulationCacheDir = process.env.SIMULATION_CACHE_DIR;
    process.env.CACHE_DIR = OVERRIDE_CACHE_TEST_DIR;
    delete process.env.SIMULATION_CACHE_DIR;
    await fs.rm(OVERRIDE_CACHE_TEST_DIR, { recursive: true, force: true });

    try {
      const cache = await importWithEnv();
      const id = await cache.saveSimulationResult(SIM_DATA);

      await expect(
        fs.access(join(OVERRIDE_CACHE_TEST_DIR, "simulations", `${id}.json`)),
      ).resolves.toBeUndefined();
      await expect(cache.getSimulationResult(id)).resolves.toEqual(SIM_DATA);
    } finally {
      if (oldCacheDir) process.env.CACHE_DIR = oldCacheDir;
      else delete process.env.CACHE_DIR;
      if (oldSimulationCacheDir)
        process.env.SIMULATION_CACHE_DIR = oldSimulationCacheDir;
      else delete process.env.SIMULATION_CACHE_DIR;
      vi.resetModules();
    }
  });
});
