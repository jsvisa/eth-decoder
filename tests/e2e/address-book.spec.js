import { test, expect } from "@playwright/test";

const TEST_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TEST_LABEL = "USDC E2E Test";

test.describe("Address Book page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/address-book");
    await page.evaluate(() => localStorage.removeItem("address_book"));
    await page.reload();
  });

  test("loads and shows the address book UI", async ({ page }) => {
    // The page should show an add button even when empty
    await expect(
      page.getByRole("button", { name: /add address/i }),
    ).toBeVisible();
  });

  test("adding a valid address makes it appear in the list", async ({
    page,
  }) => {
    // Open the add modal
    await page.getByRole("button", { name: /add address/i }).click();
    await page.getByPlaceholder("0x...").fill(TEST_ADDRESS);
    await page.getByPlaceholder(/USDC Token|Uniswap Router/i).fill(TEST_LABEL);
    await page
      .getByRole("button", { name: /add|save/i })
      .last()
      .click();
    await expect(page.getByText(TEST_LABEL)).toBeVisible({ timeout: 5000 });
  });

  test("deleting an entry removes it from the list", async ({ page }) => {
    // Add first
    await page.getByRole("button", { name: /add address/i }).click();
    await page.getByPlaceholder("0x...").fill(TEST_ADDRESS);
    await page.getByPlaceholder(/USDC Token|Uniswap Router/i).fill(TEST_LABEL);
    await page
      .getByRole("button", { name: /add|save/i })
      .last()
      .click();
    await expect(page.getByText(TEST_LABEL)).toBeVisible();

    // Accept the confirm dialog, then click delete
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: /delete|remove/i })
      .first()
      .click();
    await expect(page.getByText(TEST_LABEL)).not.toBeVisible({ timeout: 5000 });
  });
});
