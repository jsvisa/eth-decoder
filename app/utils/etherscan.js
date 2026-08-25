const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const ROUTESCAN_API_BASE = "https://api.routescan.io/v2/network/mainnet/evm";

function pickApiKey(keys) {
  if (!keys) return "";
  const list = String(keys)
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (list.length === 0) return "";
  return list[Math.floor(Math.random() * list.length)];
}

function fileNameFromSource(source) {
  const firstLine = source.split("\n")[0].trim();
  const m = firstLine.match(/\/\/\s*File:\s*(\S+)/);
  return m ? m[1] : null;
}

function parseEtherscanSourceCode(sourceCode, fallbackFileName) {
  if (!sourceCode || sourceCode === "Contract source code not verified") {
    return null;
  }

  const trimmed = sourceCode.trim();

  if (trimmed.startsWith("{{")) {
    try {
      const parsed = JSON.parse(trimmed.slice(1, -1));
      if (parsed && typeof parsed === "object") {
        const sources = {};
        for (const [file, info] of Object.entries(parsed)) {
          sources[file] = typeof info === "object" ? info.content || "" : info;
        }
        return sources;
      }
    } catch {
      // fall through to raw source
    }
  } else if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const sources = {};
        for (const [file, info] of Object.entries(parsed)) {
          sources[file] = typeof info === "object" ? info.content || "" : info;
        }
        return sources;
      }
    } catch {
      // fall through to raw source
    }
  }

  const file =
    fileNameFromSource(sourceCode) || fallbackFileName || "Contract.sol";
  return { [file]: sourceCode };
}

export {
  ETHERSCAN_V2_API,
  ROUTESCAN_API_BASE,
  pickApiKey,
  parseEtherscanSourceCode,
};
