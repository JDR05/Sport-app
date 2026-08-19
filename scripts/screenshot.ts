// Drives the real app in a real browser: completes the onboarding, then captures
// every screen at phone size. Green tests prove the engine behaves; this shows
// whether the result is actually usable.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = 'screenshots'

// This environment ships Chromium preinstalled, and its build number will not
// always match the one the npm package expects. Point at the existing binary
// rather than downloading a second copy.
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

async function main() {
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ executablePath: CHROMIUM })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const problems: string[] = []

  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })

  const shot = async (name: string) => {
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    console.log(`  captured ${name}`)
  }

  // --------------------------------------------------------- onboarding ---
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForURL('**/onboarding')
  await shot('01-onboarding-goal')

  await page.getByPlaceholder('z. B. 80').fill('82')
  await page.getByPlaceholder('z. B. 75').fill('77')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByPlaceholder('z. B. 1995').fill('1995')
  await page.getByPlaceholder('z. B. 178').fill('178')
  await page.getByRole('button', { name: 'Männlich' }).click()
  await shot('02-onboarding-about')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: 'Büro' }).click()
  for (const day of ['Di', 'Do', 'Sa']) await page.getByRole('button', { name: day, exact: true }).click()
  await page.getByRole('button', { name: 'Abends' }).click()
  await page.getByRole('button', { name: '60 Min' }).click()
  await shot('03-onboarding-routine')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: 'Gym', exact: true }).click()
  await page.getByRole('button', { name: 'Gym-Abo' }).click()
  await page.getByRole('button', { name: 'Geübt' }).click()
  await page.getByRole('button', { name: '3×' }).click()
  await page.getByRole('button', { name: '45 Min' }).click()
  await shot('04-onboarding-sport')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: 'Laufen', exact: true }).click()
  await shot('05-onboarding-limits')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: 'Manchmal' }).click()
  await page.getByRole('button', { name: '30 Min' }).click()
  await page.getByRole('button', { name: '2×' }).click()
  await page.getByRole('button', { name: 'Alles' }).click()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await shot('06-onboarding-nutrition')
  await page.getByRole('button', { name: 'Plan erstellen' }).click()

  // --------------------------------------------------------- the screens ---
  await page.waitForURL('**/today')
  await shot('07-today')

  // Exercise the status control so the interaction is verified, not just rendered.
  const firstDone = page.getByRole('button', { name: 'Erledigt' }).first()
  if (await firstDone.count()) {
    await firstDone.click()
    await shot('08-today-checked')
  }

  for (const [name, path] of [
    ['09-plan', '/plan'],
    ['10-progress', '/progress'],
    ['11-insights', '/insights'],
    ['12-playbook', '/playbook'],
    ['13-profile', '/profile'],
  ] as const) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await shot(name)
  }

  await browser.close()

  if (problems.length > 0) {
    console.error('\nBrowser problems:')
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('\nNo console errors, no page errors.')
}

main()
