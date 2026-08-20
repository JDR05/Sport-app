#!/usr/bin/env node
// Fails the build if a prerendered page ships a script the CSP will block.
//
// The bug this exists to prevent is nasty precisely because it looks like
// nothing: the page renders, the styling is right, typing works — and not a
// single button responds, because React never hydrated. No error is shown to
// the user, and the server logs are clean.
//
// The cause is structural. The Content-Security-Policy uses a per-request
// nonce together with 'strict-dynamic', which tells the browser to ignore
// 'self' and trust only scripts carrying that nonce. A statically prerendered
// page was built before the request existed, so its scripts cannot carry one
// and every last of them is refused.
//
// Rendering such a page dynamically is the fix. This script is what makes
// forgetting that loud instead of silent.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = '.next/server/app'

async function htmlFiles(dir) {
  const found = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await htmlFiles(path)))
    else if (entry.name.endsWith('.html')) found.push(path)
  }
  return found
}

/**
 * The one page that is allowed to ship without a nonce.
 *
 * `global-error` replaces the root layout when the root layout itself failed,
 * so Next prerenders it deliberately: it must exist even when the app cannot
 * produce anything. It therefore cannot carry a per-request nonce, and no
 * amount of configuration changes that.
 *
 * It earns the exemption by needing no JavaScript at all — which is checked
 * below rather than assumed, so adding a button to it fails the build.
 */
const ALLOWED_WITHOUT_NONCE = ['_global-error.html']

const files = await htmlFiles(ROOT)
if (files.length === 0) {
  console.log('check-nonces: no prerendered pages, nothing to check')
  process.exit(0)
}

const offenders = []
for (const file of files) {
  const html = await readFile(file, 'utf8')

  if (ALLOWED_WITHOUT_NONCE.some((name) => file.endsWith(name))) {
    // Exempt only while it genuinely works without scripts.
    //
    // A submit button inside a form is fine — that is a browser feature older
    // than JavaScript, and Next's own 500 shell uses exactly that to offer a
    // reload. What does not work is a control that needs a handler: an inline
    // onclick, or a type="button" whose only purpose is to call into React.
    const needsScript = /onclick=/i.test(html) || /<button\b[^>]*type=["']button["']/i.test(html)
    if (needsScript) {
      console.error(
        `\ncheck-nonces: ${file} is exempt from the nonce rule because it must work\n` +
          'without JavaScript, but it now contains an interactive element. That control\n' +
          'will do nothing when clicked. Use a plain link instead.\n',
      )
      process.exit(1)
    }
    continue
  }
  // Every <script> that is not a plain external reference needs a nonce, and
  // under 'strict-dynamic' so do the external ones.
  const tags = html.match(/<script\b[^>]*>/g) ?? []
  const withoutNonce = tags.filter((tag) => !tag.includes('nonce='))
  if (withoutNonce.length > 0) {
    offenders.push({ file, total: tags.length, blocked: withoutNonce.length })
  }
}

if (offenders.length === 0) {
  console.log(`check-nonces: ${files.length} prerendered page(s), all scripts carry a nonce`)
  process.exit(0)
}

console.error('\ncheck-nonces: prerendered pages carry scripts the CSP will refuse.\n')
for (const o of offenders) {
  console.error(`  ${o.file} — ${o.blocked} of ${o.total} script tags have no nonce`)
}
console.error(
  '\nThese pages will render, accept typing, and never hydrate: every button\n' +
    'stays frozen with no error anywhere. Render them dynamically instead —\n' +
    'wrapping the page in a server component that awaits requireUser() is\n' +
    'usually both the fix and the right thing to do anyway.\n',
)
process.exit(1)
