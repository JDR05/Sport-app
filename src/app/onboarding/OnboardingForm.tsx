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
import { completeOnboarding } from './actions'
import { Button, Card, Note, Screen, ScreenTitle } from '@/components/ui'
import {
  ChoiceGroup, DateInput, Field, MultiChoice, NumberInput, StepProgress, TextArea, TimeInput,
} from '@/components/form'
import { CommitmentsStep } from './CommitmentsStep'
import { classifyGoalText } from '@/lib/engine'
import { EMPTY, SLOT_START, toDraft, type Draft } from './draft'
import type { StoredPlanInput } from '@/lib/db/plan-input'
import { WEEKDAYS, type GoalArchetype } from '@/lib/domain/types'
import type { GoalMetric, Weekday } from '@/lib/domain/types'

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

/**
 * Which archetypes carry a numeric target, and what that number is.
 *
 * The point of this table is that it is *per archetype*. Someone working on
 * their sleep is never asked what they weigh, and never shown a weight chart —
 * their number is hours, because that is the thing their goal is about. The
 * rest of the intake is still collected (ADR-024) and still shapes the plan; it
 * simply does not get a chart on a screen where it would only be noise.
 *
 * Archetypes missing from this table have no number, and the app says so
 * rather than inventing one. Not everything worth changing is measurable.
 */
const METRIC_FOR: Partial<Record<GoalArchetype, { key: string; unit: string; label: string; startLabel: string; targetLabel: string }>> = {
  body_composition: { key: 'weight_kg', unit: 'kg', label: 'Gewicht', startLabel: 'Was wiegst du aktuell?', targetLabel: 'Was möchtest du wiegen?' },
  endurance: { key: 'distance_km', unit: 'km', label: 'Umfang', startLabel: 'Wie viele km schaffst du aktuell pro Woche?', targetLabel: 'Wie viele km sollen es werden?' },
  strength: { key: 'load_kg', unit: 'kg', label: 'Last', startLabel: 'Womit trainierst du aktuell?', targetLabel: 'Was ist dein Ziel?' },
  sleep_recovery: { key: 'sleep_hours', unit: 'h', label: 'Schlaf', startLabel: 'Wie viele Stunden schläfst du aktuell?', targetLabel: 'Wie viele sollen es werden?' },
}

/** The payload the server action validates again before writing anything. */
type OnboardingPayload = Parameters<typeof completeOnboarding>[0]

function buildAnswers(
  d: Draft,
  archetype: GoalArchetype,
  classifiedBy: 'ai' | 'keywords' | 'user',
) {
  const metricSpec = METRIC_FOR[archetype]
  const metrics: GoalMetric[] =
    metricSpec && (d.metricStart !== null || d.metricTarget !== null)
      ? [{ metricKey: metricSpec.key, startValue: d.metricStart, targetValue: d.metricTarget, unit: metricSpec.unit }]
      : []

  return {
    profile: {
      birthYear: d.birthYear,
      heightCm: d.heightCm,
      weightKg: d.weightKg ?? (archetype === 'body_composition' ? d.metricStart : null),
      sexAtBirth: d.sexAtBirth,
      sport: {
        preferredActivities: d.preferredActivities,
        dislikedActivities: d.dislikedActivities,
        sessionsPerWeekTarget: d.sessionsPerWeekTarget,
        preferredSessionMinutes: d.preferredSessionMinutes,
        equipment: d.equipment.length > 0 ? d.equipment : ['none'],
        experience: d.experience,
      },
      nutrition: {
        cooksAtHome: d.cooksAtHome,
        timeForCookingMin: d.timeForCookingMin,
        eatsOutPerWeek: d.eatsOutPerWeek,
        dietaryPattern: d.dietaryPattern,
        mealsPerDay: d.mealsPerDay,
        vegetablePortionsPerDay: d.vegetablePortionsPerDay,
        sugaryDrinksPerDay: d.sugaryDrinksPerDay,
      },
      sleep: {
        usualBedtime: d.usualBedtime,
        usualWakeTime: d.usualWakeTime,
        quality: d.sleepQuality,
        wakesAtNight: d.wakesAtNight,
        screenBeforeBed: d.screenBeforeBed,
      },
      mind: {
        screenTimeHoursPerDay: d.screenTimeHoursPerDay,
        focusStruggle: d.focusStruggle,
        existingRoutines: d.existingRoutines.split(',').map((r) => r.trim()).filter(Boolean),
      },
    },
    goal: {
      rawText: d.goalText.trim(),
      archetype,
      targetDate: d.targetDate,
      classifiedBy,
    },
    metrics,
    constraints:
      d.blockedDays.length > 0
        ? [{ kind: 'time', hard: true, value: { type: 'no_training_on', weekdays: d.blockedDays } }]
        : [],
    schedule: {
      workPattern: d.workPattern,
      freeSlots: d.freeDays.map((weekday) => ({
        weekday,
        start: SLOT_START[d.slotTime ?? 'evening'],
        minutes: d.slotMinutes ?? 45,
      })),
      commitments: d.commitments,
      wakeTimes: d.wakeTimes,
    },
  }
}

