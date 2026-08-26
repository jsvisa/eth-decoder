import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { GET } from "../../app/api/query/route.js";

const TRANSFER_SELECTOR = "0xa9059cbb";
const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function makeRequest(params) {
  const url = new URL("http://localhost/api/query");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

const cacheDir = join(tmpdir(), `query-integration-test-${process.pid}`);

async function clearSigCache(...selectors) {
  const dir = join(cacheDir, "signatures");
  for (const sel of selectors) {
    try {
      await fs.unlink(join(dir, `${sel.toLowerCase()}.json`));
    } catch {
      // ignore missing files
    }
  }
}

describe("GET /api/query (integration)", () => {
  beforeAll(async () => {
    process.env.CACHE_DIR = cacheDir;
    await fs.mkdir(join(cacheDir, "signatures"), { recursive: true });
    await clearSigCache(TRANSFER_SELECTOR, TRANSFER_EVENT_TOPIC, "0xdead0001");
  });

  afterAll(async () => {
    delete process.env.CACHE_DIR;
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("returns 400 when sign is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing sign/i);
  });

  it("looks up a function selector via Sourcify", async () => {
    const res = await GET(makeRequest({ sign: TRANSFER_SELECTOR }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data).toBeTruthy();
    expect(body.data.text_sign).toBe("transfer(address,uint256)");
  }, 15000);

  it("looks up an event topic via Sourcify", async () => {
    const res = await GET(makeRequest({ sign: TRANSFER_EVENT_TOPIC }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data).toBeTruthy();
    expect(body.data.text_sign).toBe("Transfer(address,address,uint256)");
  }, 15000);

  it("returns not found for an unknown selector", async () => {
    const res = await GET(makeRequest({ sign: "0xdead0001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("not found");
    expect(body.data).toBeNull();
  }, 15000);
});
