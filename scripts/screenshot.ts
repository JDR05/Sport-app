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
  // A sleep goal on purpose: before the course correction the app could only
  // plan weight loss, so this is the flow that proves the goal is open.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForURL('**/onboarding')
  await page.getByPlaceholder('Ich möchte …').fill('Ich will endlich besser schlafen')
  await shot('01-goal-freetext')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByPlaceholder('z. B. 1995').fill('1995')
  await page.getByRole('button', { name: 'Männlich' }).click()
  await shot('02-about')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: 'Büro' }).click()
  for (const day of ['Di', 'Do', 'Sa']) await page.getByRole('button', { name: day, exact: true }).click()
  await page.getByRole('button', { name: 'Abends' }).click()
  await page.getByRole('button', { name: '60 Min' }).click()
  await shot('03-routine')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: 'Gym', exact: true }).click()
  await page.getByRole('button', { name: 'Gym-Abo' }).click()
  await page.getByRole('button', { name: 'Geübt' }).click()
  await page.getByRole('button', { name: '3×' }).click()
  await shot('04-sport')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: 'Manchmal' }).click()
  await page.getByRole('button', { name: 'Alles' }).click()
  await shot('05-nutrition')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.locator('input[type="time"]').first().fill('00:45')
  await page.locator('input[type="time"]').last().fill('06:30')
  await page.getByRole('button', { name: 'Schlecht' }).click()
  await shot('06-sleep')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await page.getByRole('button', { name: '6 h' }).click()
  await page.getByRole('button', { name: 'Schwer' }).click()
  await shot('07-mind')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await shot('08-limits')
  await page.getByRole('button', { name: 'Plan erstellen' }).click()

  // --------------------------------------------------------- the screens ---
  await page.waitForURL('**/today')
  await shot('09-today')

  // Exercise the status control so the interaction is verified, not just rendered.
  const firstDone = page.getByRole('button', { name: 'Erledigt' }).first()
  if (await firstDone.count()) {
    await firstDone.click()
    await shot('10-today-checked')
  }

  for (const [name, path] of [
    ['11-plan', '/plan'],
    ['12-progress', '/progress'],
    ['13-insights', '/insights'],
    ['14-playbook', '/playbook'],
    ['15-profile', '/profile'],
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
