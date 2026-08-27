import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// PRO_API_KEYS is captured when the module is first evaluated, so every
// scenario re-imports the module under a specific environment.
async function loadModule(env = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../../app/utils/proKeys.js");
}

describe("proKeys", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.PRO_API_KEYS;
    delete process.env.PRO_RPC_CONFIG;
  });

  afterEach(() => {
    delete process.env.PRO_API_KEYS;
    delete process.env.PRO_RPC_CONFIG;
  });

  describe("getProRpcUrl", () => {
    it("returns null without an API key", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://rpc1"}').toString("base64"),
      });

      expect(getProRpcUrl(null, 1)).toBeNull();
      expect(getProRpcUrl(undefined, 1)).toBeNull();
      expect(getProRpcUrl("", 1)).toBeNull();
    });

    it("returns null when no keys are configured", async () => {
      const { getProRpcUrl } = await loadModule({});

      expect(getProRpcUrl("k1", 1)).toBeNull();
    });

    it("returns null for whitespace-only / comma-only PRO_API_KEYS", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: " , ,, ",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://rpc1"}').toString("base64"),
      });

      // After trim+filter the configured list is empty.
      expect(getProRpcUrl("k1", 1)).toBeNull();
    });

    it("returns null when the key is not in the allow-list", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1,k2",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://rpc1"}').toString("base64"),
      });

      expect(getProRpcUrl("intruder", 1)).toBeNull();
    });

    it("is case-sensitive about keys", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "SecretKey",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://rpc1"}').toString("base64"),
      });

      expect(getProRpcUrl("secretkey", 1)).toBeNull();
    });

    it("returns null when PRO_RPC_CONFIG is missing", async () => {
      const { getProRpcUrl } = await loadModule({ PRO_API_KEYS: "k1" });

      expect(getProRpcUrl("k1", 1)).toBeNull();
    });

    it("returns null when PRO_RPC_CONFIG is not valid base64 JSON", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1",
        PRO_RPC_CONFIG: Buffer.from("not json").toString("base64"),
      });

      expect(getProRpcUrl("k1", 1)).toBeNull();
    });

    it("returns null when the chain is absent from the config", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://rpc1"}').toString("base64"),
      });

      expect(getProRpcUrl("k1", 137)).toBeNull();
    });

    it("returns null when the configured RPC URL is empty", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1",
        PRO_RPC_CONFIG: Buffer.from('{"1":""}').toString("base64"),
      });

      expect(getProRpcUrl("k1", 1)).toBeNull();
    });

    it("returns the RPC URL for a listed key and numeric chainId", async () => {
      const config = { 1: "http://eth", 42161: "http://arb" };
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1, k2 ,k3",
        PRO_RPC_CONFIG: Buffer.from(JSON.stringify(config)).toString("base64"),
      });

      expect(getProRpcUrl("k1", 1)).toBe("http://eth");
      expect(getProRpcUrl("k2", 42161)).toBe("http://arb");
      expect(getProRpcUrl("k3", 999999)).toBeNull();
    });

    it("accepts string chainIds via String() coercion", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://rpc1"}').toString("base64"),
      });

      expect(getProRpcUrl("k1", "1")).toBe("http://rpc1");
    });
  });

  describe("isProApiKey", () => {
    it.each([null, undefined, "", "   "])(
      "rejects %p as a key",
      async (badKey) => {
        const { isProApiKey } = await loadModule({ PRO_API_KEYS: "k1" });

        expect(isProApiKey(badKey)).toBe(false);
      },
    );

    it("returns false with no keys configured", async () => {
      const { isProApiKey } = await loadModule({});

      expect(isProApiKey("anything")).toBe(false);
    });

    it("accepts any key from a trimmed comma-separated list", async () => {
      const { isProApiKey } = await loadModule({ PRO_API_KEYS: " k1 ,k2" });

      expect(isProApiKey("k1")).toBe(true);
      expect(isProApiKey("k2")).toBe(true);
      expect(isProApiKey(" k2")).toBe(false); // input itself isn't trimmed
      expect(isProApiKey("k3")).toBe(false);
    });

    it("does partial matches correctly (no substring hits)", async () => {
      const { isProApiKey } = await loadModule({
        PRO_API_KEYS: "short,longer",
      });

      expect(isProApiKey("long")).toBe(false);
      expect(isProApiKey("longer")).toBe(true);
    });
  });

  describe("config caching", () => {
    it("parses PRO_RPC_CONFIG once per module instance and keeps results stable", async () => {
      const { getProRpcUrl } = await loadModule({
        PRO_API_KEYS: "k1",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://first"}').toString("base64"),
      });

      const first = getProRpcUrl("k1", 1);

      // Mutate env — cached config wins over a changed value.
      process.env.PRO_RPC_CONFIG = Buffer.from(
        '{"1":"http://changed"}',
      ).toString("base64");

      expect(first).toBe("http://first");
      expect(getProRpcUrl("k1", 1)).toBe("http://first");

      // A fresh module instance parses anew.
      const fresh = await loadModule({
        PRO_API_KEYS: "k1",
        PRO_RPC_CONFIG: Buffer.from('{"1":"http://changed"}').toString(
          "base64",
        ),
      });
      expect(fresh.getProRpcUrl("k1", 1)).toBe("http://changed");
    });

    it("does not cache failed parses (a later good value still works)", async () => {
      const mod = await loadModule({ PRO_API_KEYS: "k1", PRO_RPC_CONFIG: "" });
      expect(mod.getProRpcUrl("k1", 1)).toBeNull();

      process.env.PRO_RPC_CONFIG = Buffer.from('{"1":"http://late"}').toString(
        "base64",
      );
      expect(mod.getProRpcUrl("k1", 1)).toBe("http://late");
    });
  });
});
