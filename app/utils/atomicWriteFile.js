import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";

/**
 * Write a file atomically: write to a unique temp file in the same
 * directory, then rename over the target. Renames are atomic on POSIX, so
 * concurrent readers never observe a partially-written JSON file (which
 * previously could poison the cache until the next full write).
 */
export async function atomicWriteFile(filePath, contents) {
  const tmpPath = join(dirname(filePath), `.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmpPath, contents);
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}
