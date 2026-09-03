// When the app is allowed to ask something, and — mostly — when it is not.
//
// The whole feature is a balance between two failures. One is the app never
// asking, which is what it did: it asked once after the intake and then went
// quiet for ever, so a person's actual life reached it only if they typed it
// in unprompted. The other is the app asking whenever it is curious, which is
// an interview and is what the product rules mean by "zweiter Job".
//
// The gate below is the second failure's answer, and it is deterministic on
// purpose: whether asking is *allowed* is a count over days. Only what to ask
// is a judgement.

import { describe, expect, it } from 'vitest'
import {
  MAX_QUESTIONS_PER_WEEK, mayAskFollowUp, MIN_DAYS_BETWEEN_QUESTIONS,
  MIN_DAYS_WITH_DATA_BEFORE_ASKING, type FollowUpGate,
} from '@/lib/adaptive/followup'
import { addDays } from '@/lib/engine/dates'
import { followUpTask, followUpUserMessage, type FollowUpContext } from '@/lib/ai/tasks'

const TODAY = '2026-09-16'

function gate(overrides: Partial<FollowUpGate> = {}): FollowUpGate {
  return {
    today: TODAY,
    hasOpenQuestion: false,
    daysWithData: 10,
    lastAskedOn: null,
    askedThisWeek: 0,
    ...overrides,
  }
}

describe('one question at a time', () => {
  it('asks nothing while one is still open', () => {
    // Two open questions is a queue, and a queue is homework.
    const verdict = mayAskFollowUp(gate({ hasOpenQuestion: true }))
    expect(verdict.mayAsk).toBe(false)
    if (!verdict.mayAsk) expect(verdict.because).toBe('open_question')
  })

  it('outranks everything else, including a long silence', () => {
    const verdict = mayAskFollowUp(
      gate({ hasOpenQuestion: true, lastAskedOn: '2020-01-01', daysWithData: 500 }),
    )
    expect(verdict.mayAsk).toBe(false)
  })
})

describe('not straight after the intake', () => {
  it('waits until there is something to ground a question in', () => {
    // The onboarding just asked this person a lot. Following it with another
    // question before they have seen a plan through reads as a form that never
    // ends — and the app would have nothing to ask *about*.
    for (let days = 0; days < MIN_DAYS_WITH_DATA_BEFORE_ASKING; days++) {
      const verdict = mayAskFollowUp(gate({ daysWithData: days }))
      expect(verdict.mayAsk).toBe(false)
      if (!verdict.mayAsk) expect(verdict.because).toBe('too_early')
    }
  })

  it('is allowed once there is', () => {
    expect(mayAskFollowUp(gate({ daysWithData: MIN_DAYS_WITH_DATA_BEFORE_ASKING })).mayAsk).toBe(
      true,
    )
  })
})

describe('the gap and the ceiling', () => {
  it('holds three days after the last question', () => {
    for (let gap = 0; gap < MIN_DAYS_BETWEEN_QUESTIONS; gap++) {
      const verdict = mayAskFollowUp(gate({ lastAskedOn: addDays(TODAY, -gap) }))
      expect(verdict.mayAsk).toBe(false)
      if (!verdict.mayAsk) expect(verdict.because).toBe('too_soon')
    }
  })

  it('asks again once the gap has passed', () => {
    expect(
      mayAskFollowUp(gate({ lastAskedOn: addDays(TODAY, -MIN_DAYS_BETWEEN_QUESTIONS) })).mayAsk,
    ).toBe(true)
  })

  it('stops at the weekly ceiling however fast somebody answers', () => {
    // Belt and braces next to the gap: a person who answers instantly every
    // time could otherwise be asked twice a week for ever.
    const verdict = mayAskFollowUp(gate({ askedThisWeek: MAX_QUESTIONS_PER_WEEK }))
    expect(verdict.mayAsk).toBe(false)
    if (!verdict.mayAsk) expect(verdict.because).toBe('weekly_cap')
  })

  it('cannot be talked past by a clock that has gone backwards', () => {
    // A device with the wrong date, or a timezone change over a flight, would
    // otherwise produce a negative gap — smaller than every threshold, so the
    // app would ask again immediately.
    const verdict = mayAskFollowUp(gate({ lastAskedOn: addDays(TODAY, 5) }))
    expect(verdict.mayAsk).toBe(false)
  })
})

