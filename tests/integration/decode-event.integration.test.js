import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/decode-event/route.js";

const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function makeRequest(params) {
  const url = new URL("http://localhost/api/decode-event");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

describe("GET /api/decode-event (integration)", () => {
  it("returns 400 when sign is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sign/i);
  });

  it("decodes a Transfer event log", async () => {
    const res = await GET(
      makeRequest({
        sign: TRANSFER_EVENT_TOPIC,
        topics: `${TRANSFER_EVENT_TOPIC},0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045,0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`,
        data: "0x0000000000000000000000000000000000000000000000000000000000000064",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data).toBeTruthy();
    expect(body.data.inputs).toBeTruthy();
    expect(body.data.args).toBeDefined();
  }, 15000);

  it("decodes event log with detected source", async () => {
    const res = await GET(
      makeRequest({
        sign: TRANSFER_EVENT_TOPIC,
        topics: `${TRANSFER_EVENT_TOPIC},0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045,0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`,
        data: "0x0000000000000000000000000000000000000000000000000000000000000064",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(["sourcify", "cfd1"]).toContain(body.data.source);
  }, 15000);
});
