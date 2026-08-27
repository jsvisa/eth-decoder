import dns from "node:dns";
import { isValidHttpUrl } from "./validation";

/**
 * Server-side guard against SSRF via user-supplied RPC URLs.
 *
 * isValidHttpUrl only checks the protocol; this module additionally rejects
 * hosts that resolve to loopback / private / link-local addresses so the
 * server cannot be used to reach internal networks or cloud metadata
 * endpoints (e.g. http://169.254.169.254/).
 *
 * Set ALLOW_PRIVATE_RPC=true to disable these checks (useful when running
 * against a local devnet such as anvil/hardhat).
 */

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n > 255)) {
    return true; // unparseable — treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 reserved
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  return false;
}

function isPrivateIPv6(rawIp) {
  let ip = rawIp.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);

  if (ip === "::" || ip === "::1") return true;

  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms
  const mapped = ip.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);

  const firstWord = parseInt(ip.split(":")[0], 16);
  if (!Number.isNaN(firstWord)) {
    // fe80::/10 link-local
    if ((firstWord & 0xffc0) === 0xfe80) return true;
    // fc00::/7 unique local addresses
    if ((firstWord & 0xfe00) === 0xfc00) return true;
  }
  return false;
}

export function isPrivateAddress(ip) {
  if (ip.includes(":")) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

/**
 * Validate that `value` is an http(s) URL pointing at a host we are allowed
 * to contact from the server: not localhost, not an IP literal in a
 * private/reserved range, and not a hostname resolving to one.
 *
 * @param {string} value - user-supplied RPC URL
 * @returns {Promise<boolean>}
 */
export async function isSafeRpcUrl(value) {
  if (!isValidHttpUrl(value)) return false;
  if (process.env.ALLOW_PRIVATE_RPC === "true") return true;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;

  // IP literals are checked directly; hostnames go through DNS resolution
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return !isPrivateAddress(host);
  }

  let resolved;
  try {
    resolved = await dns.promises.lookup(host, { all: true });
  } catch {
    return false; // unresolvable host — the fetch would fail anyway
  }
  return resolved.every(({ address }) => !isPrivateAddress(address));
}
