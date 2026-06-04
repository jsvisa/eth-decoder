// Known multicall function selectors (keccak256(sig)[0:4]).
// Covers all 4 decoder types: bytes_array, tuple_array, universal_router, parallel_arrays.
export const MULTICALL_SELECTORS = new Set([
  "0xac9650d8", // multicall(bytes[])                                    — bytes_array
  "0x60fc8466", // multicall((bool,bytes)[])                             — tuple_array
  "0x374f435d", // multicall((address,bytes,uint256,bool,bytes32)[])     — tuple_array
  "0x82ad56cb", // aggregate3((address,bool,bytes)[])                    — tuple_array (Multicall3)
  "0x24856bc3", // execute(bytes,bytes[])                                — universal_router
  "0x3593564c", // execute(bytes,bytes[],uint256)                        — universal_router
]);

export function isMulticallData(data) {
  const hex = data.trim().toLowerCase();
  const raw = hex.startsWith("0x") ? hex : "0x" + hex;
  return raw.length >= 10 && MULTICALL_SELECTORS.has(raw.slice(0, 10));
}
