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

// ── Mock data ──────────────────────────────────────────────────────────

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
    // USDC balance change for FROM_ADDR (loses 1,000 USDC)
    {
      address: TOKEN_ADDR,
      before: "1000000000", // 1,000 USDC (with 6 decimals)
      after: "0",
      diff: "-1000000000",
    },
    // USDC balance change for TO_ADDR (gains 1,000 USDC)
    {
      address: TO_ADDR,
      before: "0",
      after: "1000000000", // 1,000 USDC (with 6 decimals)
      diff: "1000000000",
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

// ── Helpers ────────────────────────────────────────────────────────────

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
  const historyItem = page.locator("[class*=historyItem]").first();
  await historyItem.waitFor({ state: "visible", timeout: 10000 });
  await historyItem.click();
  // Wait for the Balance Changes table section to appear
  await page.locator("[class*=bdSection]").waitFor({ timeout: 5000 });
  // Allow async decimals/price/symbol fetches to complete
  await page.waitForTimeout(5000);
}

// ── Tests ────────────────────────────────────────────────────────────

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
    await expect(page.locator("text=(1,000 USDC)").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("Balance Changes table shows ETH row with Sender badge and USD value", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await loadHistoryResult(page);

    const section = page.locator("[class*=bdSection]");
    await expect(section).toBeVisible();

    // Table heading
    await expect(section.locator("text=Balance Changes")).toBeVisible();

    // ETH row: amount -1, value $3,000.00
    await expect(section.locator("text=-1").first()).toBeVisible();
    await expect(section.locator("text=$3,000.00").first()).toBeVisible();

    // Sender role badge shown for the from-address rows
    await expect(section.locator("text=Sender").first()).toBeVisible();
  });

  test("Balance Changes table shows USDC token rows for both addresses", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await loadHistoryResult(page);

    const section = page.locator("[class*=bdSection]");

    // FROM address loses USDC
    await expect(section.locator("text=-1,000").first()).toBeVisible();

    // TO address gains USDC
    await expect(section.locator("text=+1,000").first()).toBeVisible();

    // Sender badge shown for the fromAddress rows
    await expect(section.locator("text=Sender").first()).toBeVisible();
  });

  test("Balance Changes table shows correct Total Value in USD per address", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await loadHistoryResult(page);

    const section = page.locator("[class*=bdSection]");

    // FROM account: -1 ETH ($3,000) + -1,000 USDC ($1,000) = total – $4,000.00
    await expect(section.locator("text=$4,000.00").first()).toBeVisible();

    // TO account: +1,000 USDC ($1,000) = total + $1,000.00
    await expect(section.locator("text=$1,000.00").first()).toBeVisible();
  });
});

// ── Role badge tests ────────────────────────────────────────────────────