export function OnboardingForm({ existing }: { existing?: StoredPlanInput | null }) {
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
  const archetype = d.archetype ?? aiArchetype ?? detected.archetype
  const metricSpec = METRIC_FOR[archetype]

  // The metric step is skipped for goals that have no number to state.
  const visibleSteps = STEPS.filter((_, i) => i !== 1 || metricSpec !== undefined)
  const stepName = visibleSteps[step]
  const isLast = step === visibleSteps.length - 1
  const canContinue = stepName !== 'Ziel' || d.goalText.trim().length >= 3

  const finish = async () => {
    setSaving(true)
    setSaveError(null)
    const payload: OnboardingPayload = buildAnswers(
      d,
      archetype,
      d.archetype !== null ? 'user' : aiArchetype ? 'ai' : 'keywords',
    )
    // On success the action redirects, so nothing after this runs. A returned
    // value means it refused, and the person stays on the last step with their
    // answers intact rather than losing ten minutes of typing.
    const result = await completeOnboarding(payload)
    setSaving(false)
    if (result && 'error' in result) setSaveError(result.error)
  }

  /** Asks the server to classify. Never blocks progress: a failure just keeps
   *  the deterministic answer, which is already on screen. */
  const advanceFromGoal = async () => {
    if (d.archetype !== null) {
      setStep(step + 1)
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
      setStep(step + 1)
    }
  }

  return (
    <Screen>
      <StepProgress step={step} total={visibleSteps.length} />
      <ScreenTitle
        title={stepName}
        subtitle={
          stepName === 'Ziel'
            ? 'Schreib in eigenen Worten, was du erreichen willst. Alles Weitere richtet sich danach.'
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
                  : 'Ohne KI erkannt — anhand von Schlüsselwörtern.'}
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

          <div className="mt-6">
            <Field label="Bis wann?" hint="Optional. Ist der Wunsch zu schnell, verschiebt die App das Datum – nicht das Tempo.">
              <DateInput value={d.targetDate} onChange={(v) => set('targetDate', v)} />
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
          <Field label="Geburtsjahr"><NumberInput value={d.birthYear} onChange={(v) => set('birthYear', v)} placeholder="z. B. 1995" /></Field>
          <Field label="Größe"><NumberInput value={d.heightCm} onChange={(v) => set('heightCm', v)} suffix="cm" /></Field>
          <Field label="Gewicht"><NumberInput value={d.weightKg} onChange={(v) => set('weightKg', v)} suffix="kg" /></Field>
          <Field label="Geschlecht bei Geburt" hint="Nur für die Bedarfsberechnung. Ohne Angabe rechnet die App vorsichtiger.">
            <ChoiceGroup
              options={[{ value: 'female', label: 'Weiblich' }, { value: 'male', label: 'Männlich' }, { value: 'unspecified', label: 'Keine Angabe' }]}
              value={d.sexAtBirth} onChange={(v) => set('sexAtBirth', v)} columns={3}
            />
          </Field>
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
          <Field label="Was steht dir zur Verfügung?">
            <MultiChoice
              options={[
                { value: 'none', label: 'Nichts' }, { value: 'home_basics', label: 'Kleingeräte' },
                { value: 'home_gym', label: 'Heimstudio' }, { value: 'gym_membership', label: 'Gym-Abo' },
              ]}
              values={d.equipment} onChange={(v) => set('equipment', v)}
            />
          </Field>
          <Field label="Wie erfahren bist du?">
            <ChoiceGroup options={[{ value: 'beginner', label: 'Einsteiger' }, { value: 'intermediate', label: 'Geübt' }, { value: 'advanced', label: 'Erfahren' }]} value={d.experience} onChange={(v) => set('experience', v)} columns={3} />
          </Field>
          <Field label="Wie oft pro Woche?">
            <ChoiceGroup options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}×` }))} value={d.sessionsPerWeekTarget} onChange={(v) => set('sessionsPerWeekTarget', v)} columns={4} />
          </Field>
          <Field label="Wie lange pro Einheit?">
            <ChoiceGroup options={[25, 45, 60, 75].map((n) => ({ value: n, label: `${n} Min` }))} value={d.preferredSessionMinutes} onChange={(v) => set('preferredSessionMinutes', v)} columns={4} />
          </Field>
        </>
      )}

      {stepName === 'Ernährung' && (
        <>
          <Field label="Wie oft kochst du?">
            <ChoiceGroup options={[{ value: 'never', label: 'Nie' }, { value: 'sometimes', label: 'Manchmal' }, { value: 'often', label: 'Oft' }]} value={d.cooksAtHome} onChange={(v) => set('cooksAtHome', v)} columns={3} />
          </Field>
          <Field label="Wie viel Zeit hast du dafür?">
            <ChoiceGroup options={[15, 30, 45, 60].map((n) => ({ value: n, label: `${n} Min` }))} value={d.timeForCookingMin} onChange={(v) => set('timeForCookingMin', v)} columns={4} />
          </Field>
          <Field label="Wie oft isst du auswärts?" hint="Pro Woche. Die App verbietet es nicht – sie plant damit.">
            <ChoiceGroup options={[0, 1, 2, 4, 6].map((n) => ({ value: n, label: `${n}×` }))} value={d.eatsOutPerWeek} onChange={(v) => set('eatsOutPerWeek', v)} columns={4} />
          </Field>
          <Field label="Ernährungsform">
            <ChoiceGroup options={[{ value: 'omnivore', label: 'Alles' }, { value: 'vegetarian', label: 'Vegetarisch' }, { value: 'vegan', label: 'Vegan' }]} value={d.dietaryPattern} onChange={(v) => set('dietaryPattern', v)} columns={3} />
          </Field>
          <Field label="Mahlzeiten pro Tag">
            <ChoiceGroup options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} value={d.mealsPerDay} onChange={(v) => set('mealsPerDay', v)} columns={4} />
          </Field>
          <Field label="Portionen Gemüse oder Obst am Tag">
            <ChoiceGroup options={[0, 1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))} value={d.vegetablePortionsPerDay} onChange={(v) => set('vegetablePortionsPerDay', v)} columns={5} />
          </Field>
          <Field label="Gesüßte Getränke am Tag">
            <ChoiceGroup options={[0, 1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))} value={d.sugaryDrinksPerDay} onChange={(v) => set('sugaryDrinksPerDay', v)} columns={5} />
          </Field>
        </>
      )}

      {stepName === 'Schlaf' && (
        <>
          <Field label="Wann gehst du normalerweise schlafen?"><TimeInput value={d.usualBedtime} onChange={(v) => set('usualBedtime', v)} /></Field>
          <Field label="Wann musst du raus?">
            <WakeTimes
              value={d.wakeTimes}
              usual={d.usualWakeTime}
              onUsual={(v) => set('usualWakeTime', v)}
              onChange={(v) => set('wakeTimes', v)}
            />
          </Field>
          <Field label="Wie gut schläfst du?">
            <ChoiceGroup options={[{ value: 'poor', label: 'Schlecht' }, { value: 'ok', label: 'Geht so' }, { value: 'good', label: 'Gut' }]} value={d.sleepQuality} onChange={(v) => set('sleepQuality', v)} columns={3} />
          </Field>
          <Field label="Wachst du nachts auf?">
            <ChoiceGroup options={[{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} value={d.wakesAtNight === null ? null : d.wakesAtNight ? 'yes' : 'no'} onChange={(v) => set('wakesAtNight', v === 'yes')} columns={2} />
          </Field>
          <Field label="Bildschirm kurz vor dem Schlafen?">
            <ChoiceGroup options={[{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} value={d.screenBeforeBed === null ? null : d.screenBeforeBed ? 'yes' : 'no'} onChange={(v) => set('screenBeforeBed', v === 'yes')} columns={2} />
          </Field>
          <Note>Die App empfiehlt dir nie weniger Schlaf — bei keinem Ziel.</Note>
        </>
      )}

      {stepName === 'Kopf' && (
        <>
          <Field label="Bildschirmzeit am Tag">
            <ChoiceGroup options={[1, 2, 4, 6, 9].map((n) => ({ value: n, label: `${n} h` }))} value={d.screenTimeHoursPerDay} onChange={(v) => set('screenTimeHoursPerDay', v)} columns={5} />
          </Field>
          <Field label="Wie leicht fällt dir Fokus?">
            <ChoiceGroup options={[{ value: 'low', label: 'Leicht' }, { value: 'medium', label: 'Mittel' }, { value: 'high', label: 'Schwer' }]} value={d.focusStruggle} onChange={(v) => set('focusStruggle', v)} columns={3} />
          </Field>
          <Field label="Was machst du schon jeden Tag?" hint="Mit Komma trennen. Neue Gewohnheiten hängt die App daran auf.">
            <TextArea value={d.existingRoutines} onChange={(v) => set('existingRoutines', v)} placeholder="Kaffee um 7, Hund um 18 Uhr" rows={2} />
          </Field>
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
          <Note>Beides ist eine harte Grenze: Die App plant dort nichts hinein, auch nicht ausnahmsweise.</Note>
        </>
      )}

      {saveError && (
        <p role="alert" className="mt-6 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-ink">
          {saveError}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-2">
        <Button
          onClick={isLast ? finish : stepName === 'Ziel' ? advanceFromGoal : () => setStep(step + 1)}
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
        {step > 0 && <Button variant="quiet" onClick={() => setStep(step - 1)}>Zurück</Button>}
        {step > 0 && !isLast && (
          <button
            type="button"
            onClick={() => setStep(visibleSteps.length - 1)}
            className="mt-1 text-center text-xs font-medium text-faint underline underline-offset-4"
          >
            Rest überspringen – die App nimmt vorsichtige Annahmen
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
