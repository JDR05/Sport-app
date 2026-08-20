// Refusing passwords that are already on a leak list.
//
// Supabase offers this, but only from the Pro plan up. It is worth having
// anyway: credential stuffing does not guess passwords, it replays the
// hundreds of millions that are already public, and a health app holds exactly
// the kind of data people would rather not have attached to their name.
//
// The password never leaves this server. The Pwned Passwords API works by
// k-anonymity: the client sends the first five characters of the SHA-1 hash
// and gets back every suffix sharing that prefix — several hundred of them —
// then looks for its own locally. The service learns a prefix that matches
// roughly one in a million hashes, and nothing else.
//
// `Add-Padding` asks for the response to be padded with fake entries, so the
// size of the reply cannot hint at how many real matches there were.
//
// It fails open, deliberately. If the service is slow or unreachable, sign-up
// proceeds — an outage at a third party must not lock people out of their own
// account. The length and shape rules in actions.ts still apply either way.

import { createHash } from 'node:crypto'

const ENDPOINT = 'https://api.pwnedpasswords.com/range'

/** Short: this sits in the sign-up path, and nobody waits for a nicety. */
const TIMEOUT_MS = 2500

export function hashParts(password: string): { prefix: string; suffix: string } {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5) }
}

/**
 * How often this suffix appears in the range response. The body is one
 * `SUFFIX:COUNT` per line; padded entries have a count of 0 and are ignored by
 * the same code path that ignores a miss.
 */
export function countInRange(body: string, suffix: string): number {
  for (const line of body.split('\n')) {
    const [candidate, count] = line.trim().split(':')
    if (candidate === suffix) {
      const n = Number(count)
      return Number.isFinite(n) ? n : 0
    }
  }
  return 0
}

/** True if leaked, false if not, null if the check could not be made. */
export async function isPwned(password: string): Promise<boolean | null> {
  const { prefix, suffix } = hashParts(password)

  try {
    const response = await fetch(`${ENDPOINT}/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) return null
    return countInRange(await response.text(), suffix) > 0
  } catch {
    return null
  }
}
