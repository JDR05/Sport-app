'use client'

import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { ActionItem } from '@/components/ActionItem'
import { AskCard } from '@/components/AskCard'
import { CheckInCard } from '@/components/CheckInCard'
import { commitmentsForDay, DayCommitments } from '@/components/DayCommitments'
import { FollowUpCard } from '@/components/FollowUpCard'
import { ImpulseCard } from '@/components/ImpulseCard'
import { DailyRules } from '@/components/DailyRules'
import { Card, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { Disclosure } from '@/components/Disclosure'
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
        const fixed = commitmentsForDay(week.commitments, weekdayOf(today))

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

            {/* The actions, first.
                
                This screen had grown to nine stacked blocks — an impulse, a
                question, the appointments, the standing rules, the actions, a
                note, a check-in with eight scales in it and a question box.
                Each earned its place on its own; together they buried the
                three things somebody opens the app for, which is exactly the
                "keine zwanzig Karten pro Screen" the brief rules out.
                
                The rule now: today's actions are the screen. Everything else
                is one line until it is asked for. */}

            {/* What the person already had, before the app said anything.
                First, because it is fixed and the plan was built around it. */}
            {fixed.length > 0 && (
              <div className="mb-3">
                <DayCommitments
                  commitments={week.commitments}
                  weekday={weekdayOf(today)}
                  notes={week.commitmentNotes}
                />
              </div>
            )}

            {(all.length > 0 || fixed.length > 0) && (
              <div className="mb-2.5 flex items-baseline justify-between">
                <SectionHeading>Heute</SectionHeading>
                {/* Counts only what the app planned. A fixed appointment is
                    not something it may claim credit for. */}
                {all.length > 0 && (
                  <span className="num text-[11px] text-faint">
                    {all.filter((i) => i.status === 'done').length}/{all.length}
                  </span>
                )}
              </div>
            )}

            {items.length === 0 && rules.length === 0 && fixed.length === 0 ? (
              <Card>
                <p className="text-sm font-semibold text-ink">Heute steht nichts an.</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Ruhetage gehören zum Plan.
                </p>
              </Card>
            ) : items.length === 0 ? null : (
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

            {/* Standing rules, folded. They repeat every single day, so they
                are the last thing that needs to be re-read every single day. */}
            {rules.length > 0 && (
              <Disclosure label="Jeden Tag" hint={`${rules.length}`}>
                <DailyRules items={rules} onStatus={setStatus} />
              </Disclosure>
            )}

            {/* Below the actions from here down, and each one line.
                
                The impulse and the question are the two things the app says
                unprompted. They were above the list, where they pushed the
                actions off the first screen; they are rare, so a line that
                says one is waiting costs nothing on the days there is none. */}
            <ImpulseCard today={today} />
            <FollowUpCard today={today} />

            <Disclosure label="Wie war der Tag?" hint="Check-in">
              <CheckInCard today={today} archetype={week.strategy.goalTrack.archetype} bare />
            </Disclosure>

            <Disclosure label="Frag nach" hint="zu deinem Plan">
              <AskCard today={today} bare />
            </Disclosure>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
