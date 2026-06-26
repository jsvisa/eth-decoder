import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_CACHE_DIR = join(homedir(), ".cache", "eth-decoder");

function cachePath(chainId, address, cacheDir) {
  return join(cacheDir, String(chainId), `${address.toLowerCase()}.json`);
}

export async function getAbiFromCache(
  chainId,
  address,
  cacheDir = DEFAULT_CACHE_DIR,
) {
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
  cacheDir = DEFAULT_CACHE_DIR,
) {
  try {
    const dir = join(cacheDir, String(chainId));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      cachePath(chainId, address, cacheDir),
      JSON.stringify(entry),
      "utf-8",
    );
  } catch {}
}
