'use client'

// Staged onboarding.
//
// It asks for exactly the twenty fields that tests/engine.fields.test.ts proves
// change the plan — no more. Wake time, sleep time, weekend structure and life
// situation were dropped after the same test showed they change nothing yet
// (ADR-018). Every question here has to earn its place.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlan, type Answers } from '@/components/PlanProvider'
import { Button, Screen, ScreenTitle, Note } from '@/components/ui'
import { ChoiceGroup, DateInput, Field, MultiChoice, NumberInput, StepProgress } from '@/components/form'
import { WEEKDAYS } from '@/lib/domain/types'
import type {
  Activity,
  CookingFrequency,
  DietaryPattern,
  Equipment,
  Experience,
  SexAtBirth,
  Weekday,
  WorkPattern,
} from '@/lib/domain/types'

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
}

const SLOT_START = { early: '07:00', midday: '12:00', evening: '18:30' } as const
type SlotTime = keyof typeof SLOT_START

type Draft = {
  startWeight: number | null
  targetWeight: number | null
  targetDate: string | null
  birthYear: number | null
  heightCm: number | null
  sexAtBirth: SexAtBirth | null
  workPattern: WorkPattern | null
  freeDays: Weekday[]
  slotTime: SlotTime | null
  slotMinutes: number | null
  preferredActivities: Activity[]
  equipment: Equipment[]
  experience: Experience | null
  sessionsPerWeekTarget: number | null
  preferredSessionMinutes: number | null
  dislikedActivities: Activity[]
  blockedDays: Weekday[]
  cooksAtHome: CookingFrequency | null
  timeForCookingMin: number | null
  eatsOutPerWeek: number | null
  dietaryPattern: DietaryPattern | null
  mealsPerDay: number | null
}

const EMPTY: Draft = {
  startWeight: null, targetWeight: null, targetDate: null,
  birthYear: null, heightCm: null, sexAtBirth: null,
  workPattern: null, freeDays: [], slotTime: null, slotMinutes: null,
  preferredActivities: [], equipment: [], experience: null,
  sessionsPerWeekTarget: null, preferredSessionMinutes: null,
  dislikedActivities: [], blockedDays: [],
  cooksAtHome: null, timeForCookingMin: null, eatsOutPerWeek: null,
  dietaryPattern: null, mealsPerDay: null,
}

const STEPS = ['Ziel', 'Über dich', 'Alltag', 'Sport', 'Grenzen', 'Ernährung'] as const

