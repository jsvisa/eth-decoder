import { test, expect } from "@playwright/test";

test.describe("Decoder page", () => {
  test("loads and shows the decode input form", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByPlaceholder("Enter hex data to decode (e.g., 0x1234abcd...)"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Decode" })).toBeVisible();
  });

  test("shows a result or error after submitting hex data", async ({
    page,
  }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(
      "Enter hex data to decode (e.g., 0x1234abcd...)",
    );
    await input.fill("0x12345678");
    await page.getByRole("button", { name: "Decode" }).click();
    // Wait for either a decode result or an error to appear (both are valid outcomes
    // depending on whether BACKEND_URL is configured and what the backend returns)
    await expect(
      page
        .locator("h2")
        .filter({ hasText: "Result:" })
        .or(page.locator("strong").filter({ hasText: "Error:" })),
    ).toBeVisible({ timeout: 15000 });
  });

  test("shows a validation error when submitting whitespace-only input", async ({
    page,
  }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(
      "Enter hex data to decode (e.g., 0x1234abcd...)",
    );
    await input.fill("   ");
    await page.getByRole("button", { name: "Decode" }).click();
    // The page shows "Please enter some data" for whitespace-only input
    await expect(page.getByText("Please enter some data")).toBeVisible({
      timeout: 5000,
    });
  });
});
