import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../../app/api/cleanup-blobs/route.js";
import { blobList, blobDelete } from "../../app/utils/blobCache.js";

vi.mock("../../app/utils/blobCache.js", () => ({
  blobList: vi.fn(),
  blobDelete: vi.fn(),
}));

const MB = 1_000_000;
const SIZE_LIMIT = 1_000 * MB; // mirrors route constant SIZE_LIMIT

// The route lists three prefixes and merges the results, so mocks must be
// prefix-aware or every blob gets counted once per prefix.
function mockBlobStore({ simulations = [], abis = [], signatures = [] } = {}) {
  vi.mocked(blobList).mockImplementation((prefix) => {
    if (prefix === "simulations/") return Promise.resolve(simulations);
    if (prefix === "abis/") return Promise.resolve(abis);
    if (prefix === "signatures/") return Promise.resolve(signatures);
    return Promise.resolve([]);
  });
}

function makeRequest(cronHeader) {
  const headers = new Headers();
  if (cronHeader !== undefined) headers.set("x-vercel-cron", cronHeader);
  return { headers };
}

describe("GET /api/cleanup-blobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(blobDelete).mockResolvedValue(undefined);
  });

  describe("authentication", () => {
    it.each([undefined, "", "0", "true"])(
      "returns 401 when the x-vercel-cron header is %p",
      async (headerValue) => {
        const res = await GET(makeRequest(headerValue));

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "Unauthorized" });
        expect(blobList).not.toHaveBeenCalled();
      },
    );

    it('proceeds when the header is exactly "1"', async () => {
      mockBlobStore();

      const res = await GET(makeRequest("1"));

      expect(res.status).toBe(200);
    });
  });

  describe("aggregation across prefixes", () => {
    it("lists simulations/, abis/ and signatures/ prefixes", async () => {
      mockBlobStore();

      await GET(makeRequest("1"));

      expect(blobList).toHaveBeenCalledTimes(3);
      expect(blobList).toHaveBeenNthCalledWith(1, "simulations/");
      expect(blobList).toHaveBeenNthCalledWith(2, "abis/");
      expect(blobList).toHaveBeenNthCalledWith(3, "signatures/");
    });

    it("sums sizes across all prefixes exactly once per blob", async () => {
      mockBlobStore({
        simulations: [
          { url: "s1", size: 300 * MB, uploadedAt: "2024-01-01T00:00:00Z" },
        ],
        abis: [
          { url: "a1", size: 250 * MB, uploadedAt: "2024-02-01T00:00:00Z" },
        ],
        signatures: [
          { url: "g1", size: 100 * MB, uploadedAt: "2024-03-01T00:00:00Z" },
        ],
      });

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body.totalSize).toBe(650 * MB);
    });
  });

  describe("under-threshold short circuit", () => {
    it("reports and deletes nothing below the threshold", async () => {
      mockBlobStore({
        simulations: [
          { url: "s1", size: 400 * MB, uploadedAt: "2024-01-01T00:00:00Z" },
        ],
        abis: [
          { url: "a1", size: 449 * MB, uploadedAt: "2024-02-01T00:00:00Z" },
        ],
        signatures: [
          { url: "g1", size: 50 * MB, uploadedAt: "2024-03-01T00:00:00Z" },
        ],
      }); // total 899MB

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body).toEqual({
        totalSize: 899 * MB,
        deleted: 0,
        message: "Under threshold, no cleanup needed",
      });
      expect(blobDelete).not.toHaveBeenCalled();
    });

    it("treats a total equal to the threshold as over-threshold (strict <)", async () => {
      mockBlobStore({
        abis: [
          { url: "exact", size: 900 * MB, uploadedAt: "2024-01-01T00:00:00Z" },
        ],
      }); // 900MB == CLEANUP_THRESHOLD -> `900 < 900` is false -> delete branch,
      // where nothing needs removing because remaining <= SIZE_LIMIT already.

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body.totalSize).toBe(900 * MB);
      expect(body.deleted).toBe(0);
      expect(blobDelete).not.toHaveBeenCalled();
    });

    it("handles an empty store (0 bytes)", async () => {
      mockBlobStore();

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body.totalSize).toBe(0);
      expect(body.deleted).toBe(0);
    });
  });

  describe("deletion pass over the threshold", () => {
    it("does not delete when the total sits exactly at SIZE_LIMIT", async () => {
      mockBlobStore({
        simulations: [
          { url: "old-a", size: 500 * MB, uploadedAt: "2024-01-01T00:00:00Z" },
        ],
        abis: [
          { url: "old-b", size: 500 * MB, uploadedAt: "2024-02-01T00:00:00Z" },
        ],
      }); // total 1000MB == SIZE_LIMIT: `remaining <= SIZE_LIMIT` breaks immediately

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body.deleted).toBe(0);
      expect(blobDelete).not.toHaveBeenCalled();
      // No "remainingSize"/"message" fields on this response shape beyond size.
    });

    it("deletes oldest-first, just enough to drop to or below the limit", async () => {
      mockBlobStore({
        simulations: [
          {
            url: "oldest-a",
            size: 200 * MB,
            uploadedAt: "2024-01-01T00:00:00Z",
          },
          {
            url: "oldest-b",
            size: 200 * MB,
            uploadedAt: "2024-01-02T00:00:00Z",
          },
          { url: "newest", size: 700 * MB, uploadedAt: "2024-05-01T00:00:00Z" },
        ],
      }); // total 1100MB -> deleting oldest-a leaves 900MB

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body.totalSize).toBe(1_100 * MB);
      expect(body.deleted).toBe(1);
      expect(blobDelete).toHaveBeenCalledTimes(1);
      expect(blobDelete).toHaveBeenCalledWith(["oldest-a"]);
      expect(body.remainingSize).toBe(900 * MB);
    });

    it("loops through several small blobs until under the limit", async () => {
      const tinyBlobs = Array.from({ length: 20 }, (_, i) => ({
        url: `tiny-${i}`,
        size: 50 * MB,
        uploadedAt: new Date(Date.UTC(2024, 0, i + 1)).toISOString(),
      }));
      mockBlobStore({
        simulations: [
          ...tinyBlobs,
          ...tinyBlobs.map((b, i) => ({
            ...b,
            url: `big-${i}`,
            size: 50 * MB,
            uploadedAt: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
          })),
        ],
      }); // 40 × 50MB = 2000MB total

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      // Need remaining <= 1000MB, so free 1000+MB via 20 smallest.
      expect(body.deleted).toBeGreaterThanOrEqual(20);
      expect(body.remainingSize).toBeLessThanOrEqual(SIZE_LIMIT);
    });

    it("passes exactly the deleted urls to one blobDelete call", async () => {
      mockBlobStore({
        simulations: [
          { url: "one", size: 600 * MB, uploadedAt: "2024-01-01T00:00:00Z" },
          { url: "two", size: 500 * MB, uploadedAt: "2024-02-01T00:00:00Z" },
        ],
      }); // 1100MB -> delete "one"

      await GET(makeRequest("1"));

      expect(blobDelete).toHaveBeenCalledTimes(1);
      expect(vi.mocked(blobDelete).mock.calls[0][0]).toEqual(["one"]);
    });
  });

  describe("edge cases", () => {
    it("survives unparseable uploadedAt values during sorting", async () => {
      mockBlobStore({
        simulations: [
          { url: "broken-date", size: 450 * MB, uploadedAt: "not-a-timestamp" },
          { url: "ok-old", size: 450 * MB, uploadedAt: "2024-01-01T00:00:00Z" },
        ],
        abis: [
          { url: "ok-new", size: 100 * MB, uploadedAt: "2025-01-01T00:00:00Z" },
        ],
      }); // total 1000MB == SIZE_LIMIT again -> nothing deleted either way

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body.totalSize).toBe(1_000 * MB);
      expect(res.status).toBe(200);
    });

    it("deletes across prefixes together in one upload-date ordering", async () => {
      mockBlobStore({
        simulations: [
          {
            url: "mid-sim",
            size: 800 * MB,
            uploadedAt: "2024-03-01T00:00:00Z",
          },
        ],
        abis: [
          {
            url: "old-abi",
            size: 250 * MB,
            uploadedAt: "2024-01-01T00:00:00Z",
          },
        ],
        signatures: [
          {
            url: "new-sig",
            size: 100 * MB,
            uploadedAt: "2024-06-01T00:00:00Z",
          },
        ],
      }); // total 1150MB -> delete old-abi -> 900MB remains

      const res = await GET(makeRequest("1"));
      const body = await res.json();

      expect(body.deleted).toBe(1);
      expect(blobDelete).toHaveBeenCalledWith(["old-abi"]);
      expect(body.remainingSize).toBe(900 * MB);
    });

    it("propagates blob store read failures as a 500 from Next", async () => {
      vi.mocked(blobList).mockRejectedValue(new Error("blob store down"));

      await expect(GET(makeRequest("1"))).rejects.toThrow("blob store down");
    });

    it("propagates deletion failures to the caller", async () => {
      mockBlobStore({
        simulations: [
          { url: "one", size: 600 * MB, uploadedAt: "2024-01-01T00:00:00Z" },
          { url: "two", size: 500 * MB, uploadedAt: "2024-02-01T00:00:00Z" },
        ],
      });
      vi.mocked(blobDelete).mockRejectedValue(new Error("delete failed"));

      await expect(GET(makeRequest("1"))).rejects.toThrow("delete failed");
    });
  });
});
