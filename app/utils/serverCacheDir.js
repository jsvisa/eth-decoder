import { tmpdir } from "os";
import { join } from "path";

export function getServerCacheBaseDir() {
  return process.env.CACHE_DIR || join(tmpdir(), "eth-decoder");
}
