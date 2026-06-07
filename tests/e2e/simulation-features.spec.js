/**
 * Tests for simulation result features:
 *   1. Transfer log formatted amounts (decimals → human-readable)
 *   2. Account Balance Changes section with USD prices
 *   3. /api/token-price endpoint behaviour
 *
 * UI tests pre-seed localStorage with a simulation result so we never
 * need to drive the full form → submit → wait flow. We just click the
 * history item and verify the rendered sections.
 */
import { test, expect } from "@playwright/test";

const TOKEN_ADDR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC on Ethereum
const FROM_ADDR = "0xb826224b742ead5cf91ea432340e3763fac09cdd";
const TO_ADDR = "0xdeadbeef00000000000000000000000000000001";

// ── Mock data ────────────────────────────────────────────────────────────────

// Simulated Transfer of 1 000 USDC (raw = 1_000_000_000 with 6 decimals)
const MOCK_SIMULATE_OUTPUT = {
  success: true,
  simulated: true,
  rawData: "0x",
  decoded: [],
  gasUsed: 120000,
  logs: [
    {
      address: TOKEN_ADDR,
      name: "Transfer",
      decoded: true,
      topics: [],
      data: "0x",
      inputs: [
        { name: "from", type: "address", value: FROM_ADDR, indexed: true },
        { name: "to", type: "address", value: TO_ADDR, indexed: true },
        {
          name: "value",
          type: "uint256",
          value: "1000000000",
          indexed: false,
        },
      ],
    },
  ],
  assetChanges: [],
  balanceChanges: [
    {
      address: FROM_ADDR,
      before: "10000000000000000000", // 10 ETH
      after: "9000000000000000000", //  9 ETH
      diff: "-1000000000000000000", // -1 ETH
    },
  ],
  stateChanges: [],
  callTrace: null,
  error: null,
};

const MOCK_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

// History item the page will read on load
const MOCK_HISTORY_ITEM = {
  id: 1000000,
  chain: "ethereum",
  address: TOKEN_ADDR,
  functionName: "transfer",
  functionSig: "transfer(address,uint256)",
  args: [TO_ADDR, "1000000000"],
  fromAddress: FROM_ADDR,
  output: MOCK_SIMULATE_OUTPUT,
  contractName: "MockUSDC",
  isWrite: true,
  timestamp: new Date().toISOString(),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pre-seed localStorage so the page loads with a pre-existing history entry */
async function seedLocalStorage(page) {
  await page.addInitScript(
    ({ historyKey, historyItem, abiKey, abi }) => {
      localStorage.setItem(historyKey, JSON.stringify([historyItem]));
      localStorage.setItem(
        abiKey,
        JSON.stringify({ abi, contractName: "MockUSDC", isProxy: false }),
      );
    },
    {
      historyKey: "contract_caller_history",
      historyItem: MOCK_HISTORY_ITEM,
      abiKey: `abi-ethereum-${TOKEN_ADDR}`,
      abi: MOCK_ABI,
    },
  );
}

function parsePostBody(route) {
  try {
    return route.request().postDataJSON();
  } catch {
    return {};
  }
}

/** Mock call-contract for decimals() and symbol() */
async function mockCallContract(page) {
  await page.route("/api/call-contract", (route) => {
    const body = parsePostBody(route);
    if (body?.functionName === "decimals") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          decoded: [{ name: "", type: "uint8", value: "6" }],
        }),
      });
    }
    if (body?.functionName === "symbol") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          decoded: [{ name: "", type: "string", value: "USDC" }],
        }),
      });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
}

/** Mock /api/token-price: ETH → $3000, everything else → $1 */
async function mockTokenPrice(page) {
  await page.route("/api/token-price*", (route) => {
    const url = new URL(route.request().url());
    const isNative =
      url.searchParams.get("token") ===
      "0x0000000000000000000000000000000000000000";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ price: isNative ? 3000 : 1 }),
    });
  });
}

async function loadHistoryResult(page) {
  await page.goto("/contract-caller");
  const historyItem = page
    .locator("[class*=historyItem]")
    .filter({ hasText: "transfer" })
    .first();
  await historyItem.waitFor({ state: "visible", timeout: 10000 });
  await historyItem.click();
  // Wait for the Account Balance Changes section (confirms simulated result rendered)
  await page.locator("text=Account Balance Changes").waitFor({ timeout: 5000 });
  // Allow async decimals/price fetches to complete
  await page.waitForTimeout(3000);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Simulation result UI features", () => {
  test("Transfer log shows formatted USDC amount next to raw value", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await loadHistoryResult(page);

    // Raw value is still shown
    await expect(page.locator("text=1000000000").first()).toBeVisible();

    // Formatted hint "(1,000 USDC)" should appear after decimals/symbol fetch
    await expect(
      page.locator("text=(1,000 USDC)").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Account Balance Changes section shows ETH diff with USD value", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await loadHistoryResult(page);

    const section = page.locator("[class*=accountDiffSection]");
    await expect(section).toBeVisible();

    // -1 ETH change
    await expect(section.locator("text=/-1\\.\\d+ ETH/").first()).toBeVisible();

    // $-3000.00 USD (ETH price × 1 ETH)
    await expect(section.locator("text=$-3000.00").first()).toBeVisible();
  });

  test("Account Balance Changes shows net USDC flow per address", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await loadHistoryResult(page);

    const section = page.locator("[class*=accountDiffSection]");

    // FROM address: -1,000 USDC
    await expect(section.locator("text=/-1,000 USDC/").first()).toBeVisible();

    // TO address: +1,000 USDC
    await expect(section.locator("text=/\\+1,000 USDC/").first()).toBeVisible();
  });

  test("Account Balance Changes shows Net USD total per account", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await loadHistoryResult(page);

    const section = page.locator("[class*=accountDiffSection]");

    // FROM account: -1 ETH ($-3000) + -1000 USDC ($-1000) = Net -$4000
    await expect(section.locator("text=$-4000.00").first()).toBeVisible();

    // TO account: +1000 USDC ($1000) = Net +$1000
    await expect(section.locator("text=+$1000.00").first()).toBeVisible();
  });
});

test.describe("/api/token-price endpoint", () => {
  test("returns { price } for native ETH on Ethereum", async ({ request }) => {
    const res = await request.get(
      "/api/token-price?token=0x0000000000000000000000000000000000000000&chainId=1",
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("price");
  });

  test("returns { price } for USDC contract address on Ethereum", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/token-price?token=${TOKEN_ADDR}&chainId=1`,
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("price");
  });

  test("returns 400 when parameters are missing", async ({ request }) => {
    const res = await request.get("/api/token-price");
    expect(res.status()).toBe(400);
  });

  test("returns { price: null } for unsupported chain", async ({ request }) => {
    const res = await request.get(
      `/api/token-price?token=${TOKEN_ADDR}&chainId=999999`,
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.price).toBeNull();
  });
});
