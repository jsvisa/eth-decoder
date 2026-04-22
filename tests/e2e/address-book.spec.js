import { test, expect } from '@playwright/test'

const TEST_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const TEST_LABEL = 'USDC E2E Test'

test.describe('Address Book page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/address-book')
    // Clear any existing entries from a prior run by reloading with clean localStorage
    await page.evaluate(() => localStorage.removeItem('address_book'))
    await page.reload()
  })

  test('loads and shows the address book UI', async ({ page }) => {
    await expect(page.getByPlaceholder('0x...')).toBeVisible()
  })

  test('adding a valid address makes it appear in the list', async ({ page }) => {
    await page.getByPlaceholder('0x...').fill(TEST_ADDRESS)
    await page.getByPlaceholder(/USDC Token|Uniswap Router/i).fill(TEST_LABEL)
    // Click the Add/Save button
    await page.getByRole('button', { name: /add|save/i }).first().click()
    await expect(page.getByText(TEST_LABEL)).toBeVisible({ timeout: 5000 })
  })

  test('deleting an entry removes it from the list', async ({ page }) => {
    // Add first
    await page.getByPlaceholder('0x...').fill(TEST_ADDRESS)
    await page.getByPlaceholder(/USDC Token|Uniswap Router/i).fill(TEST_LABEL)
    await page.getByRole('button', { name: /add|save/i }).first().click()
    await expect(page.getByText(TEST_LABEL)).toBeVisible()

    // Delete
    await page.getByRole('button', { name: /delete|remove/i }).first().click()
    await expect(page.getByText(TEST_LABEL)).not.toBeVisible({ timeout: 5000 })
  })
})
