// Do the newest screens actually render?
//
// Every other test here is pure: the engine in, a plan out. That is the right
// shape for the parts that matter most, and it is why the safety limits are
// trustworthy. But it left the screens covered by nothing at all — and the
// screens are where the last four defects were visible to the person and
// invisible to the suite.
//
// A browser pass is the honest way to check a screen, and it is not available
// from this environment: the egress policy blocks both the deployed app and
// the database, so there is nothing to log into. This is the next best thing
// and it is not nothing — it renders the real components with real props and
// asserts what a reader would look for. It catches a crash, a missing branch,
// a design-token violation and a promise the copy should not make. It does not
// catch layout.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The screens are client components that reach for the router and for server
// actions. Neither exists in a test process, and neither is what is under
// test — the markup is.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))
vi.mock('@/app/(app)/actions', () => ({
  setAiConsent: async () => ({ granted: true, at: null, outdated: false }),
  startAiForGoal: async () => ({ questions: [], reclassified: null, failure: null, detail: null }),
  finishAiForGoal: async () => ({ ok: true }),
  applyCorrections: async () => ({ ok: true, moved: 0, removed: 0 }),
  respondToExperiment: async () => ({ ok: true }),
}))

const { InsightsView } = await import('@/app/(app)/insights/InsightsView')
const { AiCatchUpView } = await import('@/app/(app)/ai/AiCatchUpView')
const { IntakeQuestionsStep } = await import('@/app/onboarding/IntakeQuestionsStep')
const { ActionItem } = await import('@/components/ActionItem')

const PROPOSAL = {
  headline: 'Drei Anker, die an deinen Abend passen',
  reasoning:
    'Du hast dienstags und donnerstags abends Zeit und trainierst lieber ohne Geräte. ' +
    'Darauf bauen die drei Aktionen auf.',
  mode: 'augment' as const,
  actions: [
    {
      title: 'Kurze Mobilisation vor dem Schlafen',
      reasoning: 'Du gehst spät ins Bett und schläfst schlecht — das ist der kleinste Hebel.',
      domain: 'sleep' as const,
      minutes: 10,
      timesPerWeek: 5,
      preferredSlot: 'evening' as const,
    },
  ],
}

const insights = (over: Partial<Parameters<typeof InsightsView>[0]['data']> = {}) => ({
  today: '2026-09-01',
  strengths: [],
  insights: [],
  experiment: null,
  running: null,
  concluded: null,
  patchNotes: [],
  moveCount: 0,
  removalCount: 0,
  weeksWithData: 2,
  note: null,
  ai: { provider: 'Google (Gemini)', granted: true, proposal: PROPOSAL, openQuestions: [] },
  ...over,
})

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element)

describe('the AI section on Insights', () => {
  it('names the actions and the reason for each', () => {
    const html = render(<InsightsView data={insights()} />)
    expect(html).toContain('Was die KI beiträgt')
    expect(html).toContain(PROPOSAL.actions[0].title)
    // Principle 4: a recommendation that cannot point at its input must not
    // exist. Showing the action without its reasoning would be exactly that.
    expect(html).toContain('kleinste Hebel')
  })

  it('disappears entirely when no provider is configured', () => {
    // A section explaining its own absence is the card clutter the UX
    // principles rule out.
    const html = render(
      <InsightsView
        data={insights({ ai: { provider: null, granted: false, proposal: null, openQuestions: [] } })}
      />,
    )
    expect(html).not.toContain('Was die KI beiträgt')
  })

  it.each([
    [
      'consent given but nothing back yet',
      { provider: 'Groq', granted: true, proposal: null, openQuestions: [] },
      'Noch nichts von der KI',
    ],
    [
      'consent withheld',
      { provider: 'Groq', granted: false, proposal: null, openQuestions: [] },
      'KI nicht erlaubt',
    ],
  ])('tells the two empty states apart: %s', (_case, ai, expected) => {
    const html = render(<InsightsView data={insights({ ai })} />)
    expect(html).toContain(expected)
    // Both must say the plan still stands. "No AI" is not a broken app.
    expect(html).toMatch(/deterministisch/)
  })

  it('keeps skipped questions visible', () => {
    // Skipped is `unknown`, not no. Filing it away silently would leave the
    // app unable to say what it still does not know.
    const html = render(
      <InsightsView
        data={insights({
          ai: {
            provider: 'Groq',
            granted: true,
            proposal: PROPOSAL,
            openQuestions: ['Hast du zu Hause Platz für eine Matte?'],
          },
        })}
      />,
    )
    expect(html).toContain('Platz für eine Matte')
  })

  it('says the goal track apart from the addition', () => {
    const takeover = { ...PROPOSAL, mode: 'takeover' as const }
    const html = render(<InsightsView data={insights({ ai: { provider: 'Groq', granted: true, proposal: takeover, openQuestions: [] } })} />)
    expect(html).toContain('Zielspur')
  })
})

