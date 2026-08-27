import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DNS resolution so hostname-based cases are deterministic.
vi.mock("node:dns", () => ({
  default: {
    promises: {
      lookup: vi.fn(async (host) => {
        if (RESOLVED[host]) return RESOLVED[host];
        throw Object.assign(new Error(`ENOTFOUND ${host}`), {
          code: "ENOTFOUND",
        });
      }),
    },
  },
}));

let RESOLVED = {};

const { isSafeRpcUrl, isPrivateAddress } =
  await import("../../app/utils/ssrfGuard.js");

beforeEach(() => {
  RESOLVED = {};
  delete process.env.ALLOW_PRIVATE_RPC;
});

afterEach(() => {
  delete process.env.ALLOW_PRIVATE_RPC;
});

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.0.0.5", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["198.18.0.9", true],
    ["8.8.8.8", false],
    ["52.14.99.200", false],
    ["172.32.0.1", false],
  ])("IPv4 %s → private=%s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });

  it.each([
    ["::1", true],
    ["::", true],
    ["fe80::1", true],
    ["fd00::1", true],
    ["fc00::abcd", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:8.8.8.8", false],
    ["2606:4700:4700::1111", false],
  ])("IPv6 %s → private=%s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe("isSafeRpcUrl", () => {
  it("accepts a normal public https RPC URL", async () => {
    RESOLVED["eth-mainnet.g.alchemy.com"] = [
      { address: "104.18.7.42", family: 4 },
    ];
    expect(await isSafeRpcUrl("https://eth-mainnet.g.alchemy.com/v2/key")).toBe(
      true,
    );
  });

  it("rejects a URL when ANY resolved address is private", async () => {
    RESOLVED["dual-homed.example.com"] = [
      { address: "104.18.7.42", family: 4 },
      { address: "192.168.0.9", family: 4 },
    ];
    expect(await isSafeRpcUrl("http://dual-homed.example.com")).toBe(false);
  });

  it("rejects non-http protocols and garbage", async () => {
    expect(await isSafeRpcUrl("ftp://example.com")).toBe(false);
    expect(await isSafeRpcUrl("file:///etc/passwd")).toBe(false);
    expect(await isSafeRpcUrl("not a url")).toBe(false);
    expect(await isSafeRpcUrl(undefined)).toBe(false);
  });

  it.each([
    "http://localhost:8545",
    "http://127.0.0.1:8545",
    "http://[::1]:8545",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1",
    "http://192.168.1.50:8545",
    "http://sub.localhost",
  ])("rejects loopback/private URL literal: %s", async (url) => {
    expect(await isSafeRpcUrl(url)).toBe(false);
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    RESOLVED["internal.example.com"] = [{ address: "10.1.2.3", family: 4 }];
    expect(await isSafeRpcUrl("http://internal.example.com:8545")).toBe(false);
  });

  it("rejects hostnames that fail to resolve", async () => {
    expect(await isSafeRpcUrl("http://no-such-host.invalid")).toBe(false);
  });

  it("rejects .local / .internal mDNS-style hostnames outright", async () => {
    expect(await isSafeRpcUrl("http://mybox.local")).toBe(false);
    expect(await isSafeRpcUrl("http://db.internal")).toBe(false);
  });

  it("allows private targets when ALLOW_PRIVATE_RPC=true", async () => {
    process.env.ALLOW_PRIVATE_RPC = "true";
    expect(await isSafeRpcUrl("http://localhost:8545")).toBe(true);
    expect(await isSafeRpcUrl("http://127.0.0.1:8545")).toBe(true);
  });
});