test.describe("Balance Changes role badges", () => {
  // Seed a simulation where TOKEN_ADDR (the contract = `address` state) also
  // has a balance change so the Receiver badge is exercised.
  const CONTRACT_ADDR = TOKEN_ADDR; // address state = USDC contract

  const outputWithContractChange = {
    ...MOCK_SIMULATE_OUTPUT,
    balanceChanges: [
      {
        address: FROM_ADDR,
        before: "10000000000000000000",
        after: "9000000000000000000",
        diff: "-1000000000000000000",
      },
      // The contract itself also loses ETH (e.g. gas refund scenario)
      {
        address: CONTRACT_ADDR,
        before: "5000000000000000000",
        after: "4900000000000000000",
        diff: "-100000000000000000",
      },
    ],
  };

  const historyWithContract = {
    ...MOCK_HISTORY_ITEM,
    address: CONTRACT_ADDR,
    fromAddress: FROM_ADDR,
    output: outputWithContractChange,
  };

  test("Sender badge shown for fromAddress rows", async ({ page }) => {
    await page.addInitScript(
      ({ hk, hi, ak, abi }) => {
        localStorage.setItem(hk, JSON.stringify([hi]));
        localStorage.setItem(
          ak,
          JSON.stringify({ abi, contractName: "MockUSDC", isProxy: false }),
        );
      },
      {
        hk: "contract_caller_history",
        hi: historyWithContract,
        ak: `abi-ethereum-${CONTRACT_ADDR}`,
        abi: MOCK_ABI,
      },
    );
    await mockCallContract(page);
    await mockTokenPrice(page);

    await page.goto("/contract-caller");
    await page.locator("[class*=historyItem]").first().click();
    await page.locator("[class*=bdSection]").waitFor({ timeout: 5000 });

    const section = page.locator("[class*=bdSection]");
    // FROM_ADDR is the sender — its row(s) carry the Sender badge
    await expect(section.locator("text=Sender").first()).toBeVisible();
  });

  test("Receiver badge shown for contract address rows", async ({ page }) => {
    await page.addInitScript(
      ({ hk, hi, ak, abi }) => {
        localStorage.setItem(hk, JSON.stringify([hi]));
        localStorage.setItem(
          ak,
          JSON.stringify({ abi, contractName: "MockUSDC", isProxy: false }),
        );
      },
      {
        hk: "contract_caller_history",
        hi: historyWithContract,
        ak: `abi-ethereum-${CONTRACT_ADDR}`,
        abi: MOCK_ABI,
      },
    );
    await mockCallContract(page);
    await mockTokenPrice(page);

    await page.goto("/contract-caller");
    await page.locator("[class*=historyItem]").first().click();
    await page.locator("[class*=bdSection]").waitFor({ timeout: 5000 });

    const section = page.locator("[class*=bdSection]");
    // CONTRACT_ADDR equals `address` state → Receiver badge
    await expect(section.locator("text=Receiver").first()).toBeVisible();
  });

  test("third-party address (transfer recipient) has no role badge", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await page.goto("/contract-caller");
    await page.locator("[class*=historyItem]").first().click();
    await page.locator("[class*=bdSection]").waitFor({ timeout: 5000 });
    await page.waitForTimeout(2000);

    // TO_ADDR is neither fromAddress nor address, so no badge cell next to it
    // Verify TO_ADDR row exists but doesn't contain Sender or Receiver
    const rows = page.locator("[class*=bdRow]");
    const count = await rows.count();
    let toAddrRowHasBadge = false;
    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      const shortTo = TO_ADDR.slice(0, 10) + "…" + TO_ADDR.slice(-8);
      if (
        rowText.includes(shortTo) ||
        rowText.toLowerCase().includes(TO_ADDR.toLowerCase())
      ) {
        if (rowText.includes("Sender") || rowText.includes("Receiver")) {
          toAddrRowHasBadge = true;
        }
      }
    }
    expect(toAddrRowHasBadge).toBe(false);
  });
});

// ── Click-to-expand tests ─────────────────────────────────────────────────

test.describe("Balance Changes click-to-expand", () => {
  test("clicking address toggles between truncated and full display", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await page.goto("/contract-caller");
    await page.locator("[class*=historyItem]").first().click();
    await page.locator("[class*=bdSection]").waitFor({ timeout: 5000 });

    const section = page.locator("[class*=bdSection]");
    // Use span[class*=bdAddr] — [class*=bdAddr] alone also matches bdAddrCell (div)
    const firstAddr = section.locator("span[class*=bdAddr]").first();

    // Initially shows truncated form
    const truncated = `${FROM_ADDR.slice(0, 10)}…${FROM_ADDR.slice(-8)}`;
    await expect(firstAddr).toHaveText(truncated);

    // Click → shows full address
    await firstAddr.click();
    await expect(firstAddr).toHaveText(FROM_ADDR);

    // Click again → back to truncated
    await firstAddr.click();
    await expect(firstAddr).toHaveText(truncated);
  });

  test("clicking token cell shows contract address below symbol", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await mockCallContract(page);
    await mockTokenPrice(page);

    await page.goto("/contract-caller");
    await page.locator("[class*=historyItem]").first().click();
    await page.locator("[class*=bdSection]").waitFor({ timeout: 5000 });
    await page.waitForTimeout(2000); // wait for symbol fetch

    const section = page.locator("[class*=bdSection]");

    // Target the USDC token cell specifically (first row is ETH which is not expandable)
    const usdcTokenCell = section
      .locator("[class*=bdTokenCell]")
      .filter({ hasText: "USDC" })
      .first();

    // Token contract address span is absent before clicking
    const tokenAddrSpan = usdcTokenCell.locator("[class*=bdTokenAddr]");
    await expect(tokenAddrSpan).not.toBeAttached();

    // Click → contract address appears
    await usdcTokenCell.click();
    await expect(tokenAddrSpan).toBeVisible();
    await expect(tokenAddrSpan).toHaveText(TOKEN_ADDR);

    // Click again → hidden
    await usdcTokenCell.click();
    await expect(tokenAddrSpan).not.toBeAttached();
  });
});
