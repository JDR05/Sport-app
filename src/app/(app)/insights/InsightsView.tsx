'use client'

// What the app has noticed, and what it is careful not to claim.
//
// Most of the time this screen says nothing, and that is the design. A single
// deviation is not a pattern; two rough days in one week are not a pattern. The
// thresholds live in the adaptive engine and are deliberately hard to reach —
// so the honest state of this screen, for the first couple of weeks, is empty.
//
// When it does speak, every statement carries the actions it was derived from.
// A recommendation that cannot point at its evidence must not exist.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { applyCorrections, respondToExperiment } from '@/app/(app)/actions'
import { Button, Card, EmptyState, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { MIN_DISTINCT_WEEKS } from '@/lib/adaptive/constants'
import { formatGermanDate } from '@/lib/engine/dates'
import type { Insight } from '@/lib/adaptive'
import type { AiProposal } from '@/lib/domain/types'

export type InsightsData = {
  today: string
  /** Where this person's plan reliably works. Shown above everything else. */
  strengths: Insight[]
  insights: Insight[]
  experiment: {
    hypothesis: string
    changeDescription: string
    endDate: string
    evidenceCount: number
  } | null
  /** An experiment the user already accepted, still within its period. */
  running: {
    hypothesis: string
    changeDescription: string
    endDate: string
  } | null
  /** The verdict of an experiment that just finished. */
  concluded: { hypothesis: string; reason: string; ruleWritten: boolean } | null
  patchNotes: string[]
  moveCount: number
  removalCount: number
  weeksWithData: number
  /**
   * One observation and one suggestion, written from this week's own data —
   * including the check-in notes nothing else reads. Null most weeks.
   */
  note: {
    weekStart: string
    observation: string
    suggestion: string
    question: string | null
    evidence: string[]
  } | null
  /**
   * Everything the model contributed, gathered in one place.
   *
   * Here rather than in a tab of its own. This screen is already "what the app
   * has worked out about you", and the product's whole claim is that the model
   * and the deterministic detection are one picture of a person — two tabs
   * would make them two features.
   */
  ai: {
    /** Null when no provider is configured. Then there is nothing to show. */
    provider: string | null
    granted: boolean
    proposal: AiProposal | null
    /** Questions the model asked and the person skipped. */
    openQuestions: string[]
  }
}

export function InsightsView({ data }: { data: InsightsData }) {
  const router = useRouter()
  const [responding, setResponding] = useState(false)

  const [applying, setApplying] = useState(false)

  const respond = async (accept: boolean) => {
    setResponding(true)
    await respondToExperiment(data.today, accept)
    setResponding(false)
    router.refresh()
  }

  // The corrections used to be a sentence about a data structure. The count
  // was printed, nothing moved, and the same offer came back every week.
  const apply = async () => {
    setApplying(true)
    await applyCorrections(data.today)
    setApplying(false)
    router.refresh()
  }

  return (
    <Screen>
      <ScreenTitle title="Insights" subtitle="Was funktioniert bei dir – und was nicht?" />

      {/* The one thing a rule could not have found.
          
          Above the deterministic sections because it is the part that read the
          free text — someone writing "war krank" is the difference between a
          circumstance and a pattern about Wednesdays. Deliberately one
          observation and one suggestion, never a list: a weekly feature that
          must fill a screen fills it with the generic advice checkWeeklyNote
          exists to refuse. */}
      {data.note && (
        <>
          <SectionHeading>Diese Woche</SectionHeading>
          <Card tone="accent">
            <p className="text-sm leading-relaxed text-ink">{data.note.observation}</p>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-ink">
              {data.note.suggestion}
            </p>
            {data.note.question && (
              <p className="mt-3 border-t border-accent/20 pt-3 text-sm leading-relaxed text-muted">
                {data.note.question}
              </p>
            )}
            <p className="mt-3 text-xs text-faint">
              Aus deinen Daten dieser Woche · <span className="num">{data.note.evidence.length}</span>{' '}
              Belege
            </p>
          </Card>
        </>
      )}

      {/* What the model actually did, in the person's own plan.
          
          Until now its work was invisible: the actions were mixed into the
          plan with everything else, so the honest question "does the AI do
          anything for me" had no answer anywhere in the app. Naming the
          contribution is also what makes it reviewable — an action nobody can
          trace to a source is one nobody can disagree with. */}
      {data.ai.provider !== null && (
        <>
          <SectionHeading>Was die KI beiträgt</SectionHeading>
          {data.ai.proposal ? (
            <Card>
              <p className="text-sm font-semibold leading-snug text-ink">
                {data.ai.proposal.headline}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {data.ai.proposal.reasoning}
              </p>
              <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                {data.ai.proposal.actions.map((action) => (
                  <div key={action.title}>
                    <p className="text-sm font-medium text-ink">{action.title}</p>
                    <p className="num mt-0.5 text-xs text-faint">
                      {action.minutes} min · {action.timesPerWeek}×/Woche
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{action.reasoning}</p>
                  </div>
                ))}
              </div>
              {/* Set as prose, not as a label. `.label` is uppercase mono for
                  headings and tags; a 46-character German sentence in it fills
                  the whole width of a phone card in shouting caps. ui.tsx
                  records this exact mistake being fixed once already. */}
              <p className="mt-3 text-xs text-faint">
                {data.ai.proposal.mode === 'takeover'
                  ? 'Diese Aktionen sind deine Zielspur.'
                  : 'Zusätzlich zu dem, was der Archetyp geplant hat.'}
              </p>
            </Card>
          ) : (
            <EmptyState
              title={data.ai.granted ? 'Noch nichts von der KI' : 'KI nicht erlaubt'}
              body={
                data.ai.granted
                  ? 'Dein Ziel wurde noch nicht von einem Modell angesehen — oder es hatte nichts beizutragen. Der Plan steht trotzdem, er ist deterministisch gebaut.'
                  : 'Ohne dein Häkchen wird nichts an ein Modell geschickt. Der Plan wird deterministisch gebaut und funktioniert vollständig.'
              }
            />
          )}

          {data.ai.openQuestions.length > 0 && (
            <div className="mt-3">
              <Card>
                <p className="text-sm font-semibold text-ink">
                  Das wollte die KI noch wissen
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {data.ai.openQuestions.map((question) => (
                    <li key={question} className="text-sm leading-relaxed text-muted">
                      {question}
                    </li>
                  ))}
                </ul>
                {/* Übersprungen ist nicht Nein. Sichtbar zu lassen, was die App
                    noch nicht weiß, ist ehrlicher, als es still abzulegen. */}
                <p className="mt-2 text-xs leading-relaxed text-faint">
                  Du hast das übersprungen — völlig in Ordnung. Beantwortest du es später,
                  wird der nächste Plan genauer.
                </p>
              </Card>
            </div>
          )}

          <div className="mt-3">
            <Link href="/ai">
              <Button variant="quiet">Ziel von der KI ansehen lassen</Button>
            </Link>
          </div>
          <Note>
            Die KI entwirft, was zu tun ist. Wann etwas stattfindet, entscheidet die App —
            sie kennt als Einzige deine freien Zeitfenster, Ruhetage und Grenzen.
          </Note>
        </>
      )}

      {/* Said first, and deliberately given its own heading. Six weeks in which
          the only thing the app has ever told someone is where they fall short
          is how a health app turns into a second job — and the one thing this
          product has that a chat does not is that it can point at the days. */}
      {data.strengths.length > 0 && (
        <>
          <SectionHeading>Was bei dir funktioniert</SectionHeading>
          <div className="mb-2 flex flex-col gap-3">
            {data.strengths.map((strength, index) => (
              <Card key={index} tone="accent">
                <p className="text-sm leading-relaxed text-ink">{strength.statement}</p>
                <p className="mt-2 text-xs text-faint">
                  Beruht auf {strength.evidence.length}{' '}
                  {strength.evidence.length === 1 ? 'Aktion' : 'Aktionen'}, die du umgesetzt hast.
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionHeading>Muster</SectionHeading>
      {data.insights.length === 0 ? (
        <EmptyState
          title="Noch kein Muster erkannt"
          body="Eine einzelne Abweichung ist kein Muster. Die App wartet, bis sich etwas über mehrere Wochen wiederholt — lieber später etwas Belastbares als früh etwas Erfundenes."
          progress={{ done: data.weeksWithData, needed: MIN_DISTINCT_WEEKS, unit: 'Wochen' }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.insights.map((insight, index) => (
            <Card key={index}>
              <p className="text-sm leading-relaxed text-ink">{insight.statement}</p>
              <p className="mt-2 text-xs text-faint">
                Beruht auf {insight.evidence.length}{' '}
                {insight.evidence.length === 1 ? 'Aktion' : 'Aktionen'} aus deinem Plan.
              </p>
            </Card>
          ))}
        </div>
      )}

      {data.concluded && (
        <>
          <SectionHeading>Ergebnis</SectionHeading>
          <Card tone={data.concluded.ruleWritten ? 'accent' : 'default'}>
            <p className="text-[15px] font-semibold leading-snug text-ink">
              {data.concluded.hypothesis}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{data.concluded.reason}</p>
            {data.concluded.ruleWritten && (
              <p className="mt-2 text-xs text-faint">
                Als persönliche Regel übernommen. Sie gilt ab der nächsten Woche.
              </p>
            )}
          </Card>
        </>
      )}

      <SectionHeading>Laufende Experimente</SectionHeading>
      {data.running !== null ? (
        <Card tone="accent">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Läuft</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
            {data.running.hypothesis}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {data.running.changeDescription}
          </p>
          <p className="mt-2 text-xs text-faint">
            Ergebnis am {formatGermanDate(data.running.endDate)}. Bis dahin ändert sich nichts —
            eine Zwischenbewertung wäre nur Rauschen.
          </p>
        </Card>
      ) : data.experiment === null ? (
        <EmptyState
          title="Kein Experiment aktiv"
          body="Sobald ein Muster belegt ist, schlägt die App genau eine kleine Änderung vor, misst sie über einen festen Zeitraum und behält sie nur, wenn sie wirkt."
        />
      ) : (
        <Card tone="accent">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Vorschlag</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
            {data.experiment.hypothesis}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {data.experiment.changeDescription}
          </p>
          <p className="mt-2 text-xs text-faint">
            Ausgewertet wird an deiner Umsetzungsquote, nie an einem Zielwert. Belegt durch{' '}
            {data.experiment.evidenceCount} Aktionen.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Button type="button" onClick={() => respond(true)} disabled={responding}>
              {responding ? 'Einen Moment …' : 'Ausprobieren'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => respond(false)} disabled={responding}>
              Passt nicht zu mir
            </Button>
          </div>
          <p className="mt-2 text-xs text-faint">
            Ablehnen ist kein Nein zum Plan. Es ist selbst eine Information und wird gespeichert.
          </p>
        </Card>
      )}

      {(data.moveCount > 0 || data.removalCount > 0) && (
        <>
          <SectionHeading>Kleine Korrekturen</SectionHeading>
          <Card>
            <p className="text-sm leading-relaxed text-ink">
              {data.moveCount > 0 &&
                (data.moveCount === 1
                  ? 'Für eine ausgefallene Aktion gibt es diese Woche noch einen freien Tag. '
                  : `Für ${data.moveCount} ausgefallene Aktionen gibt es diese Woche noch freie Tage. `)}
              {data.removalCount > 0 &&
                (data.removalCount === 1
                  ? 'Eine Wiederholung von etwas, das nicht zu dir passt, wird dir nicht noch einmal gestellt.'
                  : `${data.removalCount} Wiederholungen von etwas, das nicht zu dir passt, werden dir nicht noch einmal gestellt.`)}
            </p>
            {data.patchNotes.map((note) => (
              <p key={note} className="mt-2 text-xs text-faint">
                {note}
              </p>
            ))}

            {/* ADR-039 says a week is a promise already made, so it may be
                changed by the person and never under them. That is why this is
                a button rather than something that happens on load. */}
            <div className="mt-3">
              <Button type="button" variant="quiet" onClick={apply} disabled={applying}>
                {applying ? 'Einen Moment …' : 'Übernehmen'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-faint">
              Der ausgefallene Tag bleibt stehen, wie er war — nachgeholt wird zusätzlich, nicht
              statt. Was du schon beantwortet hast, bleibt, wie du es beantwortet hast.
            </p>
          </Card>
        </>
      )}

      <SectionHeading>Dein Playbook</SectionHeading>
      <Link href="/playbook" className="block">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Persönliche Regeln</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Was die App über dich gelernt hat. Nur bestätigte Experimente landen hier.
              </p>
            </div>
            <span aria-hidden className="text-xl text-faint">
              ›
            </span>
          </div>
        </Card>
      </Link>

      <Note>
        Ein Vorschlag entsteht erst, wenn sich eine Abweichung über mindestens{' '}
        {MIN_DISTINCT_WEEKS} verschiedene Wochen zieht und deutlich vom Rest abweicht. Tage ohne
        Eintrag zählen nie als Versäumnis.
      </Note>
    </Screen>
  )
}
