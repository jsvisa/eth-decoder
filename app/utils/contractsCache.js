export const ABI_CACHE_PREFIX = "abi-";

// Parse a single CSV line, handling quoted fields (including escaped "" for a literal quote)
export const parseCSVLine = (line) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

// Wrap a value in double quotes if it contains commas, quotes, or newlines
export const escapeCSVField = (value) => {
  const str = String(value ?? "");
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

// Export a list of cached contracts to a CSV string.
// Each contract must have a `key` (the localStorage key) so the full ABI can be retrieved.
export const exportContractsToCSV = (contractsList) => {
  const headers = [
    "chain",
    "address",
    "contractName",
    "implContractName",
    "implAddress",
    "isProxy",
    "timestamp",
    "abi",
  ];
  const rows = contractsList.map((contract) => {
    let cached = {};
    try {
      cached = JSON.parse(localStorage.getItem(contract.key) || "{}");
    } catch {}
    return [
      contract.chain,
      contract.address,
      contract.contractName || "",
      contract.implContractName || "",
      contract.implAddress || "",
      contract.isProxy ? "true" : "false",
      contract.timestamp || "",
      JSON.stringify(cached.abi || []),
    ]
      .map(escapeCSVField)
      .join(",");
  });
  return [headers.join(","), ...rows].join("\n");
};

// Parse a CSV string and return an array of importable contract entries.
// Each entry contains `key` (the localStorage key to write) and `data` (the object to store).
export const importContractsFromCSV = (csvContent) => {
  const lines = csvContent
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const get = (name) => {
      const idx = headers.indexOf(name);
      return idx !== -1 ? (row[idx] || "").trim() : "";
    };

    const chain = get("chain");
    const address = get("address");
    if (!chain || !address) continue;

    let abi = [];
    try {
      const abiStr = get("abi");
      if (abiStr) abi = JSON.parse(abiStr);
    } catch {}

    results.push({
      key: `${ABI_CACHE_PREFIX}${chain}-${address}`,
      chain,
      address,
      data: {
        contractName: get("contractname"),
        implContractName: get("implcontractname"),
        implAddress: get("impladdress"),
        isProxy: get("isproxy") === "true",
        timestamp: parseInt(get("timestamp")) || Date.now(),
        abi,
      },
    });
  }
  return results;
};
