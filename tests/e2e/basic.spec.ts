import { test, expect } from '@playwright/test'

test('Главная страница загружается (title = "Piqle Tournament Management")', async ({ page }) => {
  await page.goto('/')
  
  await expect(page).toHaveTitle(/Piqle Tournament Management/)
  await expect(page.locator('h1')).toContainText('Piqle Tournament Management')
})

test('Админ-страница загружается (h1 = "Tournaments")', async ({ page }) => {
  await page.goto('/admin')
  
  await expect(page).toHaveTitle(/Piqle Tournament Management/)
  await expect(page.locator('h1')).toContainText('Tournaments')
})

test('Удаленный роут /t/invalid-slug → 404', async ({ page }) => {
  const res = await page.goto('/t/invalid-slug')
  expect(res?.status()).toBe(404)
})
