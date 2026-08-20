// The front door.
//
// A server redirect rather than a client one: it decides before anything
// renders, so nobody sees an empty screen flash while JavaScript works out
// where they should have gone.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { loadPlanInput } from '@/lib/db/plan-input'

export default async function RootPage(): Promise<never> {
  const user = await requireUser()
  const answers = await loadPlanInput(user.id)
  redirect(answers ? '/today' : '/onboarding')
}