function toAnswers(d: Draft): Answers {
  const start = d.startWeight ?? 0
  const target = d.targetWeight ?? 0
  const start20 = SLOT_START[d.slotTime ?? 'evening']

  return {
    profile: {
      birthYear: d.birthYear,
      heightCm: d.heightCm,
      sexAtBirth: d.sexAtBirth,
      lifeSituation: null,
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
      },
    },
    goal: {
      title: `${Math.max(0, Math.round((start - target) * 10) / 10)} kg abnehmen`,
      targetDate: d.targetDate,
    },
    metrics: [{ metricKey: 'weight_kg', startValue: start, targetValue: target, unit: 'kg' }],
    constraints:
      d.blockedDays.length > 0
        ? [{ kind: 'time', hard: true, value: { type: 'no_training_on', weekdays: d.blockedDays } }]
        : [],
    schedule: {
      wakeTime: null,
      sleepTime: null,
      workPattern: d.workPattern,
      freeSlots: d.freeDays.map((weekday) => ({
        weekday,
        start: start20,
        minutes: d.slotMinutes ?? 45,
      })),
      weekendDiffers: false,
    },
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const { saveAnswers } = usePlan()
  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>(EMPTY)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((prev) => ({ ...prev, [key]: value }))

  const goalReady =
    d.startWeight !== null && d.targetWeight !== null && d.startWeight > d.targetWeight
  const canContinue = step === 0 ? goalReady : true
  const isLast = step === STEPS.length - 1

  const finish = () => {
    saveAnswers(toAnswers(d))
    router.push('/today')
  }

  return (
    <Screen>
      <StepProgress step={step} total={STEPS.length} />
      <ScreenTitle
        title={STEPS[step]}
        subtitle={
          step === 0
            ? 'Nur das Nötigste. Alles Weitere fragt die App später, wenn es zählt.'
            : undefined
        }
      />

      {step === 0 && (
        <>
          <Field label="Was wiegst du aktuell?">
            <NumberInput value={d.startWeight} onChange={(v) => set('startWeight', v)} suffix="kg" placeholder="z. B. 80" />
          </Field>
          <Field label="Was möchtest du wiegen?">
            <NumberInput value={d.targetWeight} onChange={(v) => set('targetWeight', v)} suffix="kg" placeholder="z. B. 75" />
          </Field>
          <Field label="Bis wann?" hint="Optional. Ist der Wunsch zu schnell, verschiebt die App das Datum – nicht das Tempo.">
            <DateInput value={d.targetDate} onChange={(v) => set('targetDate', v)} />
          </Field>
          {d.startWeight !== null && d.targetWeight !== null && !goalReady && (
            <Note>Das Zielgewicht muss unter deinem aktuellen Gewicht liegen.</Note>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <Field label="Geburtsjahr" hint="Fließt in die Bedarfsberechnung ein.">
            <NumberInput value={d.birthYear} onChange={(v) => set('birthYear', v)} min={1900} max={2020} placeholder="z. B. 1995" />
          </Field>
          <Field label="Größe">
            <NumberInput value={d.heightCm} onChange={(v) => set('heightCm', v)} suffix="cm" placeholder="z. B. 178" />
          </Field>
          <Field label="Geschlecht bei Geburt" hint="Nur für die Grundumsatzformel. Ohne Angabe rechnet die App vorsichtiger.">
            <ChoiceGroup
              options={[
                { value: 'female', label: 'Weiblich' },
                { value: 'male', label: 'Männlich' },
                { value: 'unspecified', label: 'Keine Angabe' },
              ]}
              value={d.sexAtBirth}
              onChange={(v) => set('sexAtBirth', v)}
              columns={3}
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Wie sieht dein Alltag aus?">
            <ChoiceGroup
              options={[
                { value: 'student', label: 'Studium' },
                { value: 'office', label: 'Büro' },
                { value: 'remote', label: 'Homeoffice' },
                { value: 'shift', label: 'Schicht' },
                { value: 'irregular', label: 'Unregelmäßig' },
              ]}
              value={d.workPattern}
              onChange={(v) => set('workPattern', v)}
            />
          </Field>
          <Field label="An welchen Tagen hast du Zeit?" hint="Realistisch, nicht optimistisch.">
            <MultiChoice
              options={WEEKDAYS.map((w) => ({ value: w, label: WEEKDAY_SHORT[w] }))}
              values={d.freeDays}
              onChange={(v) => set('freeDays', v)}
              columns={4}
            />
          </Field>
          <Field label="Wann meistens?">
            <ChoiceGroup
              options={[
                { value: 'early', label: 'Morgens' },
                { value: 'midday', label: 'Mittags' },
                { value: 'evening', label: 'Abends' },
              ]}
              value={d.slotTime}
              onChange={(v) => set('slotTime', v)}
              columns={3}
            />
          </Field>
          <Field label="Wie viel Zeit am Stück?">
            <ChoiceGroup
              options={[
                { value: 30, label: '30 Min' },
                { value: 45, label: '45 Min' },
                { value: 60, label: '60 Min' },
                { value: 90, label: '90 Min' },
              ]}
              value={d.slotMinutes}
              onChange={(v) => set('slotMinutes', v)}
              columns={4}
            />
          </Field>
        </>
      )}

      {step === 3 && (
        <>
          <Field label="Was machst du gerne?" hint="Mehrfachauswahl.">
            <MultiChoice
              options={[
                { value: 'gym', label: 'Gym' },
                { value: 'bodyweight', label: 'Körpergewicht' },
                { value: 'running', label: 'Laufen' },
                { value: 'cycling', label: 'Radfahren' },
                { value: 'swimming', label: 'Schwimmen' },
                { value: 'football', label: 'Fußball' },
                { value: 'climbing', label: 'Klettern' },
                { value: 'yoga', label: 'Yoga' },
              ]}
              values={d.preferredActivities}
              onChange={(v) => set('preferredActivities', v)}
            />
          </Field>
          <Field label="Was steht dir zur Verfügung?">
            <MultiChoice
              options={[
                { value: 'none', label: 'Nichts' },
                { value: 'home_basics', label: 'Kleingeräte' },
                { value: 'home_gym', label: 'Heimstudio' },
                { value: 'gym_membership', label: 'Gym-Abo' },
              ]}
              values={d.equipment}
              onChange={(v) => set('equipment', v)}
            />
          </Field>
          <Field label="Wie erfahren bist du?">
            <ChoiceGroup
              options={[
                { value: 'beginner', label: 'Einsteiger' },
                { value: 'intermediate', label: 'Geübt' },
                { value: 'advanced', label: 'Erfahren' },
              ]}
              value={d.experience}
              onChange={(v) => set('experience', v)}
              columns={3}
            />
          </Field>
          <Field label="Wie oft pro Woche?">
            <ChoiceGroup
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}×` }))}
              value={d.sessionsPerWeekTarget}
              onChange={(v) => set('sessionsPerWeekTarget', v)}
              columns={4}
            />
          </Field>
          <Field label="Wie lange pro Einheit?">
            <ChoiceGroup
              options={[
                { value: 25, label: '25 Min' },
                { value: 45, label: '45 Min' },
                { value: 60, label: '60 Min' },
                { value: 75, label: '75 Min' },
              ]}
              value={d.preferredSessionMinutes}
              onChange={(v) => set('preferredSessionMinutes', v)}
              columns={4}
            />
          </Field>
        </>
      )}

      {step === 4 && (
        <>
          <Field label="Was möchtest du auf keinen Fall?" hint="Diese Aktivitäten schlägt die App dir nie vor.">
            <MultiChoice
              options={[
                { value: 'gym', label: 'Gym' },
                { value: 'running', label: 'Laufen' },
                { value: 'swimming', label: 'Schwimmen' },
                { value: 'yoga', label: 'Yoga' },
              ]}
              values={d.dislikedActivities}
              onChange={(v) => set('dislikedActivities', v)}
            />
          </Field>
          <Field label="Gibt es Tage, an denen Training nie geht?" hint="Etwa wegen Vereinstraining oder fester Termine.">
            <MultiChoice
              options={WEEKDAYS.map((w) => ({ value: w, label: WEEKDAY_SHORT[w] }))}
              values={d.blockedDays}
              onChange={(v) => set('blockedDays', v)}
              columns={4}
            />
          </Field>
          <Note>Beides ist eine harte Grenze: Die App plant dort nichts hinein, auch nicht ausnahmsweise.</Note>
        </>
      )}

      {step === 5 && (
        <>
          <Field label="Wie oft kochst du?">
            <ChoiceGroup
              options={[
                { value: 'never', label: 'Nie' },
                { value: 'sometimes', label: 'Manchmal' },
                { value: 'often', label: 'Oft' },
              ]}
              value={d.cooksAtHome}
              onChange={(v) => set('cooksAtHome', v)}
              columns={3}
            />
          </Field>
          <Field label="Wie viel Zeit hast du dafür?">
            <ChoiceGroup
              options={[
                { value: 15, label: '15 Min' },
                { value: 30, label: '30 Min' },
                { value: 45, label: '45 Min' },
                { value: 60, label: '60+ Min' },
              ]}
              value={d.timeForCookingMin}
              onChange={(v) => set('timeForCookingMin', v)}
              columns={4}
            />
          </Field>
          <Field label="Wie oft isst du auswärts?" hint="Pro Woche. Die App verbietet es nicht – sie plant damit.">
            <ChoiceGroup
              options={[0, 1, 2, 4, 6].map((n) => ({ value: n, label: `${n}×` }))}
              value={d.eatsOutPerWeek}
              onChange={(v) => set('eatsOutPerWeek', v)}
              columns={4}
            />
          </Field>
          <Field label="Ernährungsform">
            <ChoiceGroup
              options={[
                { value: 'omnivore', label: 'Alles' },
                { value: 'vegetarian', label: 'Vegetarisch' },
                { value: 'vegan', label: 'Vegan' },
              ]}
              value={d.dietaryPattern}
              onChange={(v) => set('dietaryPattern', v)}
              columns={3}
            />
          </Field>
          <Field label="Mahlzeiten pro Tag">
            <ChoiceGroup
              options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
              value={d.mealsPerDay}
              onChange={(v) => set('mealsPerDay', v)}
              columns={4}
            />
          </Field>
        </>
      )}

      <div className="mt-8 flex flex-col gap-2">
        <Button onClick={isLast ? finish : () => setStep(step + 1)} disabled={!canContinue}>
          {isLast ? 'Plan erstellen' : 'Weiter'}
        </Button>
        {step > 0 && (
          <Button variant="quiet" onClick={() => setStep(step - 1)}>
            Zurück
          </Button>
        )}
        {step > 0 && !isLast && (
          <button
            type="button"
            onClick={() => setStep(STEPS.length - 1)}
            className="mt-1 text-center text-xs font-medium text-faint underline underline-offset-4"
          >
            Rest überspringen – die App nimmt vorsichtige Annahmen
          </button>
        )}
      </div>
    </Screen>
  )
}
