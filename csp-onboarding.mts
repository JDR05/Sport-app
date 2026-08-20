import { chromium } from 'playwright'
const EXEC = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: EXEC })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const violations: string[] = []
page.on('console', (m) => {
  const t = m.text()
  if (/Content Security Policy|Refused to/i.test(t)) violations.push(t)
})
page.on('pageerror', (e) => violations.push('pageerror: ' + String(e)))

await page.goto('http://localhost:3113/onboarding', { waitUntil: 'networkidle' })

const nonce = await page.evaluate(() => {
  const s = document.querySelector('script[nonce]') as HTMLScriptElement | null
  return s?.nonce || s?.getAttribute('nonce') || null
})
// Type into the textarea the way a person would, then see if React noticed.
await page.locator('textarea').fill('5kg abnehmen')
await page.waitForTimeout(400)
const disabled = await page.locator('button:has-text("Weiter")').isDisabled()

console.log('Nonce im HTML: ', nonce ? nonce.slice(0, 12) + '…' : 'KEINS')
console.log('CSP-Verstöße:  ', violations.length === 0 ? 'keine' : violations.slice(0, 4))
console.log('Weiter-Button nach Eingabe disabled?', disabled, disabled ? '  <-- BUG REPRODUZIERT' : '  <-- funktioniert')
await browser.close()
