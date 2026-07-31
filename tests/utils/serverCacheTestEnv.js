// tests/utils/serverCacheTestEnv.js
import { join } from "path";
import { tmpdir } from "os";
import { promises as fs } from "fs";

export function serverCacheTestDir(name) {
  return join(tmpdir(), `server-cache-${name}-${process.pid}`);
}

export async function resetServerCacheTestDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

export async function removeServerCacheTestDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}
