'use client'

// The week, around the day the person is in.
//
// Two rules, both from the same complaint. The week no longer opens at Monday
// on a Thursday: every day is a row, and only the day you are in is open. And
// every day up to and including today can still be answered — "ich möcht
// nachhinein nachtragen können, dass ich gestern was nicht gemacht hab … und da
// meine wirkliche Kontrolle haben."
//
// The second rule is older than the first and is why this screen exists: the
// rings on Progress started saying "19 Aktionen hast du nicht bewertet" about a
// week whose earlier days had no screen that could reach them. A number that
// names a gap and offers no way to close it is worse than no number.
//
// Later days stay read-only. An action that has not happened yet cannot have
// been missed, and offering the choice would invite an answer that means
// nothing.

import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { dayPosition, openCount, PlanDay } from '@/components/PlanDay'
import { Card, Note, Screen, ScreenTitle } from '@/components/ui'
import { addDays, formatGermanDate } from '@/lib/engine/dates'
import { WEEKDAYS } from '@/lib/domain/types'

export default function PlanPage() {
  const { today, setStatus, answer, accept } = usePlan()

  return (
    <RequirePlan>
      {(plan) => {
        const days = WEEKDAYS.map((weekday, index) => {
          const date = addDays(plan.strategy.weekStart, index)
          return {
            weekday,
            date,
            position: dayPosition(date, today),
            items: plan.items.filter((i) => i.scheduledOn === date),
          }
        })

        // What the person still owes the week, counted the same way the day
        // rows count it — one rule, so the note and the badges can never
        // disagree about what "offen" means.
        const open = days.reduce((sum, day) => sum + openCount(day.items, day.position), 0)

        return (
          <Screen>
            <ScreenTitle
              title="Diese Woche"
              subtitle={`Ab ${formatGermanDate(plan.strategy.weekStart)}`}
            />

            {/* The goal, and what the week is supposed to do about it. It stays
                open at the top: it is the one thing on this screen that is true
                for all seven days. */}
            <Card tone="accent">
              <p className="text-sm font-semibold text-ink">{plan.strategy.goalTrack.headline}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {plan.strategy.goalTrack.summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>

            {open > 0 && (
              <Note>
                {open === 1
                  ? 'Ein Tag davor hat noch eine offene Aktion. Tag aufklappen und nachtragen.'
                  : `${open} Aktionen aus den Tagen davor sind noch offen. Tag aufklappen und nachtragen.`}
              </Note>
            )}

            <div className="flex flex-col gap-2">
              {days.map((day) => (
                <PlanDay
                  key={day.weekday}
                  weekday={day.weekday}
                  date={day.date}
                  items={day.items}
                  commitments={plan.commitments}
                  commitmentNotes={plan.commitmentNotes}
                  position={day.position}
                  onStatus={setStatus}
                  onAnswer={answer}
                  onAccept={accept}
                />
              ))}
            </div>

            <Note>
              Der Plan ist eine Start-Hypothese, kein Urteil. Er verändert sich, sobald die App sieht,
              was bei dir tatsächlich funktioniert.
            </Note>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
