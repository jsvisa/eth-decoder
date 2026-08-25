import { NextResponse } from "next/server";
import { isValidEthAddress } from "../../utils/validation";

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

function parseEtherscanSourceCode(sourceCode) {
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
    } catch {}
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
    } catch {}
  }

  return { "Contract.sol": sourceCode };
}

async function fetchFromEtherscan(address, chainId, apiKey) {
  const key = pickApiKey(apiKey);
  if (!key) return null;

  const params = new URLSearchParams({
    chainid: chainId,
    module: "contract",
    action: "getsourcecode",
    address: address,
    apikey: key,
  });

  const response = await fetch(`${ETHERSCAN_V2_API}?${params}`);
  if (!response.ok) return null;

  const data = await response.json();
  if (data.status !== "1" || !data.result || !data.result[0]) return null;

  const result = data.result[0];
  const sourceCode = parseEtherscanSourceCode(result.SourceCode);
  return {
    sourceCode,
    compilerVersion: result.CompilerVersion || null,
    source: "etherscan",
  };
}

async function fetchFromSourcify(address, chainId) {
  try {
    const response = await fetch(
      `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=sources,metadata`,
    );
    if (!response.ok) return null;

    const data = await response.json();
    const sources = data.sources
      ? Object.fromEntries(
          Object.entries(data.sources).map(([file, info]) => [
            file,
            typeof info === "object" ? info.content || "" : info,
          ]),
        )
      : null;

    return {
      sourceCode: sources,
      compilerVersion: data.metadata?.compiler?.version || null,
      source: "sourcify",
    };
  } catch {
    return null;
  }
}

async function fetchFromRouteScan(address, chainId, apiKey) {
  const key = pickApiKey(apiKey);
  const params = new URLSearchParams({
    module: "contract",
    action: "getsourcecode",
    address: address,
  });
  if (key) params.set("apikey", key);

  const url = `${ROUTESCAN_API_BASE}/${chainId}/etherscan/api?${params}`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (data.status !== "1" || !data.result || !data.result[0]) return null;

  const result = data.result[0];
  const sourceCode = parseEtherscanSourceCode(result.SourceCode);
  return {
    sourceCode,
    compilerVersion: result.CompilerVersion || null,
    source: "routescan",
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chain = searchParams.get("chain") || "ethereum";

    if (!address) {
      return NextResponse.json(
        { error: "Missing address parameter" },
        { status: 400 },
      );
    }

    if (!isValidEthAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 },
      );
    }

    const { BUILT_IN_CHAIN_IDS } = await import("../../utils/chains");
    const chainId = BUILT_IN_CHAIN_IDS[chain];
    if (!chainId) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
        { status: 400 },
      );
    }

    const etherscanApiKey =
      searchParams.get("etherscanApiKey") ||
      process.env.ETHERSCAN_API_KEY ||
      "";
    const routescanApiKey =
      searchParams.get("routescanApiKey") ||
      process.env.ROUTESCAN_API_KEY ||
      "";

    let result = null;

    if (etherscanApiKey) {
      result = await fetchFromEtherscan(address, chainId, etherscanApiKey);
      if (result?.sourceCode) {
        return NextResponse.json(result);
      }
    }

    result = await fetchFromSourcify(address, chainId);
    if (result?.sourceCode) {
      return NextResponse.json(result);
    }

    result = await fetchFromRouteScan(address, chainId, routescanApiKey);
    if (result?.sourceCode) {
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Source code not found" },
      { status: 404 },
    );
  } catch (error) {
    console.error("Fetch source error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch source code" },
      { status: 500 },
    );
  }
}
