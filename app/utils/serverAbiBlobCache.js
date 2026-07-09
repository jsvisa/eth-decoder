import { shouldUseVercelBlob, blobPut, blobGet } from "./blobCache";
import {
  getAbiFromCache as getLocalAbi,
  setAbiInCache as setLocalAbi,
} from "./serverAbiCache";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function abiBlobPath(chainId, address) {
  return `abis/${chainId}/${address.toLowerCase()}.json`;
}

function sigBlobPath(selector) {
  return `signatures/${selector.toLowerCase()}.json`;
}

function getTTL() {
  const ttl = process.env.ABI_CACHE_TTL || process.env.CACHE_TTL;
  if (ttl) {
    const parsed = parseInt(ttl, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL_MS;
}

function buildEntry(data, ttl) {
  const now = Date.now();
  return { data, createdAt: now, expiresAt: now + ttl };
}

function getDataFromEntry(entry) {
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

export async function getAbiFromBlobCache(chainId, address) {
  if (!shouldUseVercelBlob()) return null;
  try {
    const entry = await blobGet(abiBlobPath(chainId, address));
    return getDataFromEntry(entry);
  } catch {
    return null;
  }
}

export async function setAbiInBlobCache(chainId, address, abiEntry) {
  if (!shouldUseVercelBlob()) return;
  try {
    const entry = buildEntry(abiEntry, getTTL());
    await blobPut(abiBlobPath(chainId, address), entry);
  } catch (e) {
    console.warn(
      `Failed to write ABI blob for chain ${chainId} address ${address}:`,
      e.message,
    );
  }
}

export async function getAbiFromCache(chainId, address) {
  const blobResult = await getAbiFromBlobCache(chainId, address);
  if (blobResult) return blobResult;
  return getLocalAbi(chainId, address);
}

export async function setAbiInCache(chainId, address, entry) {
  await Promise.all([
    setAbiInBlobCache(chainId, address, entry),
    setLocalAbi(chainId, address, entry).catch(() => {}),
  ]);
}

export async function getSignaturesFromBlobCache(selector) {
  if (!shouldUseVercelBlob()) return null;
  try {
    const entry = await blobGet(sigBlobPath(selector));
    return getDataFromEntry(entry);
  } catch {
    return null;
  }
}

export async function setSignaturesInBlobCache(selector, signatures) {
  if (!shouldUseVercelBlob()) return;
  try {
    const entry = buildEntry(signatures, getTTL());
    await blobPut(sigBlobPath(selector), entry);
  } catch (e) {
    console.warn(
      `Failed to write signature blob for selector ${selector}:`,
      e.message,
    );
  }
}
