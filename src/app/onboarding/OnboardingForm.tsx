'use client'

// Onboarding.
//
// The goal comes first, in the user's own words, and everything after it is a
// complete intake across all areas of life — decision of the product owner, see
// ADR-024. The breadth is what lets the app work on general health and on the
// one specific goal at the same time, and it is what the AI layer needs in order
// to say anything specific at all.
//
// Classification runs deterministically here. When an API key is configured the
// AI layer classifies instead and this stays as the fallback.

import { useMemo, useState } from 'react'
import { completeOnboarding, finishOnboarding } from './actions'
import { Button, Card, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { AiConsent, type ConsentView } from '@/components/AiConsent'
import { IntakeQuestionsStep } from './IntakeQuestionsStep'
import {
  ChoiceGroup, DateInput, Field, MultiChoice, NumberInput, StepProgress, TextArea, TimeInput,
} from '@/components/form'
import { CommitmentsStep } from './CommitmentsStep'
import { classifyGoalText } from '@/lib/engine'
import { addDays } from '@/lib/engine/dates'
import { buildAnswers, EMPTY, METRIC_FOR, toDraft, type Draft } from './draft'
// Typed by the very schema the server validates against, so a drift between
// what the form sends and what the action accepts is a compile error here
// rather than a refusal the person reads on the last step.
import type { OnboardingPayload } from './schema'
import {
  areaIsAsked, fieldsFor, skippedAreas, type IntakeArea, type IntakeField,
} from '@/lib/domain/intakeFocus'
import type { StoredPlanInput } from '@/lib/db/plan-input'
import { WEEKDAYS, type GoalArchetype } from '@/lib/domain/types'
import type { IntakeAnswer, Weekday } from '@/lib/domain/types'
import type { IntakeQuestion } from '@/lib/ai/schemas'

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
}

const ARCHETYPE_LABEL: Record<GoalArchetype, string> = {
  body_composition: 'Körper & Gewicht',
  strength: 'Kraft',
  endurance: 'Ausdauer',
  sleep_recovery: 'Schlaf',
  nutrition_quality: 'Ernährung',
  habit_routine: 'Gewohnheit',
  general_health: 'Allgemein',
}

const STEPS = ['Ziel', 'Messbar', 'Über dich', 'Alltag', 'Fest', 'Sport', 'Ernährung', 'Schlaf', 'Kopf', 'Grenzen'] as const
type Step = (typeof STEPS)[number]

/**
 * Which steps ask about the person, and are therefore skippable.
 *
 * The five that are not listed are asked of everybody: the goal is the point,
 * the metric follows from it, "Alltag" and "Fest" are the only source of the
 * hours a plan can be placed in, and "Grenzen" is where somebody says what the
 * app may never schedule. None of those depend on which goal it is.
 */
/** What each skippable step is called when the app explains that it skipped it. */
const AREA_LABEL: Record<IntakeArea, string> = {
  body: 'Körperdaten',
  sport: 'Sport',
  nutrition: 'Ernährung',
  sleep: 'Schlaf',
  mind: 'Kopf',
}

const STEP_AREA: Partial<Record<Step, IntakeArea>> = {
  'Über dich': 'body',
  Sport: 'sport',
  'Ernährung': 'nutrition',
  Schlaf: 'sleep',
  Kopf: 'mind',
}

