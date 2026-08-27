import { promises as fs } from "fs";
import { join } from "path";
import { getServerCacheBaseDir } from "./serverCacheDir";
import { atomicWriteFile } from "./atomicWriteFile";

// Signature-cache keys are filesystem components built from user input, so
// only well-formed selectors/topic0 hashes may ever reach the disk layer.
const SELECTOR_RE = /^(0x)?[0-9a-fA-F]{8}$/;
const TOPIC0_RE = /^(0x)?[0-9a-fA-F]{64}$/;

export function isValidSelector(selector) {
  return typeof selector === "string" && SELECTOR_RE.test(selector);
}

export function isValidTopic0(topic0) {
  return typeof topic0 === "string" && TOPIC0_RE.test(topic0);
}

function sigPath(selector, cacheDir) {
  return join(cacheDir, "signatures", `${selector.toLowerCase()}.json`);
}

export async function getSignaturesFromCache(
  selector,
  cacheDir = getServerCacheBaseDir(),
) {
  if (!isValidSelector(selector) && !isValidTopic0(selector)) {
    return null;
  }
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
  if (!isValidSelector(selector) && !isValidTopic0(selector)) {
    return;
  }
  try {
    const dir = join(cacheDir, "signatures");
    await fs.mkdir(dir, { recursive: true });
    await atomicWriteFile(
      sigPath(selector, cacheDir),
      JSON.stringify(signatures),
    );
  } catch (e) {
    console.warn(
      `Failed to write signature cache for selector ${selector}:`,
      e.message,
    );
  }
}
