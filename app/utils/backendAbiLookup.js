// app/utils/backendAbiLookup.js
export async function lookupFunctionCandidates(selector) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return [];

  try {
    const params = new URLSearchParams({ sign: selector });
    const response = await fetch(`${backendUrl}/api/v1/query?${params}`);
    if (!response.ok) return [];
    const json = await response.json();
    if (json?.msg !== "ok" || !Array.isArray(json.data)) return [];
    return json.data;
  } catch {
    return [];
  }
}

export async function lookupEventCandidates(topic0) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return [];

  try {
    const params = new URLSearchParams({ sign: topic0 });
    const response = await fetch(`${backendUrl}/api/v1/query-event?${params}`);
    if (!response.ok) return [];
    const json = await response.json();
    if (json?.msg !== "ok" || !Array.isArray(json.data)) return [];
    return json.data;
  } catch {
    return [];
  }
}
