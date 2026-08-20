// The onboarding, wrapped in a server component.
//
// Two reasons, and the second one is why this file exists at all:
//
//   1. It verifies the session next to the work, like every other screen. The
//      form writes rows for a user, so the user has to be established first.
//
//   2. It forces dynamic rendering, and that is not a detail. The CSP uses a
//      per-request nonce with 'strict-dynamic', which makes the browser ignore
//      'self' and trust only scripts carrying that nonce. A prerendered page
//      cannot carry one — it was built before the request existed. The result
//      is a page that looks completely normal, accepts typing, and never
//      hydrates, so every button stays frozen in its server-rendered state.
//      That is exactly what happened here.
//
// scripts/check-nonces.mjs now fails the build if any prerendered page ships a
// script without a nonce, so this cannot come back quietly.

import { requireUser } from '@/lib/auth/session'
import { OnboardingForm } from './OnboardingForm'

export default async function OnboardingPage() {
  await requireUser()
  return <OnboardingForm />
}
