export function buildSimulationLink(request, simulationId) {
  const origin = new URL(request.url || "http://localhost").origin;
  const url = new URL("/", origin);
  url.searchParams.set("simulationId", simulationId);
  return url.toString();
}
