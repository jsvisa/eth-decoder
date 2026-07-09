import { isVercelRuntime } from "./serverCacheDir";

export function hasVercelBlobCredentials() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
}

export function shouldUseVercelBlob() {
  return isVercelRuntime() && hasVercelBlobCredentials();
}

export async function blobPut(path, data, opts = {}) {
  const { put } = await import("@vercel/blob");
  await put(path, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    ...opts,
  });
}

export async function blobGet(path) {
  const { get } = await import("@vercel/blob");
  const result = await get(path, { access: "private" });
  if (!result || !result.stream) return null;
  const raw = await new Response(result.stream).text();
  return JSON.parse(raw);
}

export async function blobList(prefix) {
  const { list } = await import("@vercel/blob");
  const all = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    all.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

export async function blobDelete(urls) {
  const { del } = await import("@vercel/blob");
  await del(urls);
}