export function OnboardingForm({
  existing,
  today,
  provider,
  learnsFromData,
  consent,
}: {
  existing?: StoredPlanInput | null
  /** Today, as the person experiences it. Comes from the server so both renders agree. */
  today: string
  /** Which company would receive the data. Null when none is configured. */
  provider: string | null
  /** Whether the configured tier lets the provider learn from what is sent. */
  learnsFromData: boolean
  consent: ConsentView
}) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Prefilled when someone is redefining a goal rather than setting a first
  // one, so the rest of their intake is not silently replaced by blanks.
  const [d, setD] = useState<Draft>(() => (existing ? toDraft(existing) : EMPTY))

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((prev) => ({ ...prev, [key]: value }))

  // Deterministic classification is instant and shown straight away. When an API
  // key is configured the server upgrades it on the way to the next step; until
  // then this is the answer, and the UI says which one the user is looking at.
  const detected = useMemo(() => classifyGoalText(d.goalText), [d.goalText])
  const [aiArchetype, setAiArchetype] = useState<GoalArchetype | null>(null)
  const [classifying, setClassifying] = useState(false)
  // Mirrors what the server stored, so the step can say which classifier will
  // answer before anybody presses anything.
  const [ai, setAi] = useState({ granted: consent.granted, pending: false })
  // Null until the intake has been saved and the model has been asked. An
  // empty array never lands here — that path goes straight to the plan.
  const [questions, setQuestions] = useState<IntakeQuestion[] | null>(null)
  const archetype = d.archetype ?? aiArchetype ?? detected.archetype
  const metricSpec = METRIC_FOR[archetype]

  /**
   * What this goal is asked.
   *
   * Derived from which code reads which field (see `intakeFocus.ts`), so a
   * question disappears only when nothing that runs for this goal would have
   * read the answer. Somebody working on their sleep is no longer asked how
   * long they have to cook; somebody working on their weight still is, because
   * the calorie target depends on it.
   */
  const asked = useMemo(() => fieldsFor(archetype), [archetype])
  const ask = (field: IntakeField) => asked.has(field)
  /** The steps this goal is spared, named on the goal screen so it is not a silent cut. */
  const spared = useMemo(
    () => skippedAreas(archetype).map((area) => AREA_LABEL[area]),
    [archetype],
  )

  // The metric step is skipped for goals that have no number to state; a
  // profile step is skipped when this goal reads none of its fields.
  const visibleSteps = STEPS.filter((name, i) => {
    if (i === 1) return metricSpec !== undefined
    const area = STEP_AREA[name]
    return area === undefined || areaIsAsked(area, asked)
  })
  /**
   * Clamped, because the list of steps is not fixed any more.
   *
   * Editing the goal reclassifies it, and a different archetype can have fewer
   * steps. An index held across that change can point past the end, and the
   * screen for a step that is not there is a blank page with a button that
   * does nothing — the worst kind of dead end, because nothing looks broken.
   */
  const current = Math.min(step, visibleSteps.length - 1)
  const stepName = visibleSteps[current]
  const isLast = current === visibleSteps.length - 1
  const canContinue =
    !ai.pending && (stepName !== 'Ziel' || d.goalText.trim().length >= 3)

  const finish = async () => {
    setSaving(true)
    setSaveError(null)
    const payload: OnboardingPayload = buildAnswers(
      d,
      archetype,
      d.archetype !== null ? 'user' : aiArchetype ? 'ai' : 'keywords',
    )
    // Saves and asks the model what it still wants to know. A returned error
    // means it refused, and the person stays on the last step with their
    // answers intact rather than losing ten minutes of typing.
    const result = await completeOnboarding(payload)
    if ('error' in result) {
      setSaving(false)
      setSaveError(result.error)
      return
    }

    // No questions is the normal case, and it must not cost an extra tap: go
    // straight on to the plan, exactly as this button did before.
    if (result.questions.length === 0) {
      await submitAnswers([])
      return
    }

    setSaving(false)
    setQuestions(result.questions)
  }

  /** The second half. Also the path taken when there was nothing to ask. */
  const submitAnswers = async (given: IntakeAnswer[]) => {
    setSaving(true)
    setSaveError(null)
    // Redirects on success, so nothing after this runs.
    const result = await finishOnboarding(given)
    setSaving(false)
    if (result && 'error' in result) setSaveError(result.error)
  }

  /** Asks the server to classify. Never blocks progress: a failure just keeps
   *  the deterministic answer, which is already on screen. */
  const advanceFromGoal = async () => {
    if (d.archetype !== null) {
      setStep(current + 1)
      return
    }
    // Not even a request. The route would decline it and answer from the
    // keyword classifier, which is already on screen — so this saves a round
    // trip, and more importantly it means "no consent" is visible in the
    // network tab as no traffic at all rather than as a call that was refused.
    if (!ai.granted) {
      setStep(current + 1)
      return
    }
    setClassifying(true)
    try {
      const response = await fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawText: d.goalText }),
      })
      if (response.ok) {
        const result = (await response.json()) as {
          value: { archetype: GoalArchetype }
          source: 'ai' | 'fallback'
        }
        if (result.source === 'ai') setAiArchetype(result.value.archetype)
      }
    } catch {
      // Offline or the route is unavailable — the deterministic answer stands.
    } finally {
      setClassifying(false)
      setStep(current + 1)
    }
  }

  // Takes over the screen rather than becoming an eleventh step. The intake is
  // already saved at this point, so the step counter would be lying, and going
  // "back" from here would offer to re-run a form whose answers are in the
  // database.
  if (questions !== null) {
    return (
      <IntakeQuestionsStep
        questions={questions}
        onDone={submitAnswers}
        saving={saving}
        error={saveError}
      />
    )
  }

  return (
    <Screen>
      <StepProgress step={current} total={visibleSteps.length} />
      <ScreenTitle
        title={stepName}
        subtitle={
          stepName === 'Ziel'
            ? 'Schreib in eigenen Worten, was du erreichen willst. Alles Weitere richtet sich danach.'
            : STEP_AREA[stepName] !== undefined
              // Said out loud, on every step that was shortened, because a
              // personalisation nobody notices is one that did not happen — the
              // product critique's own point. It is also the honest answer to
              // "warum fragt ihr das nicht?": nothing here would read it.
              ? `Gefragt wird nur, was für ${ARCHETYPE_LABEL[archetype].toLowerCase()} in den Plan einfließt.`
              : undefined
        }
      />

      {stepName === 'Ziel' && (
        <>
          <Field label="Was möchtest du erreichen?" hint="Zum Beispiel: besser schlafen, 10 km laufen, 5 kg abnehmen, weniger am Handy.">
            <TextArea
              value={d.goalText}
              onChange={(v) => set('goalText', v)}
              placeholder="Ich möchte …"
            />
          </Field>

          {d.goalText.trim().length >= 3 && (
            <Card tone="accent">
              <p className="text-sm font-semibold text-ink">
                Erkannt als: {ARCHETYPE_LABEL[archetype]}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Danach richtet sich, was geplant wird — und welche Sicherheitsgrenzen gelten.
                Passt das nicht, korrigier es hier.
              </p>
              <p className="mt-1 text-xs text-faint">
                {aiArchetype !== null
                  ? 'Von der KI eingeordnet.'
                  : ai.granted
                    ? 'Ohne KI erkannt — anhand von Schlüsselwörtern.'
                    : 'Anhand von Schlüsselwörtern erkannt. Mit Häkchen schaut die KI darauf.'}
              </p>
              <div className="mt-3">
                <ChoiceGroup
                  options={(Object.keys(ARCHETYPE_LABEL) as GoalArchetype[]).map((a) => ({
                    value: a,
                    label: ARCHETYPE_LABEL[a],
                  }))}
                  value={archetype}
                  onChange={(v) => set('archetype', v)}
                  columns={2}
                />
              </div>
            </Card>
          )}

          {spared.length > 0 && (
            <Note>
              {`Für dieses Ziel entfällt: ${spared.join(', ')}. Die KI kann am Ende trotzdem nachfragen, wenn ihr etwas fehlt.`}
            </Note>
          )}

          {provider !== null && (
            <div className="mt-6">
              <SectionHeading>KI-Unterstützung</SectionHeading>
              <AiConsent
                initial={consent}
                provider={provider}
                learnsFromData={learnsFromData}
                onChange={setAi}
              />
            </div>
          )}

          <div className="mt-6">
            <Field label="Bis wann?" hint="Optional. Zu schnell? Dann verschiebt die App das Datum, nicht das Tempo.">
              {/* A date in the past is not a deadline. The engine moves it
                  anyway — that check is deterministic and lives in
                  horizonFor — but the picker should not offer it in the
                  first place. */}
              <DateInput
                value={d.targetDate}
                onChange={(v) => set('targetDate', v)}
                min={addDays(today, 1)}
              />
            </Field>
          </div>
        </>
      )}

      {stepName === 'Messbar' && metricSpec && (
        <>
          <Field label={metricSpec.startLabel}>
            <NumberInput value={d.metricStart} onChange={(v) => set('metricStart', v)} suffix={metricSpec.unit} />
          </Field>
          <Field label={metricSpec.targetLabel}>
            <NumberInput value={d.metricTarget} onChange={(v) => set('metricTarget', v)} suffix={metricSpec.unit} />
          </Field>
          <Note>Ohne Zahlen geht es auch — dann plant die App vorsichtiger.</Note>
        </>
      )}

      {stepName === 'Über dich' && (
        <>
          {ask('birthYear') && (
            <Field label="Geburtsjahr"><NumberInput value={d.birthYear} onChange={(v) => set('birthYear', v)} placeholder="z. B. 1995" /></Field>
          )}
          {ask('heightCm') && (
            <Field label="Größe"><NumberInput value={d.heightCm} onChange={(v) => set('heightCm', v)} suffix="cm" /></Field>
          )}
          {ask('weightKg') && (
            <Field label="Gewicht"><NumberInput value={d.weightKg} onChange={(v) => set('weightKg', v)} suffix="kg" /></Field>
          )}
          {ask('sexAtBirth') && (
            <Field label="Geschlecht bei Geburt" hint="Nur für die Bedarfsberechnung. Ohne Angabe rechnet die App vorsichtiger.">
              <ChoiceGroup
                options={[{ value: 'female', label: 'Weiblich' }, { value: 'male', label: 'Männlich' }, { value: 'unspecified', label: 'Keine Angabe' }]}
                value={d.sexAtBirth} onChange={(v) => set('sexAtBirth', v)} columns={3}
              />
            </Field>
          )}
        </>
      )}

      {stepName === 'Alltag' && (
        <>
          <Field label="Wie sieht dein Alltag aus?">
            <ChoiceGroup
              options={[
                { value: 'student', label: 'Studium' }, { value: 'office', label: 'Büro' },
                { value: 'remote', label: 'Homeoffice' }, { value: 'shift', label: 'Schicht' },
                { value: 'irregular', label: 'Unregelmäßig' },
              ]}
              value={d.workPattern} onChange={(v) => set('workPattern', v)}
            />
          </Field>
          <Field label="An welchen Tagen hast du Zeit?" hint="Realistisch, nicht optimistisch.">
            <MultiChoice options={WEEKDAYS.map((w) => ({ value: w, label: WEEKDAY_SHORT[w] }))} values={d.freeDays} onChange={(v) => set('freeDays', v)} columns={4} />
          </Field>
          <Field label="Wann meistens?">
            <ChoiceGroup options={[{ value: 'early', label: 'Morgens' }, { value: 'midday', label: 'Mittags' }, { value: 'evening', label: 'Abends' }]} value={d.slotTime} onChange={(v) => set('slotTime', v)} columns={3} />
          </Field>
          <Field label="Wie viel Zeit am Stück?">
            <ChoiceGroup options={[30, 45, 60, 90].map((n) => ({ value: n, label: `${n} Min` }))} value={d.slotMinutes} onChange={(v) => set('slotMinutes', v)} columns={4} />
          </Field>
        </>
      )}

      {stepName === 'Fest' && (
        <CommitmentsStep value={d.commitments} onChange={(v) => set('commitments', v)} />
      )}

      {stepName === 'Sport' && (
        <>
          {ask('preferredActivities') && (
            <Field label="Was machst du gerne?" hint="Mehrfachauswahl.">
              <MultiChoice
                options={[
                  { value: 'gym', label: 'Gym' }, { value: 'bodyweight', label: 'Körpergewicht' },
                  { value: 'running', label: 'Laufen' }, { value: 'cycling', label: 'Radfahren' },
                  { value: 'swimming', label: 'Schwimmen' }, { value: 'football', label: 'Fußball' },
                  { value: 'climbing', label: 'Klettern' }, { value: 'yoga', label: 'Yoga' },
                ]}
                values={d.preferredActivities} onChange={(v) => set('preferredActivities', v)}
              />
            </Field>
          )}
          {ask('equipment') && (
            <Field label="Was steht dir zur Verfügung?">
              <MultiChoice
                options={[
                  { value: 'none', label: 'Nichts' }, { value: 'home_basics', label: 'Kleingeräte' },
                  { value: 'home_gym', label: 'Heimstudio' }, { value: 'gym_membership', label: 'Gym-Abo' },
                ]}
                values={d.equipment} onChange={(v) => set('equipment', v)}
              />
            </Field>
          )}
          {ask('experience') && (
            <Field label="Wie erfahren bist du?">
              <ChoiceGroup options={[{ value: 'beginner', label: 'Einsteiger' }, { value: 'intermediate', label: 'Geübt' }, { value: 'advanced', label: 'Erfahren' }]} value={d.experience} onChange={(v) => set('experience', v)} columns={3} />
            </Field>
          )}
          {ask('sessionsPerWeekTarget') && (
            <Field label="Wie oft pro Woche?">
              <ChoiceGroup options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}×` }))} value={d.sessionsPerWeekTarget} onChange={(v) => set('sessionsPerWeekTarget', v)} columns={4} />
            </Field>
          )}
          {ask('preferredSessionMinutes') && (
            <Field label="Wie lange pro Einheit?">
              <ChoiceGroup options={[25, 45, 60, 75].map((n) => ({ value: n, label: `${n} Min` }))} value={d.preferredSessionMinutes} onChange={(v) => set('preferredSessionMinutes', v)} columns={4} />
            </Field>
          )}
        </>
      )}

      {stepName === 'Ernährung' && (
        <>
          {ask('cooksAtHome') && (
            <Field label="Wie oft kochst du?">
              <ChoiceGroup options={[{ value: 'never', label: 'Nie' }, { value: 'sometimes', label: 'Manchmal' }, { value: 'often', label: 'Oft' }]} value={d.cooksAtHome} onChange={(v) => set('cooksAtHome', v)} columns={3} />
            </Field>
          )}
          {ask('timeForCookingMin') && (
            <Field label="Wie viel Zeit hast du dafür?">
              <ChoiceGroup options={[15, 30, 45, 60].map((n) => ({ value: n, label: `${n} Min` }))} value={d.timeForCookingMin} onChange={(v) => set('timeForCookingMin', v)} columns={4} />
            </Field>
          )}
          {ask('eatsOutPerWeek') && (
            <Field label="Wie oft isst du auswärts?" hint="Pro Woche. Die App verbietet es nicht – sie plant damit.">
              <ChoiceGroup options={[0, 1, 2, 4, 6].map((n) => ({ value: n, label: `${n}×` }))} value={d.eatsOutPerWeek} onChange={(v) => set('eatsOutPerWeek', v)} columns={4} />
            </Field>
          )}
          {ask('dietaryPattern') && (
            <Field label="Ernährungsform">
              <ChoiceGroup options={[{ value: 'omnivore', label: 'Alles' }, { value: 'vegetarian', label: 'Vegetarisch' }, { value: 'vegan', label: 'Vegan' }]} value={d.dietaryPattern} onChange={(v) => set('dietaryPattern', v)} columns={3} />
            </Field>
          )}
          {ask('mealsPerDay') && (
            <Field label="Mahlzeiten pro Tag">
              <ChoiceGroup options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} value={d.mealsPerDay} onChange={(v) => set('mealsPerDay', v)} columns={4} />
            </Field>
          )}
          {ask('vegetablePortionsPerDay') && (
            <Field label="Portionen Gemüse oder Obst am Tag">
              <ChoiceGroup options={[0, 1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))} value={d.vegetablePortionsPerDay} onChange={(v) => set('vegetablePortionsPerDay', v)} columns={5} />
            </Field>
          )}
          {ask('sugaryDrinksPerDay') && (
            <Field label="Gesüßte Getränke am Tag">
              <ChoiceGroup options={[0, 1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))} value={d.sugaryDrinksPerDay} onChange={(v) => set('sugaryDrinksPerDay', v)} columns={5} />
            </Field>
          )}
        </>
      )}

      {stepName === 'Schlaf' && (
        <>
          {ask('usualBedtime') && (
            <Field label="Wann gehst du normalerweise schlafen?"><TimeInput value={d.usualBedtime} onChange={(v) => set('usualBedtime', v)} /></Field>
          )}
          {ask('usualWakeTime') && (
            <Field label="Wann musst du raus?">
              <WakeTimes
                value={d.wakeTimes}
                usual={d.usualWakeTime}
                onUsual={(v) => set('usualWakeTime', v)}
                onChange={(v) => set('wakeTimes', v)}
              />
            </Field>
          )}
          {ask('sleepQuality') && (
            <Field label="Wie gut schläfst du?">
              <ChoiceGroup options={[{ value: 'poor', label: 'Schlecht' }, { value: 'ok', label: 'Geht so' }, { value: 'good', label: 'Gut' }]} value={d.sleepQuality} onChange={(v) => set('sleepQuality', v)} columns={3} />
            </Field>
          )}
          {ask('wakesAtNight') && (
            <Field label="Wachst du nachts auf?">
              <ChoiceGroup options={[{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} value={d.wakesAtNight === null ? null : d.wakesAtNight ? 'yes' : 'no'} onChange={(v) => set('wakesAtNight', v === 'yes')} columns={2} />
            </Field>
          )}
          {ask('screenBeforeBed') && (
            <Field label="Bildschirm kurz vor dem Schlafen?">
              <ChoiceGroup options={[{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} value={d.screenBeforeBed === null ? null : d.screenBeforeBed ? 'yes' : 'no'} onChange={(v) => set('screenBeforeBed', v === 'yes')} columns={2} />
            </Field>
          )}
          <Note>Die App empfiehlt dir nie weniger Schlaf — bei keinem Ziel.</Note>
        </>
      )}

      {stepName === 'Kopf' && (
        <>
          {ask('screenTimeHoursPerDay') && (
            <Field label="Bildschirmzeit am Tag">
              <ChoiceGroup options={[1, 2, 4, 6, 9].map((n) => ({ value: n, label: `${n} h` }))} value={d.screenTimeHoursPerDay} onChange={(v) => set('screenTimeHoursPerDay', v)} columns={5} />
            </Field>
          )}
          {ask('focusStruggle') && (
            <Field label="Wie leicht fällt dir Fokus?">
              <ChoiceGroup options={[{ value: 'low', label: 'Leicht' }, { value: 'medium', label: 'Mittel' }, { value: 'high', label: 'Schwer' }]} value={d.focusStruggle} onChange={(v) => set('focusStruggle', v)} columns={3} />
            </Field>
          )}
          {ask('existingRoutines') && (
            <Field label="Was machst du schon jeden Tag?" hint="Mit Komma trennen. Neue Gewohnheiten hängt die App daran auf.">
              <TextArea value={d.existingRoutines} onChange={(v) => set('existingRoutines', v)} placeholder="Kaffee um 7, Hund um 18 Uhr" rows={2} />
            </Field>
          )}
        </>
      )}

      {stepName === 'Grenzen' && (
        <>
          <Field label="Was möchtest du auf keinen Fall?">
            <MultiChoice
              options={[{ value: 'gym', label: 'Gym' }, { value: 'running', label: 'Laufen' }, { value: 'swimming', label: 'Schwimmen' }, { value: 'yoga', label: 'Yoga' }]}
              values={d.dislikedActivities} onChange={(v) => set('dislikedActivities', v)}
            />
          </Field>
          <Field label="Gibt es Tage, an denen Training nie geht?">
            <MultiChoice options={WEEKDAYS.map((w) => ({ value: w, label: WEEKDAY_SHORT[w] }))} values={d.blockedDays} onChange={(v) => set('blockedDays', v)} columns={4} />
          </Field>
          <Note>Harte Grenze — die App plant dort nichts hinein.</Note>
        </>
      )}

      {saveError && (
        <p role="alert" className="mt-6 rounded-control bg-warn-soft px-3 py-2.5 text-sm text-ink">
          {saveError}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-2">
        <Button
          onClick={isLast ? finish : stepName === 'Ziel' ? advanceFromGoal : () => setStep(current + 1)}
          disabled={!canContinue || classifying || saving}
        >
          {saving
            ? 'Plan wird gebaut …'
            : classifying
              ? 'Ziel wird eingeordnet …'
              : isLast
                ? 'Plan erstellen'
                : 'Weiter'}
        </Button>
        {current > 0 && <Button variant="quiet" onClick={() => setStep(current - 1)}>Zurück</Button>}
        {current > 0 && !isLast && (
          <button
            type="button"
            onClick={() => setStep(visibleSteps.length - 1)}
            className="mt-1 text-center text-xs font-medium text-faint underline underline-offset-4"
          >
            Rest überspringen – die App trifft dann vorsichtige Annahmen.
          </button>
        )}
      </div>
    </Screen>
  )
}

/**
 * The alarm, day by day.
 *
 * One wake time for the week cannot describe the people this app is for: a
 * student's mornings are all different, shift work inverts, and it is the
 * Wednesday alarm that decides whether Tuesday evening has any room left in it.
 *
 * It opens as a single field, because most people do have one usual morning and
 * making everyone fill in seven would be the app behaving like a form. "Nicht
 * jeden Tag gleich" unfolds the week, prefilled with what they just typed, so
 * the extra work is only done by the people whose week actually needs it.
 *
 * A day left empty stays empty. Unknown is a real answer here — the engine
 * reasons about how much night is left, and inventing an hour would make it
 * confident about something nobody said.
 */
function WakeTimes({
  value,
  usual,
  onUsual,
  onChange,
}: {
  value: Partial<Record<Weekday, string>>
  usual: string | null
  onUsual: (value: string | null) => void
  onChange: (value: Partial<Record<Weekday, string>>) => void
}) {
  const perDay = Object.keys(value).length > 0
  const [open, setOpen] = useState(perDay)

  if (!open) {
    return (
      <>
        <TimeInput
          value={usual}
          onChange={(v) => {
            onUsual(v)
            onChange(v === null ? {} : Object.fromEntries(WEEKDAYS.map((w) => [w, v])))
          }}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-sm text-accent underline underline-offset-4"
        >
          Nicht jeden Tag gleich
        </button>
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-sm font-medium text-muted">
              {WEEKDAY_SHORT[weekday]}
            </span>
            <div className="flex-1">
              <TimeInput
                value={value[weekday] ?? null}
                onChange={(v) => {
                  const next = { ...value }
                  if (v === null) delete next[weekday]
                  else next[weekday] = v
                  onChange(next)
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <Note>
        Leer lassen ist in Ordnung. Für einen Tag ohne Angabe rechnet die App nicht mit einer
        Uhrzeit, statt sich eine auszudenken.
      </Note>
    </>
  )
}
