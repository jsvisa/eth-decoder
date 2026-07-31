import { promises as fs } from "fs";
import { join } from "path";
import { getServerCacheBaseDir } from "./serverCacheDir";

function sigPath(selector, cacheDir) {
  return join(cacheDir, "signatures", `${selector.toLowerCase()}.json`);
}

export async function getSignaturesFromCache(
  selector,
  cacheDir = getServerCacheBaseDir(),
) {
  try {
    const raw = await fs.readFile(sigPath(selector, cacheDir), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSignaturesInCache(
  selector,
  signatures,
  cacheDir = getServerCacheBaseDir(),
) {
  try {
    const dir = join(cacheDir, "signatures");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      sigPath(selector, cacheDir),
      JSON.stringify(signatures),
      "utf-8",
    );
  } catch (e) {
    console.warn(
      `Failed to write signature cache for selector ${selector}:`,
      e.message,
    );
  }
}
