import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";

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
};
const ORIGINAL_ENV = {
  CACHE_DIR: process.env.CACHE_DIR,
  SIMULATION_CACHE_DIR: process.env.SIMULATION_CACHE_DIR,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  VERCEL: process.env.VERCEL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("simulation result storage default directories", () => {
  async function importWithEnv() {
    vi.resetModules();
    return import("../../app/utils/simulationCache.js");
  }

  beforeEach(async () => {
    delete process.env.CACHE_DIR;
    delete process.env.SIMULATION_CACHE_DIR;
    delete process.env.VERCEL;
    await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(DEFAULT_CACHE_TEST_DIR, { recursive: true, force: true });
    restoreEnv();
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

  it("uses tmpdir on Vercel", async () => {
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
