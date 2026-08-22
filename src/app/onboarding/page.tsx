// The onboarding, wrapped in a server component.
//
// Three reasons, and the third is why this file exists at all:
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
//   3. It refuses to hand a blank intake to someone who already has a goal.
//      Submitting the form retires the current goal and starts a new one, so
//      the form is destructive — and it used to be reachable with no warning
//      at all. Anyone who landed here for any reason lost their setup by
//      filling it in, which is precisely what it looks like from the outside:
//      "the onboarding keeps coming back". Redoing the intake is now something
//      a person asks for, with the goal they would be replacing named first.
//
// scripts/check-nonces.mjs now fails the build if any prerendered page ships a
// script without a nonce, so the hydration problem cannot come back quietly.

import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { loadPlanInput } from '@/lib/db/plan-input'
import { Button, Card, Screen, ScreenTitle } from '@/components/ui'
import { OnboardingForm } from './OnboardingForm'

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  const user = await requireUser()
  const existing = await loadPlanInput(user.id)
  const wantsReset = (await searchParams).reset === '1'

  if (existing && !wantsReset) {
    return (
      <Screen>
        <ScreenTitle
          title="Du hast schon ein Ziel"
          subtitle="Die Angaben sind gespeichert. Du musst hier nichts noch einmal machen."
        />

        <Card tone="accent">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Dein Ziel</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
            {existing.goal.rawText}
          </p>
        </Card>

        <div className="mt-6 flex flex-col gap-3">
          <Link href="/today">
            <Button>Zurück zu Heute</Button>
          </Link>
          <Link href="/onboarding?reset=1">
            <Button variant="quiet">Ziel neu definieren</Button>
          </Link>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          Ein neues Ziel ersetzt das jetzige. Was du bisher abgehakt hast, bleibt erhalten — dein
          altes Ziel wird pausiert, nicht gelöscht.
        </p>
      </Screen>
    )
  }

  // Handed the existing intake when there is one, so redefining a goal edits
  // what the person already told us instead of replacing it with blanks. The
  // goal text itself is deliberately not carried over — see toDraft.
  return <OnboardingForm existing={existing} />
}
