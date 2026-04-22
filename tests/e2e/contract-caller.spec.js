import { test, expect } from '@playwright/test'

test.describe('Contract Caller page', () => {
  test('loads and shows the chain selector', async ({ page }) => {
    await page.goto('/contract-caller')
    // The page renders a list of chain buttons/options
    await expect(page.getByText('Ethereum')).toBeVisible()
  })

  test('shows all built-in chains', async ({ page }) => {
    await page.goto('/contract-caller')
    for (const chain of ['Ethereum', 'Arbitrum', 'Base', 'Polygon', 'BSC']) {
      await expect(page.getByText(chain)).toBeVisible()
    }
  })

  test('shows an address input field', async ({ page }) => {
    await page.goto('/contract-caller')
    // Contract address input — look for a text input that accepts 0x addresses
    const addressInput = page.getByRole('textbox').first()
    await expect(addressInput).toBeVisible()
    await addressInput.fill('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    await expect(addressInput).toHaveValue('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
  })
})
