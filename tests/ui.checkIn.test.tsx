// The question the app asks about the day.
//
// "Das mit wie es mir heute geht — Essen, Stress — hast du komplett entfernt.
//  Gibt's jetzt einfach nicht mehr."
//
// It had not been removed. It rendered `null` until `getCheckIns` came back and
// there was no catch on that call, so a single failed response left the card
// invisible for the rest of the session with nothing on screen to say why. From
// the sofa that is the same thing as deletion — and everything the adaptive
// engine knows about how a week *felt* comes from this card, so an invisible one
// is a silent hole in the data the whole product is built on.
//
// The rule these tests hold: the scales need no server data to be usable, so
// they are drawn immediately and filled in if an answer arrives.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

vi.mock('@/app/(app)/actions', () => ({
  getCheckIns: () => new Promise(() => {}),
  submitCheckIn: async () => ({ ok: true }),
}))

const { CheckInCard } = await import('@/components/CheckInCard')

const draw = (
  archetype: Parameters<typeof CheckInCard>[0]['archetype'],
  entry: Parameters<typeof CheckInCard>[0]['entry'] = null,
) => renderToStaticMarkup(<CheckInCard date="2026-09-03" archetype={archetype} entry={entry} />)

describe('the card exists before the server answers', () => {
  it('draws its heading and its scales with no data at all', () => {
    const markup = draw('body_composition')
    expect(markup).toContain('Wie war der Tag?')
    expect(markup).toContain('Energie')
    expect(markup).toContain('Stimmung')
  })

  it('asks about eating on a goal where eating is the lever', () => {
    // The specific thing he named. A body-composition goal has to ask it.
    expect(draw('body_composition')).toContain('Gegessen')
  })

  it('asks about stress, whatever the goal', () => {
    for (const archetype of ['body_composition', 'sleep_recovery', 'habit_routine'] as const) {
      expect(draw(archetype), archetype).toContain('Stress')
    }
  })

  it('offers every step of the scale, so a value can be given', () => {
    const markup = draw('body_composition')
    // Five buttons per scale; the labels are what make them answerable.
    expect(markup).toContain('leer')
    expect(markup).toContain('voll da')
  })
})

describe('what it asks follows the goal', () => {
  it('asks a sleep goal about the night', () => {
    expect(draw('sleep_recovery')).toContain('Schlaf')
  })

  it('does not ask everything of everybody', () => {
    // Nine things are recorded across the app. Asking all nine every evening is
    // the second job the brief rules out, and it makes the answers worse.
    const body = draw('body_composition')
    const habit = draw('habit_routine')
    expect(body).not.toBe(habit)
  })
})

// ---------------------------------------------------------------------------
// One card, any day of the week.
//
// Heute can be stepped back now, so this card no longer describes "today" — it
// describes whichever day the strip is on. That makes one bug possible that was
// not possible before, and it is the worst kind: stepping from Freitag to
// Mittwoch while Freitag's numbers stay on screen, and then saving them onto
// Mittwoch. The person would have overwritten a day they meant to fill in.

describe('the day it is reporting on', () => {
  const entry = (over: Partial<Parameters<typeof draw>[1] & object> = {}) => ({
    checkedInOn: '2026-09-03',
    energy: 4,
    mood: null,
    stress: 2,
    sleepHours: 7,
    dietQuality: null,
    soreness: null,
    alcoholUnits: null,
    caffeineLate: null,
    note: 'Langer Tag, trotzdem trainiert.',
    ...over,
  })

  it('shows what is stored for that day', () => {
    const markup = draw('body_composition', entry())
    // The scales say which value is chosen through aria-pressed; the note is
    // the plain-text half and is what he asked for by name.
    expect(markup).toContain('Langer Tag, trotzdem trainiert.')
    expect(markup).toContain('aria-label="Energie 4 von 5: gut" aria-pressed="true"')
  })

  it('says it has an entry rather than inviting a first one', () => {
    expect(draw('body_composition', entry())).toContain('Gespeichert')
    expect(draw('body_composition', null)).not.toContain('Gespeichert')
  })

  it('starts empty for a day with nothing stored', () => {
    // A day nobody rated is missing information, not a bad day. Carrying the
    // previous day's numbers in would invent the information instead.
    const markup = draw('body_composition', null)
    expect(markup).not.toContain('aria-pressed="true"')
  })
})
