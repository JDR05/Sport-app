'use client'

// The week, at week level.
//
// This screen used to be a second Heute: every day expandable, every action
// answerable, the same rings and the same reasoning. That was right while Heute
// could only show today — a past day had to be answerable from somewhere. Heute
// steps across the week now (ADR-112), so all of that was duplication, and the
// Product Owner said so: "der Abschnitt Plan ist eigentlich dann überflüssig,
// da wir ja alles in Heute haben."
//
// It is not redundant, but the reason it is not is narrow, so the screen is now
// narrow too. The brief asks every screen to answer *was ist heute wichtig,
// warum, was kommt als Nächstes*. Heute answers the first two. The third one it
// structurally cannot: to find out where the next gym session sits you would
// tap through seven days. That is this screen's whole job, and everything that
// is not that job has been taken out of it.
//
// So: the strategy, seven rows, and what is still open. Tapping a day opens it
// in Heute. One place to record, one place to survey.

import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { commitmentsForDay } from '@/components/DayCommitments'
import { PlanDay } from '@/components/PlanDay'
import { DAY_PARAM, dayPosition, openCount } from '@/lib/domain/weekDays'
import { Card, Note, Screen, ScreenTitle } from '@/components/ui'
import { addDays, formatGermanDate } from '@/lib/engine/dates'
import { WEEKDAYS } from '@/lib/domain/types'

export default function PlanPage() {
  const { today } = usePlan()

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
            fixed: commitmentsForDay(plan.commitments, weekday),
          }
        })

        // What the person still owes the week, counted the same way the rows
        // count it — one rule, so the note and the badges can never disagree
        // about what "offen" means.
        const open = days.reduce((sum, day) => sum + openCount(day.items, day.position), 0)

        return (
          <Screen>
            <ScreenTitle
              title="Diese Woche"
              subtitle={`Ab ${formatGermanDate(plan.strategy.weekStart)}`}
            />

            {/* The goal, and what the week is supposed to do about it.

                The one thing on this screen that is true for all seven days,
                and the concrete version of it: not "abnehmen" but "2× Training
                à 60 Min, 1900 kcal pro Tag, 2 Ruhetage". Heute shows only the
                headline, so this is the only place the week's actual numbers
                are visible. */}
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
                  ? 'Ein Tag davor hat noch eine offene Aktion. Tag antippen und nachtragen.'
                  : `${open} Aktionen aus den Tagen davor sind noch offen. Tag antippen und nachtragen.`}
              </Note>
            )}

            <div className="flex flex-col gap-2">
              {days.map((day) => (
                <PlanDay
                  key={day.weekday}
                  weekday={day.weekday}
                  date={day.date}
                  items={day.items}
                  fixed={day.fixed}
                  position={day.position}
                  href={`/today?${DAY_PARAM}=${day.date}`}
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
