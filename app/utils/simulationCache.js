import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_CACHE_DIR = join(
  homedir(),
  ".cache",
  "eth-decoder",
  "simulations",
);
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCacheDir() {
  return process.env.SIMULATION_CACHE_DIR || DEFAULT_CACHE_DIR;
}

function getTTL() {
  const ttl = process.env.SIMULATION_RESULT_TTL;
  if (ttl) {
    const parsed = parseInt(ttl, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL_MS;
}

function resultPath(id, cacheDir) {
  return join(cacheDir, `${id}.json`);
}

export async function saveSimulationResult(data) {
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  const now = Date.now();
  const ttl = getTTL();
  const entry = {
    data,
    createdAt: now,
    expiresAt: now + ttl,
  };
  const cacheDir = getCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(resultPath(id, cacheDir), JSON.stringify(entry), "utf-8");
  return id;
}

export async function getSimulationResult(id) {
  const cacheDir = getCacheDir();
  const path = resultPath(id, cacheDir);
  try {
    const raw = await fs.readFile(path, "utf-8");
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      await fs.unlink(path).catch(() => {});
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function pruneExpiredResults() {
  const cacheDir = getCacheDir();
  let files;
  try {
    files = await fs.readdir(cacheDir);
  } catch {
    return 0;
  }
  let pruned = 0;
  const now = Date.now();
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(join(cacheDir, file), "utf-8");
      const entry = JSON.parse(raw);
      if (now > entry.expiresAt) {
        await fs.unlink(join(cacheDir, file));
        pruned++;
      }
    } catch {
      try {
        await fs.unlink(join(cacheDir, file));
        pruned++;
      } catch {}
    }
  }
  return pruned;
}
