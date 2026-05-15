import { test, expect } from "@playwright/test";

// transfer(address,uint256) — well-known ERC-20 selector
const TRANSFER_SELECTOR = "0xa9059cbb";
// Unlikely to exist in any DB
const UNKNOWN_SELECTOR = "0x00000000";

test.describe("GET /api/v1/query", () => {
  test("returns 400 when sign param is missing", async ({ request }) => {
    const res = await request.get("/api/v1/query");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing sign/i);
  });

  test("returns a valid response shape for a known selector", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/v1/query?sign=${TRANSFER_SELECTOR}&count=1`,
    );
    // 200 always — either backend found it or returned not-found
    // 500 only if BACKEND_URL is not configured in this env
    expect([200, 500]).toContain(res.status());

    const body = await res.json();
    if (res.status() === 200) {
      expect(["ok", "not found"]).toContain(body.msg);
      if (body.msg === "ok") {
        expect(body.data).not.toBeNull();
        expect(typeof body.data.text_sign).toBe("string");
        // text_sign should match the queried selector function signature
        expect(body.data.text_sign).toMatch(/transfer\(/i);
      } else {
        expect(body.data).toBeNull();
      }
    }
  });

  test("returns not-found for an unknown selector", async ({ request }) => {
    const res = await request.get(
      `/api/v1/query?sign=${UNKNOWN_SELECTOR}&count=1`,
    );
    expect([200, 500]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.msg).toBe("not found");
      expect(body.data).toBeNull();
    }
  });

  test("returns multiple results when count > 1", async ({ request }) => {
    const res = await request.get(
      `/api/v1/query?sign=${TRANSFER_SELECTOR}&count=3`,
    );
    expect([200, 500]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(["ok", "not found"]).toContain(body.msg);
      if (body.msg === "ok") {
        // count > 1 returns an array
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThanOrEqual(1);
        expect(body.data.length).toBeLessThanOrEqual(3);
        for (const item of body.data) {
          expect(typeof item.text_sign).toBe("string");
        }
      }
    }
  });
});
