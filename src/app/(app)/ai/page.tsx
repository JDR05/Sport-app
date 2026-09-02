// Catching an existing goal up with the model.
//
// A screen that exists because of a real dead end: a goal set up before an API
// key was configured is stamped "asked, nothing came back" for ever, so
// ticking the consent box later changed nothing at all. The only way through
// was to redo the onboarding — which retires the goal and throws away its
// tracking history to fix a timestamp.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { providerLearnsFromData, providerName } from '@/lib/ai'
import { readConsent } from '@/lib/ai/consent'
import { loadPlanInput } from '@/lib/db/plan-input'
import { AiCatchUpView } from './AiCatchUpView'

export default async function AiPage() {
  const user = await requireUser()
  const answers = await loadPlanInput(user.id)
  if (!answers) redirect('/onboarding')

  const consent = await readConsent(user.id)

  return (
    <AiCatchUpView
      goalText={answers.goal.rawText}
      classifiedBy={answers.goal.classifiedBy}
      hasProposal={answers.aiProposal != null}
      provider={providerName()}
      learnsFromData={providerLearnsFromData()}
      consent={{ granted: consent.granted, outdated: consent.outdated }}
    />
  )
}
