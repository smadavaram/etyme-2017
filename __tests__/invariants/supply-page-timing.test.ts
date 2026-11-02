import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mightRunOut, papersRunningOut, type HeldOnFile, type RequiredOfHer } from '@/app/dashboard/my-work/paperwork-rows'
import { openWeeks, dayStanding, shortDay } from '@/lib/consultant-portfolio'
import { plainDate, daySpan } from '@/lib/plain-date'

/**
 * The page-timing pass of 2026-11-02 (26 seats, 40 at once, on a world of
 * 3,429 people): a worker's own first screen, /api/me/work, read what
 * every one of her lines requires on every visit, four or five queries a
 * placement, to say whether a paper of hers runs out. And it printed
 * hundreds of days with a formatter built for each one. Each change below
 * keeps the page's words and figures exactly as they were.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const ON = new Date('2026-11-02T00:00:00Z')
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const paper = (key: string, o: Partial<HeldOnFile> = {}): HeldOnFile => ({
  id: `${key}-${o.expiresAt ? String(o.expiresAt) : 'open'}`, key, label: key, issuer: null, status: 'CLEAR',
  validFrom: day('2025-01-01'), expiresAt: null, ...o,
})
const stops = (keys: readonly string[]): RequiredOfHer[] => keys.map((key) => ({ key, required: true, blocks: true, waived: false, owedBy: 'WORKER' }))

describe('a worker’s own page reads what her lines require only when a paper of hers could need saying', () => {
  it('a paper with no end, or one good for longer than the window, is never said, so her lines’ requirements need not be read', () => {
    const held = [paper('RN_LICENSE', { expiresAt: day('2027-09-30') }), paper('DEGREE')]
    expect(mightRunOut(held, ON)).toBe(false)
    expect(papersRunningOut({ held, required: stops(['RN_LICENSE', 'DEGREE']), on: ON })).toEqual([])
  })

  it('a paper running out within the window, not in force yet, or run out could need saying, so her lines are read', () => {
    expect(mightRunOut([paper('RN_LICENSE', { expiresAt: day('2026-11-15') })], ON)).toBe(true)
    expect(mightRunOut([paper('BLS', { validFrom: day('2026-12-01'), expiresAt: day('2028-12-01') })], ON)).toBe(true)
    expect(mightRunOut([paper('TB_TEST', { validFrom: day('2025-01-01'), expiresAt: day('2026-10-01') })], ON)).toBe(true)
  })

  it('whatever her lines require, nothing is said where mightRunOut says no, and what is said with a list is never more than with every paper counted', () => {
    const cases: HeldOnFile[][] = [
      [paper('RN_LICENSE', { expiresAt: day('2026-11-20') }), paper('BLS', { expiresAt: day('2029-01-01') })],
      [paper('I9'), paper('TB_TEST', { expiresAt: day('2026-01-01') })],
      [paper('RN_LICENSE', { expiresAt: day('2026-11-20') }), paper('RN_LICENSE', { validFrom: day('2026-11-21'), expiresAt: day('2028-11-21') })],
      [paper('CERT', { status: 'REJECTED', expiresAt: day('2026-11-05') })],
    ]
    const lists: string[][] = [[], ['RN_LICENSE'], ['BLS', 'TB_TEST'], ['RN_LICENSE', 'BLS', 'TB_TEST', 'I9', 'CERT']]
    for (const held of cases) {
      const every = papersRunningOut({ held, required: stops([...new Set(held.map((h) => h.key))]), on: ON })
      for (const keys of lists) {
        const some = papersRunningOut({ held, required: stops(keys), on: ON })
        if (!mightRunOut(held, ON)) expect(some).toEqual([])
        expect(some).toEqual(every.filter((r) => keys.includes(r.key ?? '')))
      }
    }
  })

  it('the route reads her file first, and asks for her lines and what they require only after mightRunOut says yes', () => {
    const route = read('src/app/api/me/work/route.ts')
    const body = route.slice(route.indexOf('async function runningOutFor'), route.indexOf('async function movesFor'))
    expect(body.indexOf('prisma.verification.findMany')).toBeLessThan(body.indexOf('if (!mightRunOut(onFile, now)) return []'))
    expect(body.indexOf('if (!mightRunOut(onFile, now)) return []')).toBeLessThan(body.indexOf('prisma.sellContract.findMany'))
    expect(body.indexOf('if (!mightRunOut(onFile, now)) return []')).toBeLessThan(body.indexOf('requirementsFor('))
  })

  it('who approved every week still waiting on the client is read in one go, and week by week only where that read fails', () => {
    const route = read('src/app/api/me/work/route.ts')
    const body = route.slice(route.indexOf('const emailAnswer = new Map'), route.indexOf('return NextResponse.json({', route.indexOf('const emailAnswer = new Map')))
    expect(body).toContain('readWeekApprovalsFor(reader, waitingOnClient.map((t) => t.id), now).catch(() => null)')
    // The single read is asked only where the one read failed.
    expect(body).toContain(': await readWeekApprovals(reader, t.id, now).catch(() => null)')
    expect(body.indexOf('readWeekApprovalsFor(')).toBeLessThan(body.indexOf('for (const t of waitingOnClient)'))
  })

  it('somebody nobody is moving between projects reads no names, lines or job requests for moves', () => {
    const route = read('src/app/api/me/work/route.ts')
    const body = route.slice(route.indexOf('async function movesFor'), route.indexOf('export async function GET'))
    expect(body.indexOf('if (releases.length === 0 && holds.length === 0) return []')).toBeLessThan(body.indexOf('prisma.person.findMany'))
    expect(body).toContain('placedIds.length')
    expect(body).toContain('reqIds.length')
  })
})

describe('the weeks she can still file, read once', () => {
  it('a day is offered in a week exactly where dayStanding calls it open, however many weeks are filed', () => {
    const c = { startDate: '2026-08-03', endDate: '2026-12-31' }
    const filed = [
      { periodStart: '2026-09-27', periodEnd: '2026-10-03' },
      { periodStart: '2026-10-11', periodEnd: '2026-10-14' },
      { periodStart: '2026-10-18', periodEnd: '2026-10-24' },
    ]
    const today = '2026-11-02'
    const offered = new Set(openWeeks(c, filed, today).flatMap((w) => w.days))
    for (let d = Date.UTC(2026, 8, 20); d <= Date.UTC(2026, 10, 7); d += 86_400_000) {
      const iso = new Date(d).toISOString().slice(0, 10)
      if (offered.has(iso)) expect(dayStanding(iso, c, filed, today)).toBe('OPEN')
    }
    expect(offered.has('2026-10-15')).toBe(true)
    expect(offered.has('2026-10-14')).toBe(false)
    expect(dayStanding('2026-11-03', c, filed, today)).toBe('FUTURE')
    expect(dayStanding('2026-08-02', c, filed, today)).toBe('BEFORE_START')
    expect(dayStanding('2027-01-01', { startDate: '2026-08-03', endDate: '2026-12-31' }, filed, '2027-02-01')).toBe('AFTER_END')
  })

  it('a week’s label reads as before: weekday, month and day', () => {
    const w = openWeeks({ startDate: '2026-10-25', endDate: null }, [], '2026-10-28')
    expect(w[0].label).toBe('Sun, Oct 25 – Wed, Oct 28')
  })
})

describe('a day is printed by a formatter built once, in the same words', () => {
  it('every day of two years reads the same as one formatted on its own', () => {
    const today = new Date('2026-11-02T00:00:00Z')
    for (let d = Date.UTC(2025, 0, 1); d <= Date.UTC(2026, 11, 31); d += 86_400_000 * 3) {
      const iso = new Date(d).toISOString().slice(0, 10)
      const at = new Date(`${iso}T00:00:00Z`)
      const other = at.getUTCFullYear() !== 2026
      expect(shortDay(iso, today)).toBe(at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC', ...(other ? { year: 'numeric' } : {}) }))
      expect(plainDate(iso)).toBe(at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))
    }
    expect(daySpan('2026-06-01', '2026-06-07')).toBe('Jun 1 – Jun 7, 2026')
    expect(daySpan('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027')
  })
})

describe('a matching run writes its matches at once', () => {
  const engine = () => read('src/lib/match-engine.ts')
  const write = () => engine().slice(engine().indexOf('// 6. Write Match records'), engine().indexOf('// 7. On a refresh'))

  it('a matching run writes its matches in two statements, never one per person', () => {
    expect(write()).not.toContain('prisma.match.upsert')
    expect(write()).toContain('prisma.match.createMany({')
    expect(write()).toContain('skipDuplicates: true')
    expect(write()).toContain('UPDATE "Match" AS m SET')
    expect(write()).not.toMatch(/for \(const \w+ of (matchResults|rows)\)/)
  })

  it('a match that was already there keeps its id, because the twin’s put-forward question rides on it: it is updated by its job and its person, never deleted and made again', () => {
    expect(write()).toContain('WHERE m."requirementId" = ${requirementId} AND m."consultantId" = v."consultantId"')
    expect(write()).not.toContain('deleteMany')
  })

  it('every row is written with the factors, basis, confidence and unknowns it was scored with, in the order scored', async () => {
    const { matchRowsFor } = await import('@/lib/match-engine')
    const at = new Date('2026-11-02T08:00:00.000Z')
    const scored = [
      { consultantId: 'c-icu', personId: 'p1', score: 91, confidence: 'HIGH' as const, factors: [{ label: 'ICU nursing', value: 1, weight: 0.5 }], basis: 'Four ICU placements in two years', unknowns: 'Night shifts not on record' },
      { consultantId: 'c-gmp', personId: 'p2', score: 74, confidence: 'MODERATE' as const, factors: [{ label: 'GMP validation', value: 0.8, weight: 0.4 }], basis: 'Two validation projects', unknowns: null },
    ]
    expect(matchRowsFor('req-1', scored as never, at)).toEqual([
      { requirementId: 'req-1', consultantId: 'c-icu', score: 91, confidence: 'HIGH', factors: scored[0].factors, basis: 'Four ICU placements in two years', unknowns: 'Night shifts not on record', computedAt: at },
      { requirementId: 'req-1', consultantId: 'c-gmp', score: 74, confidence: 'MODERATE', factors: scored[1].factors, basis: 'Two validation projects', unknowns: null, computedAt: at },
    ])
  })

  it('a person scored twice in one run is written once, with the later score, as one upsert after another left them', async () => {
    const { matchRowsFor } = await import('@/lib/match-engine')
    const at = new Date('2026-11-02T08:00:00.000Z')
    const row = (consultantId: string, score: number) => ({ consultantId, personId: consultantId, score, confidence: 'LOW' as const, factors: [], basis: 'b', unknowns: null })
    const rows = matchRowsFor('req-1', [row('a', 40), row('b', 60), row('a', 55)] as never, at)
    expect(rows.map((r) => [r.consultantId, r.score])).toEqual([['b', 60], ['a', 55]])
  })
})
