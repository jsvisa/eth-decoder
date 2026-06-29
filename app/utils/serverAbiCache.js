import { promises as fs } from "fs";
import { join } from "path";
import { getServerCacheBaseDir } from "./serverCacheDir";

function cachePath(chainId, address, cacheDir) {
  return join(cacheDir, String(chainId), `${address.toLowerCase()}.json`);
}

export async function getAbiFromCache(
  chainId,
  address,
  cacheDir = getServerCacheBaseDir(),
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
  cacheDir = getServerCacheBaseDir(),
) {
  try {
    const dir = join(cacheDir, String(chainId));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      cachePath(chainId, address, cacheDir),
      JSON.stringify(entry),
      "utf-8",
    );
  } catch (e) {
    console.warn(
      `Failed to write ABI cache for chain ${chainId} address ${address}:`,
      e.message,
    );
  }
}
