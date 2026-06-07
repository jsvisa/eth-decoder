/**
 * Tests for the Sync Settings export / import feature.
 *
 * Export: clicking "Export" triggers a JSON download containing every
 *   settings key and cache entry that was in localStorage.
 *
 * Import: uploading that JSON file restores all keys and reloads the page.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Open the settings panel.
 * The button label changes when API keys are configured, so match on the
 * stable CSS class instead of the dynamic text. */
async function openSettings(page) {
  await page.goto("/contract-caller");
  await page.locator("[class*=settingsToggle]").first().click();
  await page.locator("text=Sync Settings").waitFor({ timeout: 5000 });
}

/** Seed localStorage with representative data before the page loads. */
async function seedStorage(page, extra = {}) {
  await page.addInitScript((data) => {
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }, {
    tenderly_settings: JSON.stringify({ accessKey: "tk", account: "acc", project: "proj" }),
    api_keys_settings: JSON.stringify({ etherscan: "ek123" }),
    rpc_settings: JSON.stringify({ ethereum: "https://my-rpc.example.com" }),
    simulation_settings: JSON.stringify({ useLocalSimulation: false }),
    custom_chains: JSON.stringify([{ id: "mychain", chainId: 99999, name: "MyChain", rpcUrl: "https://rpc.mychain" }]),
    address_book: JSON.stringify([{ address: "0xabc", name: "Alice", chain: "ethereum" }]),
    "contract_caller_history": JSON.stringify([{ id: 1, chain: "ethereum", address: "0x123", functionName: "foo" }]),
    "abi-ethereum-0xabcdef1234567890abcdef1234567890abcdef12": JSON.stringify({ abi: [], contractName: "MyContract" }),
    "token-symbol-ethereum-0xabcdef1234567890abcdef1234567890abcdef12": "TKN",
    "token-decimals-ethereum-0xabcdef1234567890abcdef1234567890abcdef12": "18",
    ...extra,
  });
}

// ── Export tests ──────────────────────────────────────────────────────────────

test.describe("Export settings", () => {
  test("Export button triggers a JSON file download", async ({ page }) => {
    await seedStorage(page);
    await openSettings(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("evm-tools-settings.json");
  });

  test("exported JSON contains all named settings keys", async ({ page }) => {
    await seedStorage(page);
    await openSettings(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    const filePath = await download.path();
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    expect(json).toHaveProperty("tenderly_settings");
    expect(json).toHaveProperty("api_keys_settings");
    expect(json).toHaveProperty("rpc_settings");
    expect(json).toHaveProperty("simulation_settings");
    expect(json).toHaveProperty("custom_chains");
    expect(json).toHaveProperty("address_book");
    expect(json).toHaveProperty("contract_caller_history");
  });

  test("exported JSON includes ABI cache entries", async ({ page }) => {
    await seedStorage(page);
    await openSettings(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    const filePath = await download.path();
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const abiKeys = Object.keys(json).filter((k) => k.startsWith("abi-"));
    expect(abiKeys.length).toBeGreaterThan(0);
  });

  test("exported JSON includes token-symbol and token-decimals cache entries", async ({
    page,
  }) => {
    await seedStorage(page);
    await openSettings(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    const filePath = await download.path();
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    expect(Object.keys(json).some((k) => k.startsWith("token-symbol-"))).toBe(true);
    expect(Object.keys(json).some((k) => k.startsWith("token-decimals-"))).toBe(true);
  });

  test("exported values match what was in localStorage", async ({ page }) => {
    await seedStorage(page);
    await openSettings(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    const filePath = await download.path();
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const tenderly = JSON.parse(json.tenderly_settings);
    expect(tenderly.accessKey).toBe("tk");
    expect(tenderly.account).toBe("acc");

    const apiKeys = JSON.parse(json.api_keys_settings);
    expect(apiKeys.etherscan).toBe("ek123");
  });
});

// ── Import tests ──────────────────────────────────────────────────────────────

test.describe("Import settings", () => {
  /** Write a JSON payload to a temp file and return its path. */
  function writeTempJson(data) {
    const file = path.join(os.tmpdir(), `evm-import-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  }

  /** Open settings with a clean localStorage slate (cleared after load, not via initScript). */
  async function openSettingsClean(page) {
    await page.goto("/contract-caller");
    await page.evaluate(() => localStorage.clear());
    await page.locator("[class*=settingsToggle]").first().click();
    await page.locator("text=Sync Settings").waitFor({ timeout: 5000 });
  }

  test("importing a JSON file writes keys to localStorage and reloads", async ({
    page,
  }) => {
    await openSettingsClean(page);

    const payload = {
      tenderly_settings: JSON.stringify({ accessKey: "imported-key", account: "imp-acc", project: "imp-proj" }),
      api_keys_settings: JSON.stringify({ etherscan: "imported-etherscan" }),
    };
    const tmpFile = writeTempJson(payload);

    // Upload the file via the hidden <input type="file"> inside the Import label
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    // importSettings calls window.location.reload() — capture the navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      fileInput.setInputFiles(tmpFile),
    ]);

    // Verify localStorage was written with the imported values
    const stored = await page.evaluate(() =>
      localStorage.getItem("tenderly_settings"),
    );
    const parsed = JSON.parse(stored);
    expect(parsed.accessKey).toBe("imported-key");
    expect(parsed.account).toBe("imp-acc");
  });

  test("importing merges with existing keys without clearing unrelated ones", async ({
    page,
  }) => {
    await page.goto("/contract-caller");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("address_book", JSON.stringify([{ address: "0xexisting", name: "Bob" }]));
    });
    await page.locator("[class*=settingsToggle]").first().click();
    await page.locator("text=Sync Settings").waitFor({ timeout: 5000 });

    // Import only replaces the keys present in the file
    const payload = {
      api_keys_settings: JSON.stringify({ etherscan: "new-key" }),
    };
    const tmpFile = writeTempJson(payload);

    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      fileInput.setInputFiles(tmpFile),
    ]);

    // Imported key is present
    const apiKeys = JSON.parse(
      await page.evaluate(() => localStorage.getItem("api_keys_settings")),
    );
    expect(apiKeys.etherscan).toBe("new-key");

    // Pre-existing unrelated key survives
    const addressBook = JSON.parse(
      await page.evaluate(() => localStorage.getItem("address_book")),
    );
    expect(addressBook[0].name).toBe("Bob");
  });

  test("importing only non-string values are skipped", async ({ page }) => {
    await openSettingsClean(page);

    // A file with a mix of valid strings and invalid types
    const payload = {
      api_keys_settings: JSON.stringify({ etherscan: "valid" }),
      bad_key: 12345,       // number — should be skipped
      another_bad: null,    // null — should be skipped
    };
    const tmpFile = writeTempJson(payload);

    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      fileInput.setInputFiles(tmpFile),
    ]);

    const apiKeys = JSON.parse(
      await page.evaluate(() => localStorage.getItem("api_keys_settings")),
    );
    expect(apiKeys.etherscan).toBe("valid");

    // Non-string values should not have been written
    const bad = await page.evaluate(() => localStorage.getItem("bad_key"));
    expect(bad).toBeNull();
  });
});
