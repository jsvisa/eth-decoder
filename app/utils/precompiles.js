import { defineCall, definePrecompile } from "tevm";
import { EvmError } from "tevm/evm";
import { hexToBytes } from "viem";

export const ARBITRUM_ONE_CHAIN_ID = 42161;

const ARBSYS_ADDRESS = "0x0000000000000000000000000000000000000064";
const ARBSYS_BLOCK_NUMBER_SELECTOR = "0xa3b1b31d";
const ARBSYS_ABI = [
  {
    type: "function",
    name: "arbBlockNumber",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
];

export const ARBITRUM_PRECOMPILE_REFERENCES = {
  registry:
    "https://github.com/OffchainLabs/nitro/blob/a618155919315241665356fe60f3cd00d66d5e46/precompiles/precompile.go#L523-L693",
  addressConfig:
    "https://github.com/OffchainLabs/nitro/blob/a618155919315241665356fe60f3cd00d66d5e46/system_tests/eth_config_test.go#L53-L70",
};

const ARBITRUM_PRECOMPILE_ADDRESSES_BY_NAME = {
  ArbSys: ARBSYS_ADDRESS,
  ArbInfo: "0x0000000000000000000000000000000000000065",
  ArbAddressTable: "0x0000000000000000000000000000000000000066",
  ArbBLS: "0x0000000000000000000000000000000000000067",
  ArbFunctionTable: "0x0000000000000000000000000000000000000068",
  ArbosTest: "0x0000000000000000000000000000000000000069",
  ArbOwnerPublic: "0x000000000000000000000000000000000000006b",
  ArbGasInfo: "0x000000000000000000000000000000000000006c",
  ArbAggregator: "0x000000000000000000000000000000000000006d",
  ArbRetryableTx: "0x000000000000000000000000000000000000006e",
  ArbStatistics: "0x000000000000000000000000000000000000006f",
  ArbOwner: "0x0000000000000000000000000000000000000070",
  ArbWasm: "0x0000000000000000000000000000000000000071",
  ArbWasmCache: "0x0000000000000000000000000000000000000072",
  ArbNativeTokenManager: "0x0000000000000000000000000000000000000073",
  ArbFilteredTransactionsManager: "0x0000000000000000000000000000000000000074",
  ArbDebug: "0x00000000000000000000000000000000000000ff",
  ArbosActs: "0x00000000000000000000000000000000000a4b05",
};

const ARBITRUM_PRECOMPILE_ADDRESSES = Object.values(
  ARBITRUM_PRECOMPILE_ADDRESSES_BY_NAME,
);

function blockTagToRpcBlock(blockTag) {
  return typeof blockTag === "bigint" ? `0x${blockTag.toString(16)}` : blockTag;
}

export function createArbSysPrecompile(getBlockNumber) {
  return definePrecompile({
    contract: { abi: ARBSYS_ABI, address: ARBSYS_ADDRESS },
    call: defineCall(ARBSYS_ABI, {
      arbBlockNumber: async () => ({
        returnValue: getBlockNumber(),
        executionGasUsed: 0x323n,
      }),
    }),
  });
}

function createRevertError(error) {
  const evmError = new EvmError("revert");
  evmError.message =
    error instanceof Error ? error.message : "RPC-backed precompile reverted";
  return evmError;
}

function createRpcBackedPrecompile(address, request, getBlockTag) {
  // Tevm custom precompiles expose only calldata and gas. Keep RPC-backed
  // precompiles chain-allowlisted because they do not emulate local stateful
  // ArbOS side effects.
  const call = async ({ data, gasLimit }) => {
    try {
      const returnValue = await request({
        method: "eth_call",
        params: [{ to: address, data }, blockTagToRpcBlock(getBlockTag())],
      });

      return {
        returnValue: hexToBytes(returnValue),
        executionGasUsed: gasLimit < 0x323n ? gasLimit : 0x323n,
      };
    } catch (error) {
      return {
        returnValue: new Uint8Array(),
        executionGasUsed: 0n,
        exceptionError: createRevertError(error),
      };
    }
  };

  return definePrecompile({
    contract: { abi: [], address },
    call:
      address === ARBSYS_ADDRESS
        ? async ({ data, gasLimit }) => {
            if (data === ARBSYS_BLOCK_NUMBER_SELECTOR) {
              return createArbSysPrecompile(() => getBlockTag()).call({
                data,
                gasLimit,
              });
            }
            return call({ data, gasLimit });
          }
        : call,
  });
}

export function createArbitrumPrecompiles(request, getBlockTag) {
  return ARBITRUM_PRECOMPILE_ADDRESSES.map((address) =>
    createRpcBackedPrecompile(address, request, getBlockTag).precompile(),
  );
}

const PRECOMPILE_FACTORIES_BY_CHAIN_ID = {
  [ARBITRUM_ONE_CHAIN_ID]: ({ request, getBlockTag }) =>
    createArbitrumPrecompiles(request, getBlockTag),
};

export function createPrecompilesForChain(chainId, context) {
  const createPrecompiles = PRECOMPILE_FACTORIES_BY_CHAIN_ID[chainId];
  return createPrecompiles ? createPrecompiles(context) : [];
}
