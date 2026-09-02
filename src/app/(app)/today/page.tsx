'use client'

import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { ActionItem } from '@/components/ActionItem'
import { CheckInCard } from '@/components/CheckInCard'
import { DailyRules } from '@/components/DailyRules'
import { Card, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { formatGermanDate, weekdayOf } from '@/lib/engine/dates'

const WEEKDAY_LONG: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

export default function TodayPage() {
  const { today, setStatus, answer, accept, movedAway } = usePlan()

  return (
    <RequirePlan>
      {(week) => {
        // Also the ones that just left today: an accepted move rewrites the
        // date, and a card that vanishes the instant somebody taps "Passt"
        // takes the confirmation with it. They stay until the next load.
        const all = week.items.filter(
          (i) => i.scheduledOn === today || movedAway[i.id] === today,
        )
        // Standing rules are collapsed into one card, so the two or three
        // things specific to today are not buried under them.
        const rules = all.filter((i) => i.cadence === 'daily')
        const items = all.filter((i) => i.cadence !== 'daily')
        const restToday = !items.some((i) => i.domain === 'training')

        return (
          <Screen>
            <ScreenTitle
              title={WEEKDAY_LONG[weekdayOf(today)]}
              subtitle={formatGermanDate(today)}
              subtitleClass="num text-[13px]"
            />

            {/* The goal, as one line under the date rather than a card of its
                own. It is context for the actions, not a competitor for them —
                and it used to take a third of the first screen to say what fits
                in a sentence. The whole reasoning is a tap away on the Plan
                screen, so nothing is lost, only quieter. */}
            <p className="-mt-4 text-[15px] leading-snug text-muted">
              <span className="font-semibold text-ink">
                {week.strategy.goalTrack.headline}
              </span>
              {week.strategy.goalTrack.archetype === 'general_health'
                ? ' · deine Basis'
                : ' · dein Ziel'}
            </p>

            {all.length > 0 && (
              <div className="mb-2.5 flex items-baseline justify-between">
                <SectionHeading>Heute</SectionHeading>
                <span className="num text-[11px] text-faint">
                  {all.filter((i) => i.status === 'done').length}/{all.length}
                </span>
              </div>
            )}

            {rules.length > 0 && (
              <div className="mb-3">
                <DailyRules items={rules} onStatus={setStatus} />
              </div>
            )}

            {items.length === 0 && rules.length === 0 ? (
              <Card>
                <p className="text-sm font-semibold text-ink">Heute steht nichts an.</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Das ist kein Versäumnis, sondern geplant. Ruhetage gehören zum Plan.
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <ActionItem
                    key={item.id}
                    item={item}
                    status={item.status}
                    onStatus={(status) => setStatus(item.id, status)}
                    onAnswer={(status, reason, note) => answer(item.id, status, reason, note)}
                    onAccept={() => accept(item.id)}
                  />
                ))}
              </div>
            )}

            {/* One line, not three. The rule about untouched actions matters,
                but repeating it under every screen is how a product starts
                sounding anxious. */}
            <Note>
              {restToday && items.length > 0
                ? 'Heute kein Training — die Basis läuft weiter. Nicht Abgehaktes zählt nie gegen dich.'
                : 'Nicht Abgehaktes zählt nie gegen dich.'}
            </Note>

            <CheckInCard today={today} archetype={week.strategy.goalTrack.archetype} />
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
