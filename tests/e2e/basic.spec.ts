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

test('removed public board route returns 404', async ({ page }) => {
  const res = await page.goto('/t/invalid-slug')
  expect(res?.status()).toBe(404)
})
