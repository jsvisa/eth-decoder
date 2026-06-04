const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";

export const BUILT_IN_CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
};

export async function fetchContractInfoFromEtherscan(address, chainId, apiKey) {
  try {
    const params = new URLSearchParams({
      chainid: chainId,
      module: "contract",
      action: "getsourcecode",
      address,
      apikey: apiKey || "",
    });

    const response = await fetch(`${ETHERSCAN_V2_API}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== "1" || !data.result?.[0]) return null;

    const result = data.result[0];
    const abi =
      result.ABI && result.ABI !== "Contract source code not verified"
        ? JSON.parse(result.ABI)
        : null;

    return {
      abi,
      contractName: result.ContractName || null,
      isProxy: result.Proxy === "1",
      implementation: result.Implementation || null,
      source: "etherscan",
    };
  } catch {
    return null;
  }
}

export async function fetchContractInfoFromSourcify(address, chainId) {
  try {
    const checkRes = await fetch(
      `https://sourcify.dev/server/check-by-addresses?addresses=${address}&chainIds=${chainId}`,
    );
    if (!checkRes.ok) return null;

    const checkData = await checkRes.json();
    const match = checkData?.[0]?.chainIds?.find(
      (c) => c.chainId === String(chainId),
    );
    if (!match || (match.status !== "perfect" && match.status !== "partial")) {
      return null;
    }

    const filesRes = await fetch(
      `https://sourcify.dev/server/files/${chainId}/${address}`,
    );
    if (!filesRes.ok) return null;

    const filesData = await filesRes.json();
    const metadataFile = filesData.files?.find(
      (f) => f.name === "metadata.json",
    );
    if (!metadataFile?.content) return null;

    const metadata = JSON.parse(metadataFile.content);
    const abi = metadata.output?.abi;
    if (!abi) return null;

    const contractName = metadata.settings?.compilationTarget
      ? Object.values(metadata.settings.compilationTarget)[0]
      : null;

    return { abi, contractName, source: "sourcify" };
  } catch {
    return null;
  }
}

/**
 * Fetch contract ABI, trying Sourcify first then Etherscan.
 * Used in the decode pipeline where Sourcify is the preferred source.
 */
export async function fetchContractAbi(address, chainId, apiKey) {
  const sourcify = await fetchContractInfoFromSourcify(address, chainId);
  if (sourcify?.abi) return sourcify;

  const etherscan = await fetchContractInfoFromEtherscan(
    address,
    chainId,
    apiKey,
  );
  if (etherscan?.abi) return etherscan;

  return null;
}

/**
 * Fetch contract ABI, trying Etherscan first then Sourcify.
 * Used in the fetch-abi route where Etherscan gives richer metadata (proxy info).
 */
export async function fetchContractInfo(address, chainId, apiKey) {
  const etherscan = await fetchContractInfoFromEtherscan(
    address,
    chainId,
    apiKey,
  );
  if (etherscan?.abi) return etherscan;

  const sourcify = await fetchContractInfoFromSourcify(address, chainId);
  if (sourcify?.abi) return sourcify;

  return etherscan; // may have contractName even without ABI
}
