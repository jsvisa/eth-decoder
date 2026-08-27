import { promises as fs } from "fs";
import { join } from "path";
import { getServerCacheBaseDir } from "./serverCacheDir";
import { atomicWriteFile } from "./atomicWriteFile";

// Cache paths are built from user-controlled values; enforce shape here so
// a future caller that forgets to validate cannot trigger path traversal.
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const CHAIN_ID_RE = /^\d{1,12}$/;

function isValidCacheKey(chainId, address) {
  return (
    typeof address === "string" &&
    ADDRESS_RE.test(address) &&
    CHAIN_ID_RE.test(String(chainId))
  );
}

function cachePath(chainId, address, cacheDir) {
  return join(cacheDir, String(chainId), `${address.toLowerCase()}.json`);
}

export async function getAbiFromCache(
  chainId,
  address,
  cacheDir = getServerCacheBaseDir(),
) {
  if (!isValidCacheKey(chainId, address)) return null;
  try {
    const raw = await fs.readFile(
      cachePath(chainId, address, cacheDir),
      "utf-8",
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setAbiInCache(
  chainId,
  address,
  entry,
  cacheDir = getServerCacheBaseDir(),
) {
  if (!isValidCacheKey(chainId, address)) return;
  try {
    const dir = join(cacheDir, String(chainId));
    await fs.mkdir(dir, { recursive: true });
    await atomicWriteFile(
      cachePath(chainId, address, cacheDir),
      JSON.stringify(entry),
    );
  } catch (e) {
    console.warn(
      `Failed to write ABI cache for chain ${chainId} address ${address}:`,
      e.message,
    );
  }
}