describe('the questions step', () => {
  const questions = [
    {
      question: 'Hast du zu Hause Platz für eine Matte, oder fällt alles im Stehen an?',
      why: 'Entscheidet, ob die Einheiten am Boden oder im Stehen aufgebaut werden.',
      options: ['Platz für eine Matte', 'Nur im Stehen'],
    },
  ]

  it('shows the question, the reason and a way out', () => {
    const html = render(
      <IntakeQuestionsStep questions={questions} onDone={() => {}} saving={false} error={null} />,
    )
    expect(html).toContain('Platz für eine Matte')
    // Without `why` the screen is a form field, and a form field at the end of
    // a ten-minute intake is where people leave.
    expect(html).toContain('am Boden oder im Stehen')
    expect(html).toContain('Überspringen')
  })

  it('offers the model’s options as taps, not as a closed list', () => {
    const html = render(
      <IntakeQuestionsStep questions={questions} onDone={() => {}} saving={false} error={null} />,
    )
    expect(html).toContain('Nur im Stehen')
    expect(html).toContain('Oder in eigenen Worten')
  })
})

describe('the catch-up screen', () => {
  const base = {
    goalText: '5 kg abnehmen',
    hasProposal: false,
    provider: 'Google (Gemini)',
    learnsFromData: true,
    consent: { granted: true, outdated: false },
  }

  it('is honest about how the goal was classified', () => {
    const html = render(<AiCatchUpView {...base} classifiedBy="keywords" />)
    expect(html).toContain('Ohne KI eingeordnet')
  })

  it('asks for consent before offering the button', () => {
    const html = render(
      <AiCatchUpView {...base} classifiedBy="keywords" consent={{ granted: false, outdated: false }} />,
    )
    expect(html).toContain('KI-Unterstützung erlauben')
    expect(html).not.toContain('KI dazuholen')
  })

  it('says outright that the provider may learn from it', () => {
    // The sentence that decides whether the consent is informed. It is the one
    // somebody would be angry about discovering later, so it sits in the box
    // rather than behind a link — and it is asserted here because a text
    // nobody checks is a text that gets softened.
    const html = render(
      <AiCatchUpView {...base} classifiedBy="keywords" consent={{ granted: false, outdated: false }} />,
    )
    expect(html).toContain('behalten')
    expect(html).toContain('eigener KI-Modelle')
    expect(html).toContain('können sie lesen')
    expect(html).toContain('nicht zurückholen')
  })

  it('drops that sentence on a tier that does not learn', () => {
    // Still warning about training that no longer happens would be its own
    // kind of dishonesty, and it would make the switch to a paid tier
    // invisible to the person it benefits.
    const html = render(
      <AiCatchUpView
        {...base}
        learnsFromData={false}
        classifiedBy="keywords"
        consent={{ granted: false, outdated: false }}
      />,
    )
    expect(html).toContain('Google (Gemini)')
    expect(html).not.toContain('eigener KI-Modelle')
  })

  it('names the recipient in the consent sentence', () => {
    // Informed consent under Art. 9 (2) (a) has to name who receives the data.
    const html = render(
      <AiCatchUpView {...base} classifiedBy="keywords" consent={{ granted: false, outdated: false }} />,
    )
    expect(html).toContain('Google (Gemini)')
  })
})

