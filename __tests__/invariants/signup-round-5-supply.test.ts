import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ownPage, emptyWork, notAWorker, type WorkingLife } from '@/lib/consultant-portfolio'
import { readsOnlyOwnWork } from '@/lib/console-home'
import { notYoursToRead, ENDING_SOON_READERS } from '@/lib/releasing-soon'

/**
 * Sign-up walk, round five (docs/results/2026-10-08-signup-round-5.md),
 * supply's two: 11 (a refusal drawn alone on Consultants, Training and
 * Ending soon) and 16 (a client's employee on Your work reads her own
 * answer, not four zero tiles). And the own-work seat: a worker holding
 * only the reads of his own work is refused the supply routes his menu
 * can reach that would show him the firm's people or its clients.
 *
 * The pages are read at source, in the style of signup-round-4-supply:
 * the behavior lives in client components with no handler to call.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

/** What ships: comments quote the old words on purpose. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// The shared refusal: the route's sentence and nothing else (components/ui).
const SENTENCE_ALONE = 'return <RefusedState says={refused} />'

describe('11 · on a refusal, the sentence alone', () => {
  it('Consultants draws only the door’s sentence when it is refused: no Add consultant, no Feed, Table or Export, no empty table', () => {
    const page = code(read('src/app/dashboard/consultants/page.tsx'))
    expect(page).toContain('if (res.status === 403) {')
    expect(page).toContain('if (refused) {')
    expect(page).toContain(SENTENCE_ALONE)
    // The early answer comes before the head, the button and the list.
    const gate = page.indexOf('if (refused) {')
    expect(gate).toBeLessThan(page.lastIndexOf('Add consultant'))
    expect(gate).toBeLessThan(page.indexOf('<ListSurface<Consultant>'))
  })

  it('Training asks its own door first, and a seat it refuses reads that sentence with no tiles of dashes and no prose beside it', () => {
    const page = code(read('src/app/dashboard/training/page.tsx'))
    const gate = page.indexOf("await fetch('/api/training')")
    expect(gate, 'the courses door is asked before anything else is read').toBeGreaterThan(-1)
    expect(gate).toBeLessThan(page.indexOf("fetch('/api/requirements?status=OPEN&limit=100')"))
    expect(page).toContain('if (gate.status === 403) {')
    expect(page).toContain(SENTENCE_ALONE)
    expect(page.indexOf('if (refused) {')).toBeLessThan(page.indexOf('Open job requests'))
  })

  it('Ending soon says a refusal as the sentence itself, never as "Could not load who is ending"', () => {
    const page = code(read('src/app/dashboard/rolloff/page.tsx'))
    expect(page).toContain('if (res.status === 403) {')
    expect(page).toContain(SENTENCE_ALONE)
    const gate = page.indexOf('if (refused) {')
    expect(gate).toBeLessThan(page.indexOf('Could not load who is ending'))
    expect(gate).toBeLessThan(page.indexOf('{d} days'))
  })

  it('Our scorecard draws a refusal alone, under no heading that promises numbers the reader may not read', () => {
    const page = code(read('src/app/dashboard/my-standing/page.tsx'))
    expect(page).toContain('if (error && !loading && cards.length === 0) {')
    expect(page.indexOf('if (error && !loading && cards.length === 0) {')).toBeLessThan(page.indexOf('How your clients see you'))
  })
})

describe('16 · Your work, for somebody nothing here is about as a worker', () => {
  const NOTHING = { contracts: 0, weeks: 0 }
  const MO: WorkingLife = {
    benches: [], employers: ['Northbend Athletic'], placements: 0, submissions: 0, paidEngagements: 0, hasProfile: false,
  }

  it('a client’s employee with no work reads that she works at her company, and has no placements, no weeks and no bills', () => {
    const n = notAWorker({ standing: ownPage(MO), employers: MO.employers, ownFirm: null, ...NOTHING })
    expect(n).not.toBeNull()
    expect(n!.at).toBe('You work at Northbend Athletic.')
    expect(n!.says).toBe('You have no contract work here: no placements, no weeks to file, and nobody bills for your time.')
    expect(n!.until).toBe('If a firm ever puts you forward or places you, that work shows here.')
  })

  it('that answer is never a supplier’s sentence: no vendor, no supplier, no "bills these"', () => {
    const n = notAWorker({ standing: ownPage(MO), employers: MO.employers, ownFirm: null, ...NOTHING })!
    expect(`${n.at} ${n.says} ${n.until}`).not.toMatch(/vendor|supplier|bills these/i)
  })

  it('somebody seated at no firm reads the same plain answer without a company line', () => {
    const nobody = { ...MO, employers: [] }
    const n = notAWorker({ standing: ownPage(nobody), employers: [], ownFirm: null, ...NOTHING })
    expect(n!.at).toBeNull()
    expect(n!.says).toContain('no placements')
  })

  it('anybody with a contract, a week, a page of their own or a firm of their own is not given it', () => {
    expect(notAWorker({ standing: ownPage(MO), employers: MO.employers, ownFirm: null, contracts: 1, weeks: 0 })).toBeNull()
    expect(notAWorker({ standing: ownPage(MO), employers: MO.employers, ownFirm: null, contracts: 0, weeks: 3 })).toBeNull()
    const listed = { ...MO, benches: ['Brightmoor Staffing'], hasProfile: true }
    expect(notAWorker({ standing: ownPage(listed), employers: [], ownFirm: null, ...NOTHING })).toBeNull()
    expect(notAWorker({ standing: ownPage(MO), employers: MO.employers, ownFirm: 'Okafor Clinical LLC', ...NOTHING })).toBeNull()
  })

  it('the contractor’s empty cards are still not drawn for her, so she is never told to turn a page on that is not hers', () => {
    expect(emptyWork({ standing: ownPage(MO), benches: [], ownFirm: null, ...NOTHING })).toBeNull()
  })

  it('Your work draws her answer ahead of the four tiles, from the route’s own field', () => {
    const page = code(read('src/app/dashboard/my-work/page.tsx'))
    const branch = page.indexOf('if (data.notAWorker) {')
    expect(branch).toBeGreaterThan(-1)
    expect(branch).toBeLessThan(page.indexOf('<Lbl>Hours this month</Lbl>'))
    const route = code(read('src/app/api/me/work/route.ts'))
    expect(route).toContain('notAWorker: notAWorker({')
    expect(route).toContain('standing, employers: life.employers, ownFirm: ownFirm?.name ?? null,')
  })
})

describe('the own-work seat · routes its menu reaches answer it with its own work only', () => {
  const KARTHIK = ['assignments.read', 'timesheets.read']

  it('a seat holding only the reads of its own work is told so, and a seat holding a desk’s read is not', () => {
    expect(readsOnlyOwnWork(KARTHIK)).toBe(true)
    expect(readsOnlyOwnWork([])).toBe(true)
    expect(readsOnlyOwnWork([...KARTHIK, 'consultants.read'])).toBe(false)
  })

  it('such a seat is refused Past contractors, Supplier scorecards and the firm’s own scorecard before anything is read', () => {
    for (const [file, before] of [
      ['src/app/api/alumni/route.ts', 'resolveClientCompany('],
      ['src/app/api/vendors/scorecards/route.ts', 'prisma.requirementInvitation.findMany'],
      ['src/app/api/me/scorecard/route.ts', 'prisma.requirementInvitation.findMany'],
    ] as const) {
      const route = code(read(file))
      const gate = route.indexOf('if (readsOnlyOwnWork(caller.permissions)) {')
      expect(gate, file).toBeGreaterThan(-1)
      expect(gate, file).toBeLessThan(route.indexOf(before))
      expect(route, file).toContain('notYoursToRead(')
    }
  })

  it('the refusal sends a worker to his own page, in words and without a permission key', () => {
    const says = notYoursToRead('Past contractors', 'Teleworld Solutions')
    expect(says).toBe('Past contractors at Teleworld Solutions is read by the desks that staff, run or pay its work. Your own work is on your own page.')
    expect(says).not.toMatch(/\.read|\.write/)
  })

  it('only the desks that read Ending soon may claim, tick off or resolve somebody’s offboarding', () => {
    expect(KARTHIK.some((p) => (ENDING_SOON_READERS as readonly string[]).includes(p))).toBe(false)
    for (const step of ['claim', 'checklist', 'resolve']) {
      const route = code(read(`src/app/api/rolloff/[id]/${step}/route.ts`))
      const gate = route.indexOf('if (!hasAnyPermission(caller.permissions, ENDING_SOON_READERS)) {')
      expect(gate, step).toBeGreaterThan(-1)
      expect(gate, step).toBeLessThan(route.indexOf('prisma.rolloffEvent.findUnique'))
    }
  })
})
