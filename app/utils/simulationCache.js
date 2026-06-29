import { promises as fs } from "fs";
import { join } from "path";
import { deflateRawSync, inflateRawSync } from "zlib";
import { getServerCacheBaseDir } from "./serverCacheDir";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SHARE_ID_PREFIX = "z1_";

function getCacheDir() {
  return (
    process.env.SIMULATION_CACHE_DIR ||
    join(getServerCacheBaseDir(), "simulations")
  );
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

function buildEntry(data) {
  const now = Date.now();
  const ttl = getTTL();
  return {
    data,
    createdAt: now,
    expiresAt: now + ttl,
  };
}

function getDataFromEntry(entry) {
  if (!entry || Date.now() > entry.expiresAt) {
    return null;
  }
  return entry.data;
}

export async function createShareableSimulationId(data) {
  const payload = JSON.stringify(buildEntry(data));
  const encoded = deflateRawSync(Buffer.from(payload, "utf-8")).toString(
    "base64url",
  );
  return `${SHARE_ID_PREFIX}${encoded}`;
}

function getShareableSimulationResult(id) {
  if (!id.startsWith(SHARE_ID_PREFIX)) {
    return undefined;
  }

  try {
    const encoded = id.slice(SHARE_ID_PREFIX.length);
    const raw = inflateRawSync(Buffer.from(encoded, "base64url")).toString(
      "utf-8",
    );
    return getDataFromEntry(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveSimulationResult(data) {
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  const entry = buildEntry(data);
  const cacheDir = getCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(resultPath(id, cacheDir), JSON.stringify(entry), "utf-8");
  return id;
}

export async function getSimulationResult(id) {
  const shareableResult = getShareableSimulationResult(id);
  if (shareableResult !== undefined) {
    return shareableResult;
  }

  const cacheDir = getCacheDir();
  const path = resultPath(id, cacheDir);
  try {
    const raw = await fs.readFile(path, "utf-8");
    const entry = JSON.parse(raw);
    const data = getDataFromEntry(entry);
    if (data === null) {
      await fs.unlink(path).catch(() => {});
      return null;
    }
    return data;
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
