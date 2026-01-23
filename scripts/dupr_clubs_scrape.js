const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const CLUBS_URL = 'https://dashboard.dupr.com/dashboard/browse/clubs'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

async function acceptCookiesIfPresent(page) {
  const acceptButton = page.locator('button:has-text("Accept")')
  if (await acceptButton.count()) {
    await acceptButton.first().click({ timeout: 3000 }).catch(() => {})
  }
}

async function loginIfNeeded(page, email, password) {
  if (!page.url().includes('/login')) return

  await acceptCookiesIfPresent(page)

  await page.fill('input[placeholder="Enter Email"]', email)
  await page.fill('input[placeholder="Enter Password"]', password)
  await page.click('button:has-text("Sign In")')

  // If CAPTCHA is present, allow manual completion.
  try {
    await page.waitForURL(/dashboard\/browse\/clubs/, { timeout: 15000 })
  } catch {
    console.log('If CAPTCHA is shown, complete it in the opened browser window.')
    await page.waitForURL(/dashboard\/browse\/clubs/, { timeout: 0 })
  }
}

async function collectClubLinks(page) {
  const links = new Set()
  let lastCount = 0
  let sameCountRounds = 0

  for (let i = 0; i < 60; i += 1) {
    const newLinks = await page.$$eval('a[href*="/dashboard/browse/clubs/"]', (nodes) =>
      nodes.map((n) => n.href)
    )
    newLinks.forEach((link) => links.add(link))

    if (links.size === lastCount) {
      sameCountRounds += 1
    } else {
      sameCountRounds = 0
      lastCount = links.size
    }

    if (sameCountRounds >= 3) break

    await page.mouse.wheel(0, 3000)
    await page.waitForTimeout(1000)

    const loadMore = page.locator('button:has-text("Load More"), button:has-text("Load more")')
    if (await loadMore.count()) {
      await loadMore.first().click().catch(() => {})
      await page.waitForTimeout(1000)
    }
  }

  return Array.from(links)
}

async function extractClubDetails(page) {
  return page.evaluate(() => {
    const text = (el) => (el && el.textContent ? el.textContent.trim() : '')

    const heading =
      document.querySelector('h1') ||
      document.querySelector('h2') ||
      document.querySelector('h3')

    const emailLink = document.querySelector('a[href^="mailto:"]')
    const phoneLink = document.querySelector('a[href^="tel:"]')

    let directorName = ''
    const directorLabel = Array.from(document.querySelectorAll('*')).find((el) =>
      /director/i.test(text(el))
    )
    if (directorLabel) {
      const next = directorLabel.nextElementSibling
      directorName = text(next) || directorName
    }

    const stateCandidate = Array.from(document.querySelectorAll('span, p, div'))
      .map((el) => text(el))
      .find((t) => /^[A-Z]{2}$/.test(t))

    const cityCandidate = Array.from(document.querySelectorAll('span, p, div'))
      .map((el) => text(el))
      .find((t) => t && t.length > 2 && /, [A-Z]{2}$/.test(t))

    return {
      clubName: text(heading),
      directorName,
      email: text(emailLink),
      phone: text(phoneLink),
      city: cityCandidate || '',
      state: stateCandidate || '',
    }
  })
}

async function run() {
  const email = requireEnv('DUPR_EMAIL')
  const password = requireEnv('DUPR_PASSWORD')
  const headless = process.env.HEADLESS === '1'
  const outPath = process.env.OUTPUT_CSV || path.join('InLg', 'dupr_clubs.csv')

  const browser = await chromium.launch({ headless })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(CLUBS_URL, { waitUntil: 'domcontentloaded' })
  await loginIfNeeded(page, email, password)
  console.log(`After login, URL: ${page.url()}`)

  await page.waitForTimeout(2000)
  const clubLinks = await collectClubLinks(page)
  console.log(`Found ${clubLinks.length} club links`)

  if (clubLinks.length === 0) {
    try {
      const debugDir = path.dirname(outPath)
      const screenshotPath = path.join(debugDir, 'dupr_clubs_debug.png')
      const htmlPath = path.join(debugDir, 'dupr_clubs_debug.html')
      await page.screenshot({ path: screenshotPath, fullPage: true })
      fs.writeFileSync(htmlPath, await page.content(), 'utf8')
      console.log(`Saved debug snapshot: ${screenshotPath}`)
      console.log(`Saved debug HTML: ${htmlPath}`)
    } catch (error) {
      console.log('Failed to save debug artifacts', error)
    }
  }

  const rows = []
  for (const link of clubLinks) {
    await page.goto(link, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const details = await extractClubDetails(page)
    rows.push({ ...details, clubUrl: link })
  }

  const header = [
    'clubName',
    'directorName',
    'phone',
    'email',
    'city',
    'state',
    'clubUrl',
  ]
  const csv = [header.join(',')]
  for (const row of rows) {
    csv.push(
      header.map((key) => escapeCsv(row[key] || '')).join(',')
    )
  }

  fs.writeFileSync(outPath, `${csv.join('\n')}\n`, 'utf8')
  console.log(`Saved ${rows.length} clubs to ${outPath}`)

  await browser.close()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
