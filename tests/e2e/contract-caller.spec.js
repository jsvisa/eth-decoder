import { test, expect } from "@playwright/test";

test.describe("Contract Caller page", () => {
  test("loads and shows the chain selector", async ({ page }) => {
    await page.goto("/contract-caller");
    // The network picker is a searchable combobox; verify it is visible and
    // defaults to 'Ethereum (1)'
    const chainInput = page.getByRole("combobox");
    await expect(chainInput).toBeVisible();
    await expect(chainInput).toHaveValue("Ethereum (1)");
  });

  test("shows all built-in chains", async ({ page }) => {
    await page.goto("/contract-caller");
    // Focusing the input opens the dropdown list; each chain appears once
    const chainInput = page.getByRole("combobox");
    await expect(chainInput).toBeVisible();
    await chainInput.click();
    for (const value of ["ethereum", "arbitrum", "base", "polygon", "bsc"]) {
      await expect(page.locator(`[data-chain="${value}"]`)).toHaveCount(1);
    }
  });

  test("shows an address input field", async ({ page }) => {
    await page.goto("/contract-caller");
    // Contract address input uses placeholder="0x..."
    const addressInput = page.getByPlaceholder("0x...");
    await expect(addressInput).toBeVisible();
    await addressInput.fill("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    await expect(addressInput).toHaveValue(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );
  });

  test("adds an independent second contract caller tab", async ({ page }) => {
    await page.goto("/contract-caller");
    const activePanel = () =>
      page.locator('[role="tabpanel"]').filter({ visible: true });
    const addressInput = () => activePanel().getByPlaceholder("0x...");

    await page.getByRole("button", { name: "+ Add Tab" }).click();
    await expect(page.getByRole("tab")).toHaveCount(2);

    await addressInput().fill("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await expect(addressInput()).toHaveValue(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    );

    // Switch back to the first tab — its address is still empty
    await page.getByRole("tab").nth(0).click();
    await expect(addressInput()).toHaveValue("");
  });
});
