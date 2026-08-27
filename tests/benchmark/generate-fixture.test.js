import { describe, it } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { decodeFunctionData, encodeFunctionData } from "viem";

// One-off generator for tests/benchmark/__fixtures__/worldchain-swap.json.
//
// Run with:
//   GEN_FIXTURE=1 SIM_BENCH_RPC_URL=<worldchain rpc> \
//     npx vitest run --project benchmark tests/benchmark/generate-fixture.test.js
//
// Calldata source: a live li.quest quote (across bridge, worldchain → OP
// mainnet, native ETH → USDC). The same selector/function the contract-caller
// page exercises: swapAndStartBridgeTokensViaAcrossV4 on the LiFi diamond.
// Only `fillDeadline` inside AcrossV4Data is patched to +30 days so the pinned
// calldata does not expire; everything else is byte-identical to the quote.
// A block number is pinned so every variant replays identical state.
// Secrets (RPC URLs, API keys) are never written to the fixture.

const LI_FI_QUOTE_URL =
  "https://li.quest/v1/quote?fromChain=480&toChain=10" +
  "&fromToken=0x0000000000000000000000000000000000000000&toToken=USDC" +
  "&fromAmount=1373240000000000" +
  "&fromAddress=0x00eF17D98Ca5AcF523379CFdf006B739cCF46297" +
  "&slippage=0.005&order=FASTEST";

const ACROSS_V4_DATA = [
  { name: "receiverAddress", type: "bytes32" },
  { name: "refundAddress", type: "bytes32" },
  { name: "sendingAssetId", type: "bytes32" },
  { name: "receivingAssetId", type: "bytes32" },
  { name: "outputAmount", type: "uint256" },
  { name: "outputAmountMultiplier", type: "uint128" },
  { name: "exclusiveRelayer", type: "bytes32" },
  { name: "quoteTimestamp", type: "uint32" },
  { name: "fillDeadline", type: "uint32" },
  { name: "exclusivityParameter", type: "uint32" },
  { name: "message", type: "bytes" },
];
const BRIDGE_DATA = [
  { name: "transactionId", type: "bytes32" },
  { name: "bridge", type: "string" },
  { name: "integrator", type: "string" },
  { name: "referrer", type: "address" },
  { name: "sendingAssetId", type: "address" },
  { name: "receiver", type: "address" },
  { name: "minAmount", type: "uint256" },
  { name: "destinationChainId", type: "uint256" },
  { name: "hasSourceSwaps", type: "bool" },
  { name: "hasDestinationCall", type: "bool" },
];
const SWAP_DATA = [
  { name: "callTo", type: "address" },
  { name: "approveTo", type: "address" },
  { name: "sendingAssetId", type: "address" },
  { name: "receivingAssetId", type: "address" },
  { name: "fromAmount", type: "uint256" },
  { name: "callData", type: "bytes" },
  { name: "requiresDeposit", type: "bool" },
];
const SWAP_FN_ABI = [
  {
    type: "function",
    name: "swapAndStartBridgeTokensViaAcrossV4",
    stateMutability: "payable",
    inputs: [
      { name: "_bridgeData", type: "tuple", components: BRIDGE_DATA },
      { name: "_swapData", type: "tuple[]", components: SWAP_DATA },
      { name: "_acrossData", type: "tuple", components: ACROSS_V4_DATA },
    ],
    outputs: [],
  },
];

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error)
    throw new Error(`${method} failed: ${JSON.stringify(json.error)}`);
  return json.result;
}

describe("benchmark fixture generator", () => {
  it.skipIf(!process.env.GEN_FIXTURE)(
    "generates the pinned worldchain swap fixture",
    async () => {
      const rpcUrl = process.env.SIM_BENCH_RPC_URL;
      if (!rpcUrl) throw new Error("SIM_BENCH_RPC_URL is required");

      // 1. Live quote → guaranteed-valid calldata for the current diamond
      const quote = await (await fetch(LI_FI_QUOTE_URL)).json();
      const tr = quote.transactionRequest;
      if (!tr?.data)
        throw new Error(`quote failed: ${JSON.stringify(quote).slice(0, 200)}`);
      const to = tr.to;
      const from = tr.from;
      const valueWei = BigInt(tr.value).toString();

      // 2. Patch fillDeadline to +4 hours so the pinned calldata doesn't
      //    expire within a benchmark session (Across V4 rejects deltas
      //    beyond ~12h; observed empirically). Everything else is
      //    byte-identical to the quote.
      const decoded = decodeFunctionData({
        abi: SWAP_FN_ABI,
        data: tr.data,
      });
      const [bridgeData, swapData, acrossData] = decoded.args;
      // viem returns named tuples as objects; support both shapes
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 4 * 3600);
      const patchedAcross = Array.isArray(acrossData)
        ? acrossData.map((v, i) => (i === 8 ? deadline : v))
        : { ...acrossData, fillDeadline: deadline };
      const data = encodeFunctionData({
        abi: SWAP_FN_ABI,
        functionName: "swapAndStartBridgeTokensViaAcrossV4",
        args: [bridgeData, swapData, patchedAcross],
      });

      // 3. Sanity-check the patched calldata against the live chain, pin block.
      //    The sender may be unfunded on-chain (the app funds it via balance
      //    overrides), so eth_call uses a state override for balance.
      const tag = await rpc(rpcUrl, "eth_blockNumber", []);
      const block = BigInt(tag);
      const TEN_ETH = `0x${(10n ** 19n).toString(16)}`;
      const [senderBalance, callResult] = await Promise.all([
        rpc(rpcUrl, "eth_getBalance", [from, tag]),
        rpc(rpcUrl, "eth_call", [
          { to, from, data, value: `0x${BigInt(valueWei).toString(16)}` },
          tag,
          { [from]: { balance: TEN_ETH } },
        ]),
      ]);

      const fixture = {
        generatedAt: new Date().toISOString(),
        chainId: 480,
        chainName: "worldchain",
        block: block.toString(),
        to,
        from,
        valueWei,
        functionName: "swapAndStartBridgeTokensViaAcrossV4",
        data,
        abi: SWAP_FN_ABI,
        quoteTool: (quote.toolDetails || {}).key || null,
        sanity: {
          senderBalanceWei: BigInt(senderBalance).toString(),
          // empty return data ("0x") is success — the function has no outputs
          ethCallOk: typeof callResult === "string",
          ethCallPreview: (callResult || "").slice(0, 66),
        },
      };
      if (!fixture.sanity.ethCallOk) {
        throw new Error(
          `sanity eth_call failed at block ${block}: ${fixture.sanity.ethCallPreview}`,
        );
      }

      await mkdir(new URL("./__fixtures__/", import.meta.url), {
        recursive: true,
      });
      await writeFile(
        new URL("./__fixtures__/worldchain-swap.json", import.meta.url),
        JSON.stringify(fixture, null, 2) + "\n",
      );
      console.log("fixture written:", {
        block: fixture.block,
        dataLength: data.length,
        sanity: fixture.sanity,
      });
    },
    120_000,
  );
});
