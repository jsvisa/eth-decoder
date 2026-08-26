import { describe, it, expect } from "vitest";
import {
  createTevmClient,
  simulateWithClient,
} from "../../app/utils/tevmSimulator.js";

const ERC20_TRANSFER_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const USDT_RECIPIENT = "0x000000000000000000000000000000000000dEaD";
const USDT_TRANSFER_AMOUNT = "1000000";
const MAINNET_FORK_BLOCK = "latest";

const hasRpcUrl = !!process.env.INTEGRATION_RPC_URL;

async function readTokenBalance(client, blockNumber, tokenAddress, account) {
  const result = await simulateWithClient(client, blockNumber, {
    chain: "ethereum",
    address: tokenAddress,
    functionName: "balanceOf(address)",
    args: [account],
    abi: ERC20_TRANSFER_BALANCE_OF_ABI,
    fromAddress: USDT_HOLDER,
  });

  expect(result.success).toBe(true);
  expect(result.decoded[0]?.value).toBeDefined();
  return BigInt(result.decoded[0].value);
}

describe("simulateWithClient tevm fork (integration)", () => {
  it.skipIf(!hasRpcUrl)(
    "persists a USDT transfer locally and exposes the new state to balanceOf reads",
    async () => {
      let client, blockNumber;
      ({ client, blockNumber } = await createTevmClient(
        "ethereum",
        process.env.INTEGRATION_RPC_URL,
        MAINNET_FORK_BLOCK,
        null,
        1,
      ));

      const senderBalanceBefore = await readTokenBalance(
        client,
        blockNumber,
        USDT_ADDRESS,
        USDT_HOLDER,
      );
      const recipientBalanceBefore = await readTokenBalance(
        client,
        blockNumber,
        USDT_ADDRESS,
        USDT_RECIPIENT,
      );

      const writeResult = await simulateWithClient(client, blockNumber, {
        chain: "ethereum",
        address: USDT_ADDRESS,
        functionName: "transfer(address,uint256)",
        args: [USDT_RECIPIENT, USDT_TRANSFER_AMOUNT],
        abi: ERC20_TRANSFER_BALANCE_OF_ABI,
        fromAddress: USDT_HOLDER,
        cheatcodes: {
          deal: {
            address: USDT_HOLDER,
            amount: "1",
          },
        },
        persistState: true,
      });

      expect(writeResult.success).toBe(true);
      expect(writeResult.error).toBeNull();
      expect(writeResult.logs.length).toBeGreaterThan(0);

      const senderBalanceAfter = await readTokenBalance(
        client,
        blockNumber,
        USDT_ADDRESS,
        USDT_HOLDER,
      );
      const recipientBalanceAfter = await readTokenBalance(
        client,
        blockNumber,
        USDT_ADDRESS,
        USDT_RECIPIENT,
      );

      expect(senderBalanceAfter).toBe(
        senderBalanceBefore - BigInt(USDT_TRANSFER_AMOUNT),
      );
      expect(recipientBalanceAfter).toBe(
        recipientBalanceBefore + BigInt(USDT_TRANSFER_AMOUNT),
      );
    },
    60000,
  );
});
