import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { atomicWriteFile } from "../../app/utils/atomicWriteFile";

let dir;

beforeEach(async () => {
  dir = join(tmpdir(), `atomic-write-test-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
});

describe("atomicWriteFile", () => {
  it("writes the contents to the target path", async () => {
    const target = join(dir, "data.json");
    await atomicWriteFile(target, '{"a":1}');
    expect(await fs.readFile(target, "utf-8")).toBe('{"a":1}');
  });

  it("leaves no temp files behind on success", async () => {
    const target = join(dir, "data.json");
    await atomicWriteFile(target, "hello");
    const entries = await fs.readdir(dir);
    expect(entries).toEqual(["data.json"]);
  });

  it("cleans up the temp file when the rename fails", async () => {
    // Renaming onto a path inside a *file* fails — force the failure by
    // making a subdirectory of dir into a file conflict: create `blocked`
    // as an existing file, then use its path plus an extra segment.
    const blocked = join(dir, "blocked");
    await fs.writeFile(blocked, "i am a file");
    const badTarget = join(blocked, "child.json");

    await expect(atomicWriteFile(badTarget, "x")).rejects.toThrow();
    const entries = await fs.readdir(dir);
    // Only `blocked` remains; no .tmp leftovers
    expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
  });

  it("replaces existing content fully (no partial reads)", async () => {
    const target = join(dir, "data.json");
    await atomicWriteFile(target, "first-version-of-the-cache-entry");
    await atomicWriteFile(target, "second");
    expect(await fs.readFile(target, "utf-8")).toBe("second");
  });

  it("supports concurrent writers without torn final state", async () => {
    const target = join(dir, "shared.json");
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        atomicWriteFile(target, JSON.stringify({ v: i })),
      ),
    );
    const parsed = JSON.parse(await fs.readFile(target, "utf-8"));
    // Final file must be one complete write, never interleaved
    expect(Number.isInteger(parsed.v)).toBe(true);
  });
});
