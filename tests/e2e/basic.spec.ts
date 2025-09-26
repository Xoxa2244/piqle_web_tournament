import { test, expect } from '@playwright/test'

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/')
  
  await expect(page).toHaveTitle(/Piqle Tournament Management/)
  await expect(page.locator('h1')).toContainText('Piqle Tournament Management')
})

test('admin page loads correctly', async ({ page }) => {
  await page.goto('/admin')
  
  await expect(page).toHaveTitle(/Piqle Tournament Management/)
  await expect(page.locator('h1')).toContainText('Tournaments')
})

test('public scoreboard shows not found for invalid slug', async ({ page }) => {
  await page.goto('/t/invalid-slug')
  
  await expect(page.locator('h1')).toContainText('Tournament Not Found')
})
