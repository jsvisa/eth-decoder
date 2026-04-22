import { test, expect } from '@playwright/test'

test.describe('Contract Caller page', () => {
  test('loads and shows the chain selector', async ({ page }) => {
    await page.goto('/contract-caller')
    // Chains render inside <select> elements; verify the main chain select is visible
    // and defaults to 'ethereum'
    const chainSelect = page.locator('select').first()
    await expect(chainSelect).toBeVisible()
    await expect(chainSelect).toHaveValue('ethereum')
  })

  test('shows all built-in chains', async ({ page }) => {
    await page.goto('/contract-caller')
    // Options inside <select> are hidden per Playwright's visibility model;
    // verify each chain value is present as an option in the DOM
    const chainSelect = page.locator('select').first()
    await expect(chainSelect).toBeVisible()
    for (const value of ['ethereum', 'arbitrum', 'base', 'polygon', 'bsc']) {
      await expect(chainSelect.locator(`option[value="${value}"]`)).toHaveCount(1)
    }
  })

  test('shows an address input field', async ({ page }) => {
    await page.goto('/contract-caller')
    // Contract address input uses placeholder="0x..."
    const addressInput = page.getByPlaceholder('0x...')
    await expect(addressInput).toBeVisible()
    await addressInput.fill('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    await expect(addressInput).toHaveValue('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
  })
})