describe('the ceiling of one question', () => {
  const task = followUpTask(['Schlafzeiten'])

  const question = {
    question: 'Wann bist du dienstags abends normalerweise zu Hause?',
    why: 'Danach richtet sich, ob die Einheit dienstags früher liegen muss.',
    options: ['Vor 18 Uhr', 'Gegen 19 Uhr', 'Nach 20 Uhr'],
  }

  it('accepts one', () => {
    expect(task.parse({ needsMore: true, questions: [question] }).ok).toBe(true)
  })

  it('accepts none, which is the normal answer', () => {
    expect(task.parse({ needsMore: false, questions: [] }).ok).toBe(true)
  })

  it('refuses two, however good they are', () => {
    // Somebody mid-week is not filling in a form and will not work through
    // three. The intake step may ask three; this may not.
    const result = task.parse({
      needsMore: true,
      questions: [question, { ...question, question: 'Und mittwochs?' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.implausible).toBe(true)
  })

  it('keeps every safety rule the intake step has', () => {
    // The same gate, not a second one: a question about somebody's medication
    // is refused identically whether it arrives on day one or in week five.
    const medical = task.parse({
      needsMore: true,
      questions: [
        {
          question: 'Nimmst du Medikamente, die den Schlaf beeinflussen?',
          why: 'Das würde die Planung ändern.',
          options: ['Ja', 'Nein'],
        },
      ],
    })
    expect(medical.ok).toBe(false)
  })

  it('refuses a question about something the intake already answered', () => {
    const repeat = task.parse({
      needsMore: true,
      questions: [
        {
          question: 'Wann gehst du normalerweise ins Bett?',
          why: 'Danach richtet sich der Abend.',
          options: ['Vor 22 Uhr', 'Nach 23 Uhr'],
        },
      ],
    })
    expect(repeat.ok).toBe(false)
  })
})

describe('what the model is shown', () => {
  const context: FollowUpContext = {
    goalText: 'Ich will endlich besser schlafen',
    archetype: 'sleep_recovery',
    known: ['Schlafzeiten', 'Arbeitsform'],
    open: ['Kochen'],
    completion: [{ domain: 'Schlaf', done: 4, resolved: 7 }],
    reasons: ['Zu müde — 3× bei Training'],
    deviations: ['Mittwochs: 3 von 4 ausgefallen'],
    commitments: ['Dienstag 19:00, 90 min: Fußballtraining'],
    notes: [{ date: '2026-09-14', text: 'spät heimgekommen' }],
    alreadyAsked: ['Wie kommst du zur Arbeit?'],
  }

  it('shows the week that actually happened, not just the form', () => {
    // This is the whole difference from the intake step: that one asks what is
    // missing from a form, this asks what is missing from a life.
    const message = followUpUserMessage(context)
    expect(message).toContain('Zu müde — 3× bei Training')
    expect(message).toContain('spät heimgekommen')
    expect(message).toContain('Fußballtraining')
  })

  it('lists what it has already asked, so it cannot ask it twice', () => {
    const message = followUpUserMessage(context)
    expect(message).toContain('Wie kommst du zur Arbeit?')
    expect(message).toContain('frag nichts davon noch einmal')
  })

  it('names what the intake already knows', () => {
    expect(followUpUserMessage(context)).toContain('Schlafzeiten')
  })

  it('makes asking nothing the respectable answer', () => {
    expect(followUpUserMessage(context)).toContain('needsMore false')
  })

  it('leaves out every section it has nothing for', () => {
    const bare = followUpUserMessage({
      ...context,
      reasons: [],
      deviations: [],
      commitments: [],
      notes: [],
      alreadyAsked: [],
    })
    expect(bare).not.toContain('keine Vermutung')
    expect(bare).not.toContain('Feste Termine')
    expect(bare).not.toContain('frag nichts davon noch einmal')
  })
})
