// What the app knows about this person, read from the database rather than
// from client state — it is the same source the engine plans from, so the
// screen cannot show one thing while the plan was built from another.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { loadPlanInput } from '@/lib/db/plan-input'
import { ProfileView } from './ProfileView'

export default async function ProfilePage() {
  const user = await requireUser()
  const answers = await loadPlanInput(user.id)
  if (!answers) redirect('/onboarding')

  return <ProfileView answers={answers} />
}
