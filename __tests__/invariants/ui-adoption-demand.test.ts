import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The buying side's pages draw the shared layer (components/ui), the
 * founder's brief of 2026-10-09: "every state — loading, empty, error,
 * refused — drawn by one primitive", and one head, one chip, one stat.
 *
 * What the primitives themselves draw is said in shared-primitives.test.ts.
 * These sentences say only that demand's pages use them and no longer
 * hand-roll their own: a refusal paragraph, a "Loading…" line, a skeleton,
 * a filter-tab row, a page's own Panel, Stat, Chip or Lbl.
 */

const read = (p: string) => readFileSync(join(process.cwd(), 'src/app/dashboard', p), 'utf8')

const FAMILIES: Array<[string, string[]]> = [
  ['Job requests, as a client reads them', ['requisitions/page.tsx', 'requisitions/[id]/page.tsx']],
  ['Job requests, as a supplier reads them', ['requirements/page.tsx', 'requirements/[id]/page.tsx', 'requirements/[id]/pile/page.tsx']],
  ['Submissions', ['submissions/page.tsx', 'submissions/[id]/terms/page.tsx']],
  ['Timesheets', ['timesheets/page.tsx']],
  ['Contractors', ['people/page.tsx', 'people/[id]/page.tsx']],
  ['Suppliers', ['suppliers/page.tsx']],
  ['Leads', ['leads/page.tsx']],
  ['Shared with you', ['invitations/page.tsx']],
  ['Needs attention', ['decisions/page.tsx']],
  ['Duplicate check', ['identity/page.tsx']],
  ['The program desk and its pages', [
    'program/page.tsx', 'program/org/page.tsx', 'program/team/page.tsx', 'program/seats/page.tsx',
    'program/budget/page.tsx', 'program/milestones/page.tsx', 'program/agreements/page.tsx',
  ]],
]

/** A refusal drawn by hand: a bare paragraph holding the route's sentence. */
const HAND_REFUSAL = /return <p className="[^"]*">\{(refused|unreadable|trouble\.says|SUBMISSIONS_NOT_AT_A_COMPANY|TIMESHEETS_NOT_AT_A_COMPANY)\}<\/p>/
/** A loading line or a grey skeleton drawn by hand. */
const HAND_LOADING = /<(p|div)[^>]*>(Loading[^<]*|Reading…)<\/(p|div)>|animate-pulse/
/** A page that defines its own copy of a shared piece. */
const OWN_PIECE = /^(export )?function (Panel|Stat|Chip|Lbl)\(/m

for (const [family, files] of FAMILIES) {
  describe(family, () => {
    it(`the ${family} pages draw their refusal, loading and empty states through the shared primitives and nothing by hand`, () => {
      for (const f of files) {
        const src = read(f)
        expect(src, f).toContain("from '@/components/ui'")
        expect(src, f).toContain('<RefusedState says=')
        expect(src, f).not.toMatch(HAND_REFUSAL)
        expect(src, f).not.toMatch(HAND_LOADING)
        // Loading is drawn by the primitive, or by the list, which draws it.
        expect(src.includes('<LoadingState') || /loading=\{loading\}/.test(src), f).toBe(true)
      }
    })

    it(`the ${family} pages define no Panel, Stat, Chip or label of their own, and no filter-tab row`, () => {
      for (const f of files) {
        const src = read(f)
        expect(src, f).not.toMatch(OWN_PIECE)
        expect(src, f).not.toContain('filter-tab')
      }
    })
  })
}

describe('the heads of the buying side’s pages', () => {
  it('every list page is headed by PageHead, its eyebrow the section of the reader’s own menu', () => {
    for (const f of [
      'requisitions/page.tsx', 'requirements/page.tsx', 'submissions/page.tsx', 'timesheets/page.tsx',
      'people/page.tsx', 'suppliers/page.tsx', 'leads/page.tsx', 'invitations/page.tsx', 'decisions/page.tsx',
      'identity/page.tsx', 'program/org/page.tsx', 'program/team/page.tsx', 'program/seats/page.tsx',
      'program/budget/page.tsx', 'program/milestones/page.tsx', 'program/agreements/page.tsx',
    ]) {
      const src = read(f)
      expect(src, f).toMatch(/<PageHead\s+eyebrow=\{(section|framing\.eyebrow)\}/)
      expect(src, f).not.toMatch(/<h1[ >]/)
    }
  })

  it('a job request, a person and a person’s terms are headed by DetailHead, with a way back only where the reader’s menu has the list', () => {
    for (const f of ['requisitions/[id]/page.tsx', 'requirements/[id]/page.tsx', 'people/[id]/page.tsx', 'submissions/[id]/terms/page.tsx']) {
      const src = read(f)
      expect(src, f).toContain("import { DetailHead } from '@/components/ui/detail-head'")
      expect(src, f).toMatch(/<DetailHead\s+from=/)
      expect(src, f).toMatch(/back=\{[^}]*section \?/)
      expect(src, f).not.toMatch(/<h1[ >]/)
    }
  })
})

describe('one search box per list', () => {
  it('Job requests searches through the list’s own box, over title, budget code, place and skill, and draws no second box above it', () => {
    const src = read('requisitions/page.tsx')
    expect(src).not.toMatch(/placeholder="Search by job, budget code, skill or location…"\s*\n\s*className=/)
    expect(src).toContain('searchFilter={matchesSearch}')
    expect(src).toContain('searchPlaceholder="Search by job, budget code, skill or location…"')
    expect(src).not.toMatch(/<input[^>]*value=\{q\}/)
  })

  it('the stage, status and kind filters on the buying side’s lists sit in the list’s own filter row', () => {
    for (const f of ['requisitions/page.tsx', 'requirements/page.tsx', 'submissions/page.tsx', 'timesheets/page.tsx']) {
      expect(read(f), f).toMatch(/filters=\{\s*<FilterChips/)
    }
  })
})

describe('the buying side’s forms', () => {
  it('the submit form, the job request form and the invitation forms label every field through Field and send through SubmitButton', () => {
    const forms: Array<[string, string, string]> = [
      ['submissions/page.tsx', 'function SubmitToRequirementModal', '// ── Place (the award)'],
      ['requirements/page.tsx', 'function NewRequirementModal', '// ── Page'],
      ['requirements/[id]/page.tsx', 'function DistributeModal', '\u0000'],
      ['invitations/page.tsx', 'function AnswerBox', 'function InvitationCard'],
      ['people/page.tsx', 'function AskForm', '\u0000'],
    ]
    for (const [f, from, to] of forms) {
      const whole = read(f)
      const start = whole.indexOf(from)
      expect(start, `${f} ${from}`).toBeGreaterThan(-1)
      const end = whole.indexOf(to, start)
      const form = whole.slice(start, end === -1 ? undefined : end)
      expect(form, f).toContain('<Field')
      expect(form, f).toContain('<SubmitButton')
      // No hand-tied label: Field owns the ids.
      expect(form, f).not.toMatch(/<label[^>]*htmlFor=/)
    }
  })

  it('a send that waits says what it is doing and cannot be pressed twice, through the button and not a ternary in its label', () => {
    const src = read('submissions/page.tsx')
    expect(src).toContain('pendingLabel="Submitting…"')
    expect(src).not.toContain("{submitting ? 'Submitting…'")
  })
})
