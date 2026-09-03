// How much Today is allowed to be.
//
// It had grown to nine stacked blocks — an impulse, a question, the
// appointments, the standing rules, the actions, a note, a check-in carrying
// eight scales, and a question box. Every one of them was added for a good
// reason and defended on its own, and together they buried the three things
// somebody opens the app for:
//
//   "es ist alles so unübersichtlich und viel Text der zu nichts führt"
//
// The brief already said it — "keine zwanzig Karten pro Screen" — and a rule
// nothing checks is a preference. So this file counts.

import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))
vi.mock('@/app/(app)/actions', () => ({
  loadAskState: async () => ({ available: false, history: [], suggestions: [], exhausted: null }),
  submitQuestion: async () => ({ ok: false, reason: 'invalid', message: 'x' }),
  loadTodaysImpulse: async () => null,
  loadFollowUp: async () => null,
  submitFollowUp: async () => ({ ok: true }),
  getCheckIns: async () => [],
  submitCheckIn: async () => ({ ok: true }),
}))

const { Disclosure } = await import('@/components/Disclosure')

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element)

describe('anything that is not today’s actions is one line', () => {
  it('shows the label and hides the contents until asked', () => {
    const html = render(
      <Disclosure label="Wie war der Tag?" hint="Check-in">
        <p>Acht Skalen und ein Textfeld.</p>
      </Disclosure>,
    )
    expect(html).toContain('Wie war der Tag?')
    expect(html).not.toContain('Acht Skalen')
  })

  it('says what is behind the line, so nothing is actually hidden', () => {
    // The difference between folding and hiding. A line that does not say what
    // it opens is a thing people never tap.
    const html = render(
      <Disclosure label="Jeden Tag" hint="3">
        <p>x</p>
      </Disclosure>,
    )
    expect(html).toContain('Jeden Tag')
    expect(html).toContain('>3<')
  })

  it('is one tappable row, at thumb size', () => {
    const html = render(
      <Disclosure label="Frag nach">
        <p>x</p>
      </Disclosure>,
    )
    expect(html).toContain('min-h-11')
    expect((html.match(/<button/g) ?? []).length).toBe(1)
  })
})

describe('the source of Today, as a budget', () => {
  const source = readFileSync('src/app/(app)/today/page.tsx', 'utf8')

  it('renders the actions unfolded', () => {
    // The one thing that may never end up behind a line.
    const actions = source.indexOf('<ActionItem')
    const firstDisclosure = source.indexOf('<Disclosure')
    expect(actions).toBeGreaterThan(-1)
    expect(actions).toBeLessThan(firstDisclosure)
  })

  it('keeps at most two blocks above the actions', () => {
    // The appointments, because the plan was built around them, and the
    // heading. Everything the app says unprompted moved below the list, where
    // it cannot push today's actions off the first screen.
    const before = source.slice(0, source.indexOf('<ActionItem'))
    for (const late of ['<ImpulseCard', '<FollowUpCard', '<CheckInCard', '<AskCard']) {
      expect(before, late).not.toContain(late)
    }
  })

  it('folds everything that repeats every single day', () => {
    for (const folded of ['<DailyRules', '<CheckInCard', '<AskCard']) {
      const at = source.indexOf(folded)
      const disclosureBefore = source.lastIndexOf('<Disclosure', at)
      const closingBefore = source.lastIndexOf('</Disclosure>', at)
      expect(disclosureBefore, folded).toBeGreaterThan(closingBefore)
    }
  })

  it('carries no standing sentence that leads nowhere', () => {
    // "Nicht Abgehaktes zählt nie gegen dich", under the list, every day, for
    // ever. True, and after the second reading it is furniture.
    expect(source).not.toContain('<Note>')
  })
})
