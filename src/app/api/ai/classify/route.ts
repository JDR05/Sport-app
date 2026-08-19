// Goal classification endpoint.
//
// Server-side because the API key must never reach the browser. Returns a
// classification in every case: with no key configured, the deterministic
// classifier answers and the response says so.

import { classifyGoal } from '@/lib/ai'

export const runtime = 'nodejs'

const MAX_GOAL_LENGTH = 500

export async function POST(request: Request): Promise<Response> {
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
