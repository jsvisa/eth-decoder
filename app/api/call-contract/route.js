import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  decodeFunctionResult,
  encodeFunctionData,
  defineChain,
} from "viem";
import { isValidEthAddress } from "../../utils/validation";
import { normalizeArg, ArgValidationError } from "../../utils/normalizeArg";
import { VIEM_CHAINS, DEFAULT_RPC_URLS } from "../../utils/chains";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      chain,
      address,
      functionName,
      args,
      abi,
      fromAddress,
      simulate,
      rpcUrl: customRpcUrl,
      blockNumber,
      chainId: customChainId,
      callData: rawCallData,
    } = body;

    if (!address || !functionName || !abi) {
      return NextResponse.json(
        { error: "Missing required parameters: address, functionName, abi" },
        { status: 400 },
      );
    }

    // Validate address format
    if (!isValidEthAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 },
      );
    }

    // Validate fromAddress if provided
    if (fromAddress && !isValidEthAddress(fromAddress)) {
      return NextResponse.json(
        { error: "Invalid from address format" },
        { status: 400 },
      );
    }

    // Get chain config - either from built-in chains or create a custom one
    let chainConfig = VIEM_CHAINS[chain];
    let rpcUrl = customRpcUrl || DEFAULT_RPC_URLS[chain];

    // Handle custom chains (chain IDs starting with "chain-")
    if (!chainConfig && customChainId && customRpcUrl) {
      // Create a custom chain config for non-built-in chains
      chainConfig = defineChain({
        id: customChainId,
        name: chain,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: {
          default: { http: [customRpcUrl] },
        },
      });
      rpcUrl = customRpcUrl;
    }

    if (!chainConfig || !rpcUrl) {
      return NextResponse.json(
        {
          error: `Unsupported chain: ${chain}. Please configure an RPC URL for this chain.`,
        },
        { status: 400 },
      );
    }

    // Find the function in ABI — supports both plain name and full signature (e.g. "transfer(address,uint256)")
    const functionAbi = abi.find((item) => {
      if (item.type !== "function") return false;
      if (functionName.includes("(")) {
        const types = item.inputs?.map((i) => i.type).join(",") || "";
        return `${item.name}(${types})` === functionName;
      }
      return item.name === functionName;
    });

    if (!functionAbi) {
      return NextResponse.json(
        { error: `Function ${functionName} not found in ABI` },
        { status: 400 },
      );
    }

    // Create client
    const client = createPublicClient({
      chain: chainConfig,
      transport: http(rpcUrl),
    });

    // Encode function data (or use raw calldata if provided)
    let data;
    if (rawCallData) {
      data = rawCallData;
    } else {
      const parsedArgs = (args || []).map((arg, index) => {
        const input = functionAbi.inputs[index];
        if (!input) return arg;
        return normalizeArg(arg, input.type, input.components);
      });
      data = encodeFunctionData({
        abi: [functionAbi],
        functionName: functionAbi.name,
        args: parsedArgs,
      });
    }

    // Make the call (works for both read and simulate)
    const callParams = {
      to: address,
      data,
    };

    // Add from address if provided (useful for simulating write functions)
    if (fromAddress) {
      callParams.account = fromAddress;
    }

    // Add block number if provided (for historical state queries)
    if (blockNumber) {
      callParams.blockNumber = BigInt(blockNumber);
    }

    const result = await client.call(callParams);

    // Decode the result
    const decoded = decodeFunctionResult({
      abi: [functionAbi],
      functionName: functionAbi.name,
      data: result.data,
    });

    // Convert BigInt to string for JSON serialization
    const serializeResult = (value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (Array.isArray(value)) {
        return value.map(serializeResult);
      }
      if (value && typeof value === "object") {
        const serialized = {};
        for (const key in value) {
          serialized[key] = serializeResult(value[key]);
        }
        return serialized;
      }
      return value;
    };

    // Build decoded output with names and types
    const outputs = functionAbi.outputs || [];
    let decodedOutputs = [];

    if (outputs.length === 1) {
      // Single return value
      decodedOutputs = [
        {
          name: outputs[0].name || "result",
          type: outputs[0].type,
          value: serializeResult(decoded),
        },
      ];
    } else if (outputs.length > 1) {
      // Multiple return values (tuple)
      decodedOutputs = outputs.map((output, index) => ({
        name: output.name || `output${index}`,
        type: output.type,
        value: serializeResult(
          Array.isArray(decoded) ? decoded[index] : decoded[output.name],
        ),
      }));
    }

    return NextResponse.json({
      rawData: result.data,
      decoded: decodedOutputs,
      result: serializeResult(decoded),
      simulated: simulate || false,
    });
  } catch (error) {
    if (error instanceof ArgValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Call contract error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to call contract" },
      { status: 500 },
    );
  }
}
