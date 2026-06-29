import { homedir, tmpdir } from "os";
import { join } from "path";

export function isVercelRuntime() {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

export function getServerCacheBaseDir() {
  if (process.env.CACHE_DIR) return process.env.CACHE_DIR;
  if (isVercelRuntime()) return join(tmpdir(), "eth-decoder");
  return join(homedir(), ".cache", "eth-decoder");
}