const ACTION = {
  scheduledOn: '2026-09-09',
  domain: 'training' as const,
  track: 'goal' as const,
  title: 'Ganzkörper ohne Geräte',
  plannedDurationMin: 40,
  timeSlot: 'evening' as const,
  rationale: { text: 'Mittwoch 19:30, nach deiner Vorlesung.', basedOn: ['schedule.wed'] },
  details: {},
  cadence: 'weekly' as const,
}

describe('the action card', () => {
  it('asks nothing until there is something to explain', () => {
    // The question is the whole feature, and it is also the whole risk: a card
    // that opens with seven reason chips under every action is the "zweiter
    // Job" the product rules forbid. It appears after an answer, never before.
    const html = render(
      <ActionItem
        item={ACTION}
        status="unknown"
        onStatus={() => {}}
        onAnswer={async () => null}
        onAccept={async () => null}
      />,
    )
    expect(html).toContain('Ganzkörper ohne Geräte')
    expect(html).not.toContain("Woran lag's")
    expect(html).not.toContain('Zu müde')
  })

  it('keeps the one circle the design system sanctions, and no more', () => {
    // The card cannot join the aggregate check below: it contains the
    // completion ring, which is the single sanctioned `rounded-full` in the
    // whole product. So it is checked here, and the check is that there is
    // exactly one — a second would be a pill that crept in beside it.
    const html = render(
      <ActionItem item={ACTION} status="missed" onStatus={() => {}} onAnswer={async () => null} />,
    )
    expect(html.match(/rounded-full/g)).toHaveLength(1)
    expect(html).not.toMatch(/shadow-(sm|md|lg|xl)/)
    expect(html).not.toMatch(/(class|Name)="[^"]*(?:bg|text|border)-\[#/)
    expect(html).toMatch(/rounded-\[3px\]/)
  })

  it('renders unchanged where an answer would make no sense', () => {
    // Without the two handlers the card is exactly what it was: the standing
    // rules list passes no handlers, because "Eiweiß zu jeder Mahlzeit" cannot
    // be moved to Saturday.
    const plain = render(<ActionItem item={ACTION} status="missed" onStatus={() => {}} />)
    expect(plain).toContain('Ganzkörper ohne Geräte')
    expect(plain).not.toContain('Zu müde')
  })
})

describe('the design rules these screens must not break', () => {
  const everything = [
    render(<InsightsView data={insights()} />),
    render(<AiCatchUpView goalText="x" classifiedBy="ai" hasProposal provider="Groq" learnsFromData consent={{ granted: true, outdated: false }} />),
    render(
      <IntakeQuestionsStep
        questions={[{ question: 'Frage?', why: 'Weil.', options: ['a'] }]}
        onDone={() => {}}
        saving={false}
        error={null}
      />,
    ),
  ].join('\n')

  it('actually rendered something', () => {
    // The control check, and it matters more than the three below. If
    // renderToStaticMarkup returned an empty string — a mock that silently
    // failed, a component that bailed early — every "uses no X" assertion
    // would pass while proving nothing at all.
    expect(everything.length).toBeGreaterThan(3000)
    expect(everything).toContain('Was die KI beiträgt')
    expect(everything).toContain('Überspringen')
  })

  it.each([
    ['a pill radius', /rounded-full/],
    ['a shadow', /shadow-(sm|md|lg|xl)/],
    ['a hard-coded colour', /(class|Name)="[^"]*(?:bg|text|border)-\[#/],
  ])('uses no %s', (_case, pattern) => {
    // ADR-079 exists because an interface otherwise drifts back into the
    // generic look it came from. The rules are only real if something checks.
    expect(everything).not.toMatch(pattern)
  })
})
