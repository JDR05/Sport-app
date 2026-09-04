// What the app knows about this person, read from the database rather than
// from client state — it is the same source the engine plans from, so the
// screen cannot show one thing while the plan was built from another.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { providerLearnsFromData, providerName } from '@/lib/ai'
import { readConsent } from '@/lib/ai/consent'
import { loadPlanInput } from '@/lib/db/plan-input'
import { reminderSettings } from '@/lib/db/push'
import { isTheme, THEME_COOKIE } from '@/lib/theme'
import { ProfileView } from './ProfileView'

export default async function ProfilePage() {
  const user = await requireUser()
  const answers = await loadPlanInput(user.id)
  if (!answers) redirect('/onboarding')

  const stored = (await cookies()).get(THEME_COOKIE)?.value
  const consent = await readConsent(user.id)
  const reminders = await reminderSettings(user.id)

  return (
    <ProfileView
      answers={answers}
      theme={isTheme(stored) ? stored : 'system'}
      // Both read on the server. The provider name comes from the configured
      // endpoint, which the browser must never see.
      provider={providerName()}
      reminders={reminders}
      learnsFromData={providerLearnsFromData()}
      consent={{ granted: consent.granted, outdated: consent.outdated }}
    />
  )
}
