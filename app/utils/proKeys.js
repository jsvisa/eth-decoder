const PRO_API_KEYS = (process.env.PRO_API_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

let _config = null;

function parseConfig() {
  if (_config) return _config;
  const raw = process.env.PRO_RPC_CONFIG;
  if (!raw) return null;
  try {
    const json = JSON.parse(
      typeof Buffer !== "undefined"
        ? Buffer.from(raw, "base64").toString("utf-8")
        : atob(raw),
    );
    _config = json;
    return json;
  } catch {
    return null;
  }
}

export function getProRpcUrl(apiKey, chainId) {
  if (!apiKey || !PRO_API_KEYS.length) return null;
  if (!PRO_API_KEYS.includes(apiKey)) return null;
  const config = parseConfig();
  if (!config) return null;
  return config[String(chainId)] || null;
}

export function isProApiKey(apiKey) {
  if (!apiKey || !PRO_API_KEYS.length) return false;
  return PRO_API_KEYS.includes(apiKey);
}
