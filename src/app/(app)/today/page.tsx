'use client'

// One day of the week, and by default the one you are in.
//
// It used to be one day and only one. That was right for the actions — Heute is
// where the work of today happens — and wrong for everything else on the
// screen: a Wednesday somebody forgot to fill in stayed forgotten, because the
// part that says how a day actually *felt* had no screen once the day was over.
// The actions could still be answered from Plan; energy, stress, sleep and the
// note could not be answered anywhere.
//
// That is the half the adaptive engine learns the most from. So the day is now
// a position on a strip, and stepping back to it brings the whole day with it:
// its actions, its appointments, its check-in, its note.
//
// What does *not* move with the strip is anything that is about right now. The
// impulse, the follow-up question and the question box belong to today and are
// shown only on today — an impulse about this week rendered under Mittwoch
// would be the app talking about a day it is not on.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { ActionItem } from '@/components/ActionItem'
import { AskCard } from '@/components/AskCard'
import { CheckInCard } from '@/components/CheckInCard'
import { commitmentsForDay, DayCommitments } from '@/components/DayCommitments'
import { FollowUpCard } from '@/components/FollowUpCard'
import { ImpulseCard } from '@/components/ImpulseCard'
import { DailyRules } from '@/components/DailyRules'
import { WeekStrip } from '@/components/WeekStrip'
import { Card, DomainBadge, Reasoning, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { getCheckIns } from '@/app/(app)/actions'
import { canCheckInOn } from '@/lib/domain/checkInDay'
import { formatGermanDate, startOfWeek, weekdayOf } from '@/lib/engine/dates'
import type { CheckIn } from '@/lib/db/tracking'

const WEEKDAY_LONG: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

export default function TodayPage() {
  const { today, setStatus, answer, accept, movedAway } = usePlan()

  // The day on screen. Resets to today whenever today changes — which happens
  // at midnight and on a fresh load, and both times the person means today.
  const [viewing, setViewing] = useState(today)
  const [shownFor, setShownFor] = useState(today)
  if (shownFor !== today) {
    setShownFor(today)
    setViewing(today)
  }

  // The week's check-ins, fetched once rather than per card.
  //
  // The card used to fetch its own, which was one request per day looked at and
  // a second round trip behind the week. One call covers the strip's marks and
  // every day the strip can reach.
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const weekStart = startOfWeek(today)

  useEffect(() => {
    let current = true
    void getCheckIns(weekStart)
      .then((entries) => {
        if (current) setCheckIns(entries)
      })
      // A failed load means no marks and empty scales, not a missing card. The
      // scales work without it, and a value typed now overwrites what was
      // there — which is what the person meant by typing it.
      .catch(() => {})
    return () => {
      current = false
    }
  }, [weekStart])

  const recorded = useMemo(() => new Set(checkIns.map((e) => e.checkedInOn)), [checkIns])

  const onSaved = useCallback((entry: CheckIn) => {
    setCheckIns((current) => [
      ...current.filter((e) => e.checkedInOn !== entry.checkedInOn),
      entry,
    ])
  }, [])

  return (
    <RequirePlan>
      {(week) => {
        // Also the ones that just left the day: an accepted move rewrites the
        // date, and a card that vanishes the instant somebody taps "Passt"
        // takes the confirmation with it. They stay until the next load.
        const all = week.items.filter(
          (i) => i.scheduledOn === viewing || movedAway[i.id] === viewing,
        )
        // Standing rules are collapsed into one card, so the two or three
        // things specific to the day are not buried under them.
        const rules = all.filter((i) => i.cadence === 'daily')
        const items = all.filter((i) => i.cadence !== 'daily')
        const fixed = commitmentsForDay(week.commitments, weekdayOf(viewing))

        const isToday = viewing === today
        // An action that has not happened cannot have been missed, and the
        // adaptive engine would read the answer as behaviour. Same rule as the
        // Plan screen, for the same reason.
        const answerable = viewing <= today
        const entry = checkIns.find((e) => e.checkedInOn === viewing) ?? null

        return (
          <Screen>
            <ScreenTitle
              title={WEEKDAY_LONG[weekdayOf(viewing)]}
              subtitle={formatGermanDate(viewing)}
              subtitleClass="num text-[13px]"
            />

            <WeekStrip
              weekStart={weekStart}
              selected={viewing}
              today={today}
              recorded={recorded}
              onSelect={setViewing}
            />

            {/* The goal, as one line under the date rather than a card of its
                own. It is context for the actions, not a competitor for them —
                and it used to take a third of the first screen to say what fits
                in a sentence. The whole reasoning is a tap away on the Plan
                screen, so nothing is lost, only quieter. */}
            <p className="-mt-2 mb-5 text-[15px] leading-snug text-muted">
              <span className="font-semibold text-ink">
                {week.strategy.goalTrack.headline}
              </span>
              {week.strategy.goalTrack.archetype === 'general_health'
                ? ' · deine Basis'
                : ' · dein Ziel'}
            </p>

            {/* What the person already had, before the app said anything.
                First, because it is fixed and the plan was built around it. */}
            {fixed.length > 0 && (
              <div className="mb-3">
                <DayCommitments
                  commitments={week.commitments}
                  weekday={weekdayOf(viewing)}
                  notes={week.commitmentNotes}
                />
              </div>
            )}

            {(all.length > 0 || fixed.length > 0) && (
              <div className="mb-2.5 flex items-baseline justify-between">
                <SectionHeading>{isToday ? 'Heute' : 'An dem Tag'}</SectionHeading>
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
                <p className="text-sm font-semibold text-ink">
                  {isToday ? 'Heute steht nichts an.' : 'An dem Tag steht nichts an.'}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Ruhetage gehören zum Plan.
                </p>
              </Card>
            ) : items.length === 0 ? null : (
              <div className="flex flex-col gap-3">
                {items.map((item) =>
                  answerable ? (
                    <ActionItem
                      key={item.id}
                      item={item}
                      status={item.status}
                      onStatus={(status) => setStatus(item.id, status)}
                      onAnswer={(status, reason, note) => answer(item.id, status, reason, note)}
                      onAccept={() => accept(item.id)}
                    />
                  ) : (
                    <div
                      key={item.id}
                      className="rounded-[3px] border border-line bg-surface p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-ink">{item.title}</p>
                        <DomainBadge domain={item.domain} track={item.track} />
                      </div>
                      <Reasoning>{item.rationale.text}</Reasoning>
                    </div>
                  ),
                )}
              </div>
            )}

            {/* Standing rules. Already one card with one ring and its own
                disclosure inside — wrapping it in a second one produced the
                "Jeden Tag" inside "Jeden Tag" the screenshot showed. */}
            {rules.length > 0 && answerable && (
              <div className="mt-3">
                <DailyRules items={rules} onStatus={setStatus} />
              </div>
            )}

            {/* Directly under the day's work, not at the bottom of the screen.

                This is the only thing here the app asks *for* rather than asks
                about, and everything the adaptive engine knows about how a week
                felt comes from it. It had drifted below two cards that are
                usually empty and one that is sometimes long, which on a phone
                means below the fold on every single day.

                Shown for a day that has happened, whichever one that is — going
                back to fill in Mittwoch is the reason the strip exists. Not for
                a day that has not: a report on an unlived day would reach the
                pattern detection as evidence, so the server refuses one too. */}
            {canCheckInOn(viewing, today) ? (
              <CheckInCard
                // A different day is a different card. The alternative is
                // three pieces of state kept in step with a prop by hand, and
                // getting that wrong saves one day's answers onto another.
                key={viewing}
                date={viewing}
                archetype={week.strategy.goalTrack.archetype}
                entry={entry}
                onSaved={onSaved}
              />
            ) : (
              <>
                <SectionHeading>Wie war der Tag?</SectionHeading>
                <Card>
                  <p className="text-sm leading-relaxed text-muted">
                    Der Tag war noch nicht. Sobald er da ist, kannst du hier eintragen, wie
                    er lief.
                  </p>
                </Card>
              </>
            )}

            {/* The two things the app says unprompted, and the box for asking
                it something. All three are about right now, so they stay on
                today — and each renders nothing at all when it has nothing. */}
            {isToday && (
              <>
                <ImpulseCard today={today} />
                <FollowUpCard today={today} />
                <AskCard today={today} />
              </>
            )}
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
