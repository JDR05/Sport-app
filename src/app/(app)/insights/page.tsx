// The adaptive engine, pointed at real data for the first time.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { serverToday } from '@/lib/db/today'
import { weeklyReview } from '@/lib/db/analysis'
import {
  concludeIfDue, declinedRules, fingerprint, loadRunningExperiment,
} from '@/lib/db/experiments'
import { ensureWeeklyNote, loadWeeklyNotes } from '@/lib/db/weekly-note'
import { loadPlanInput } from '@/lib/db/plan-input'
import { loadActionPreferences } from '@/lib/db/action-preferences'
import { weekdayOf } from '@/lib/engine/dates'
import { providerName } from '@/lib/ai'
import { readConsent } from '@/lib/ai/consent'
import { InsightsView, type InsightsData } from './InsightsView'
import type { Observation } from '@/lib/adaptive/types'
import type { Weekday } from '@/lib/domain/types'

/**
 * Which days of this week each action title actually sits on.
 *
 * Keyed by title because that is what identifies a proposed action everywhere
 * else — and it deliberately matches shaped items too: on a goal whose
 * archetype owns the domain, "45 Minuten Krafttraining im Gym" is the title of
 * a session the engine planned, not of a row the model added, and from the
 * screen those are the same thing.
 */
function placementOf(week: Observation[]): Record<string, Weekday[]> {
  const byTitle: Record<string, Weekday[]> = {}
  for (const item of week) {
    const day = weekdayOf(item.scheduledOn)
    const days = (byTitle[item.title] ??= [])
    if (!days.includes(day)) days.push(day)
  }
  return byTitle
}

export default async function InsightsPage() {
  const user = await requireUser()
  const today = await serverToday()

  // Settling a finished experiment before reading the analysis matters: its
  // rule has to be in place before the next plan is built, or the change the
  // person agreed to would silently skip a week.
  const concluded = await concludeIfDue(user.id, today)
  const running = await loadRunningExperiment(user.id)
  // What this person has already turned down for this goal. Re-offering it is
  // how "deine Antwort wird gespeichert" becomes a sentence the screen
  // disproves one render later.
  const declined = await declinedRules(user.id)

  const review = await weeklyReview(user.id, today)
  if (!review) redirect('/onboarding')

  // The ongoing half of the AI. Written once per occasion and then fixed; no
  // impulse at all is the normal answer for a quiet week, for no key, and for
  // an answer that did not survive the safety checks. Never throws — nothing
  // here is worth a screen.
  //
  // Two calls, and both are cheap unless something actually happened:
  // `ensureWeeklyNote` checks for an occasion and writes at most one, then the
  // read returns everything this week has produced. Since ADR-097 that can be
  // more than one, and showing only the newest would hide Tuesday's the moment
  // Thursday's arrived.
  await ensureWeeklyNote(user.id, today)
  const notes = await loadWeeklyNotes(user.id, today)

  // Everything the model has contributed, in one place.
  //
  // Insights rather than a sixth tab: this screen is already "what the app has
  // worked out about you", and the product's claim is that the model and the
  // deterministic detection are one picture of a person rather than two
  // features side by side. Splitting them across two tabs would contradict the
  // thing the app is for — and a mobile bottom bar is full at five.
  const [answers, consent, preferences] = await Promise.all([
    loadPlanInput(user.id),
    readConsent(user.id),
    loadActionPreferences(user.id),
  ])

  const { analysis } = review

  const data: InsightsData = {
    today,
    // The strengths are lifted out of the insight list rather than left in it:
    // they get their own heading on the screen, and a good finding buried
    // between two shortfalls reads as a consolation prize.
    strengths: analysis.insights.filter((i) => i.kind === 'progress'),
    // While one is running, no second proposal is shown. One variable at a
    // time is what makes either result readable.
    insights: analysis.insights.filter((i) => i.kind !== 'progress'),
    experiment:
      running ||
      (analysis.experiment &&
        declined.includes(
          fingerprint(
            analysis.experiment.proposedRule.ruleKey,
            analysis.experiment.proposedRule.ruleValue,
          ),
        ))
      ? null
      : analysis.experiment
      ? {
          hypothesis: analysis.experiment.hypothesis,
          changeDescription: analysis.experiment.changeDescription,
          endDate: analysis.experiment.endDate,
          evidenceCount: analysis.experiment.evidence.length,
        }
      : null,
    running: running
      ? {
          hypothesis: running.hypothesis,
          changeDescription: running.changeDescription,
          endDate: running.endDate,
        }
      : null,
    concluded: concluded
      ? {
          hypothesis: concluded.hypothesis,
          reason: concluded.evaluation.reason,
          ruleWritten: concluded.ruleWritten,
        }
      : null,
    patchNotes: analysis.patch.notes,
    moveCount: analysis.patch.moves.length,
    removalCount: analysis.patch.removals.length,
    weeksWithData: review.weeksWithData,
    notes,
    ai: {
      provider: providerName(),
      granted: consent.granted,
      proposal: answers?.aiProposal ?? null,
      // What this person asked for, and where it actually landed.
      //
      // The second half is the one that closes the loop he kept pointing at:
      // "sodass mir diese Vorschläge irgendwo einordnen, wo ich Zeit hab und
      // das mir dann vorne hin Heute anzeigen und in meinem Plan." A list that
      // says what the AI suggested, without saying which days it ended up on,
      // is the same screen that made the plan feel like it hid everything.
      preferences,
      placement: placementOf(review.thisWeek),
      // Questions the model asked and the person skipped. Kept visible because
      // a skipped answer is `unknown`, not "no" — and the app should be able to
      // say what it still does not know rather than quietly filing it away.
      openQuestions: (answers?.intakeAnswers ?? [])
        .filter((a) => a.answer === null)
        .map((a) => a.question),
    },
  }

  return <InsightsView data={data} />
}
