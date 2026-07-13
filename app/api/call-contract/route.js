import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  decodeFunctionResult,
  encodeFunctionData,
} from "viem";
import { isValidEthAddress } from "../../utils/validation";
import { normalizeArg, ArgValidationError } from "../../utils/normalizeArg";
import {
  VIEM_CHAINS,
  DEFAULT_RPC_URLS,
  buildCustomChainConfig,
} from "../../utils/chains";
import {
  findFunctionInAbi,
  serializeBigInts,
} from "../../contract-caller/utils/functionArgs";

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
      const custom = buildCustomChainConfig(customChainId, customRpcUrl);
      chainConfig = custom.viemChain;
      rpcUrl = custom.rpcUrl;
    }

    if (!chainConfig || !rpcUrl) {
      return NextResponse.json(
        {
          error: `Unsupported chain: ${chain}. Please configure an RPC URL for this chain.`,
        },
        { status: 400 },
      );
    }

    const functionAbi = findFunctionInAbi(abi, functionName);
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

    // Build decoded output with names and types
    const outputs = functionAbi.outputs || [];
    let decodedOutputs = [];

    if (outputs.length === 1) {
      decodedOutputs = [
        {
          name: outputs[0].name || "result",
          type: outputs[0].type,
          value: serializeBigInts(decoded),
        },
      ];
    } else if (outputs.length > 1) {
      decodedOutputs = outputs.map((output, index) => ({
        name: output.name || `output${index}`,
        type: output.type,
        value: serializeBigInts(
          Array.isArray(decoded) ? decoded[index] : decoded[output.name],
        ),
      }));
    }

    return NextResponse.json({
      rawData: result.data,
      decoded: decodedOutputs,
      result: serializeBigInts(decoded),
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
