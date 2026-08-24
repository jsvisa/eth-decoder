const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

if (!ALCHEMY_API_KEY) {
  console.error("ALCHEMY_API_KEY environment variable is required");
  process.exit(1);
}

const PRO_RPC_CUSTOM_OVERRIDES = process.env.PRO_RPC_CUSTOM_OVERRIDES || "";
const PRO_RPC_CONFIG = process.env.PRO_RPC_CONFIG || "";

function decodeBase64(str) {
  return typeof Buffer !== "undefined"
    ? Buffer.from(str, "base64").toString("utf-8")
    : atob(str);
}

function encodeBase64(str) {
  return typeof Buffer !== "undefined"
    ? Buffer.from(str).toString("base64")
    : btoa(str);
}

function maskKey(url) {
  return url.replace(ALCHEMY_API_KEY, "***");
}

let existingConfig = {};
try {
  if (PRO_RPC_CONFIG) {
    existingConfig = JSON.parse(decodeBase64(PRO_RPC_CONFIG));
  }
} catch {
  console.error("Failed to decode existing PRO_RPC_CONFIG, starting fresh");
}

let customOverrides = {};
try {
  if (PRO_RPC_CUSTOM_OVERRIDES) {
    customOverrides = JSON.parse(decodeBase64(PRO_RPC_CUSTOM_OVERRIDES));
  }
} catch {
  console.error("Failed to decode PRO_RPC_CUSTOM_OVERRIDES, ignoring");
}

async function main() {
  const res = await fetch(
    "https://www.alchemy.com/docs/reference/node-supported-chains.md",
  );
  if (!res.ok) {
    console.error(`Failed to fetch Alchemy docs: ${res.status}`);
    process.exit(1);
  }
  const text = await res.text();

  const urlRegex = /\|\s*[^|]+\|\s*[^|]+\|\s*(https:\/\/[^\s|]+)\s*\|/g;
  const urls = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[1].trim();
    if (url.includes("API_KEY")) {
      urls.push(url.replace("API_KEY", ALCHEMY_API_KEY));
    }
  }

  const resolvedUrls = new Set(Object.values(existingConfig));
  const newUrls = [...new Set(urls)].filter(
    (url) => !resolvedUrls.has(url) && !url.includes("beacon") && !url.includes("starknet"),
  );

  console.error(
    `Found ${urls.length} Alchemy URLs, ${newUrls.length} new (${Object.keys(existingConfig).length} already resolved)`,
  );

  const results = { ...existingConfig };

  const CONCURRENCY = 20;
  for (let i = 0; i < newUrls.length; i += CONCURRENCY) {
    const batch = newUrls.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const rpcRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_chainId",
              params: [],
              id: 1,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!rpcRes.ok) return;
          const data = await rpcRes.json();
          if (data.result) {
            const chainId = parseInt(data.result, 16);
            if (!isNaN(chainId)) {
              results[String(chainId)] = url;
              console.error(`  Resolved chain ${chainId} -> ${maskKey(url)}`);
            }
          }
        } catch {
          // Non-EVM chain or unavailable, skip
        }
      }),
    );
  }

  for (const [chainId, url] of Object.entries(customOverrides)) {
    results[chainId] = url;
    console.error(`  Custom override: chain ${chainId} -> ${maskKey(url)}`);
  }

  const output = encodeBase64(JSON.stringify(results));
  console.log(output);
  console.error(`Done: ${Object.keys(results).length} chains in config`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});