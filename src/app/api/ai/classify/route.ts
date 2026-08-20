// Goal classification endpoint.
//
// Server-side because the API key must never reach the browser. Returns a
// classification in every case: with no key configured, the deterministic
// classifier answers and the response says so.
//
// The session check is deliberately duplicated here. The proxy already turns
// away anonymous callers, but the Next docs are clear that the proxy is an
// optimistic check, and this is the one endpoint in the app that costs real
// money per call. An unauthenticated caller looping over it would run up the
// bill, so the guard sits where the spending happens too.

import { classifyGoal } from '@/lib/ai'
import { currentUser } from '@/lib/auth/session'

export const runtime = 'nodejs'

const MAX_GOAL_LENGTH = 500

export async function POST(request: Request): Promise<Response> {
  if (!(await currentUser())) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const rawText = (body as { rawText?: unknown })?.rawText
  if (typeof rawText !== 'string' || rawText.trim().length < 3) {
    return Response.json({ error: 'rawText must be at least 3 characters' }, { status: 400 })
  }

  const result = await classifyGoal(rawText.slice(0, MAX_GOAL_LENGTH))
  return Response.json(result)
}
