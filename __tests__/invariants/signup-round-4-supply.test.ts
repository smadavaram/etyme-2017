import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { PERMISSIONS } from '@/lib/permissions'
import { concentrationRefusal } from '@/lib/concentration'
import { sectionOfHref } from '@/lib/page-framing'
import { skillGap } from '@/lib/training'

/**
 * Sign-up walk, round four (docs/results/2026-10-08-signup-round-4.md),
 * supply's three: 8 (a refusal names the desk, and a client's in its own
 * words), 16 (Training says job requests, and three eyebrows follow the
 * menu) and its part of 21 (no count before an answer, nothing above a
 * refusal).
 *
 * Problem 2 — a Member reading Past contractors by URL — is closed by the
 * architect's one door in `lib/api-context`, not by a gate here.
 *
 * The page sentences are read at source, in the style of
 * alumni-head.test.ts: the behavior lives in client components with no
 * route handler to call.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

/** What ships: comments quote the old words on purpose. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function files(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files(full, found)
    else if (/\.tsx?$/.test(entry)) found.push(full)
  }
  return found
}

/** Supply's routes and pages, as `lib/domains` draws the boundary. */
const SUPPLY_DIRS = [
  'src/app/api/vendors', 'src/app/api/bench', 'src/app/api/consultants', 'src/app/api/rolloff',
  'src/app/api/alumni', 'src/app/api/training', 'src/app/api/releasing-soon', 'src/app/api/benchmark',
  'src/app/api/resumes', 'src/app/api/me',
  'src/app/dashboard/scorecards', 'src/app/dashboard/bench', 'src/app/dashboard/consultants',
  'src/app/dashboard/rolloff', 'src/app/dashboard/alumni', 'src/app/dashboard/training',
  'src/app/dashboard/my-work', 'src/app/dashboard/my-benches', 'src/app/dashboard/my-page',
  'src/app/dashboard/my-standing',
]

/** A string literal with a space in it is a sentence somebody reads. */
function sentencesNamingAKey(src: string): string[] {
  const literals = code(src).match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? []
  return literals.filter((l) => /\s/.test(l) && PERMISSIONS.some((p) => l.includes(p)))
}

describe('8 · a refusal names the desk, in the reader’s own words', () => {
  it('a seat refused the supplier register is told which desks read it at its firm, never "the vendors.read permission"', () => {
    const route = code(read('src/app/api/vendors/risk/route.ts'))
    expect(route).not.toContain('vendors.read permission')
    expect(route).toContain('askTheDesk({')
    expect(route).toContain("needs: 'vendors.read'")
  })

  it('a client refused the supplier share is told about what it buys and from how many suppliers, and who at the client reads it', () => {
    const says = concentrationRefusal(false, 'CLIENT', 'Northbend Athletic')
    expect(says).toContain('what you buy from your suppliers')
    expect(says).toContain('from how many of them')
    expect(says).toContain('Northbend Athletic')
    expect(says).toContain('Owner')
    expect(says).not.toMatch(/turned over|one client|profitability desk/)
    expect(says).not.toMatch(/margin\.read|pnl\.read/)
  })

  it('a supplier refused the shape of its book is told about its turnover and sent to its Finance desk', () => {
    const says = concentrationRefusal(true, 'VENDOR', 'Brightmoor Staffing')
    expect(says).toContain('turned over this year')
    expect(says).toContain('one client, one supplier or one person')
    expect(says).toContain('Finance')
    expect(says).not.toMatch(/margin\.read|pnl\.read/)
  })

  it('the concentration route decides who it is writing to before it refuses, so the refusal and the answer speak to the same reader', () => {
    const route = code(read('src/app/api/vendors/concentration/route.ts'))
    expect(route.indexOf('const sells')).toBeLessThan(route.indexOf("code: 'FORBIDDEN'"))
    expect(route).toContain('concentrationRefusal(sells,')
  })

  it('no route or page of the bench, the consultants, rolloff, training, past contractors or the supplier scorecards puts a permission key in a sentence', () => {
    const offenders: string[] = []
    for (const dir of SUPPLY_DIRS) {
      for (const f of files(join(process.cwd(), dir))) {
        for (const s of sentencesNamingAKey(readFileSync(f, 'utf8'))) {
          offenders.push(`${relative(process.cwd(), f).split(sep).join('/')}: ${s}`)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('16 · Training says job requests, and three eyebrows follow the menu', () => {
  it('Training’s first counter reads "Open job requests", and its link "View job requests"', () => {
    const page = code(read('src/app/dashboard/training/page.tsx'))
    expect(page).toContain('Open job requests')
    expect(page).toContain('View job requests')
    expect(page).not.toMatch(/Open requirements|View requirements/)
  })

  it('Training, Past contractors and Supplier scorecards take their eyebrow from the reader’s own menu and draw none while the session loads', () => {
    for (const [file, href, typed] of [
      ['src/app/dashboard/training/page.tsx', '/dashboard/training', null],
      ['src/app/dashboard/alumni/page.tsx', '/dashboard/alumni', 'Program'],
      ['src/app/dashboard/scorecards/page.tsx', '/dashboard/scorecards', 'Governance'],
    ] as const) {
      const page = code(read(file))
      expect(page, file).toContain(`usePageSection('${href}')`)
      expect(page, file).toContain('{section && <p className="eyebrow">{section}</p>}')
      if (typed) expect(page, file).not.toContain(`<p className="eyebrow">${typed}</p>`)
    }
  })

  it('the menu puts Past contractors under Workforce for a client and for a program office seated at one', () => {
    expect(sectionOfHref('CLIENT', '/dashboard/alumni')).toBe('Workforce')
    expect(sectionOfHref('MSP', '/dashboard/alumni', { seated: true, clientName: 'Cavanaugh Glassworks' } as any)).toBe('Workforce')
  })

  it('the menu puts Supplier scorecards under Supply for a program office, and Training under the supply section of a supplier and an integrator', () => {
    expect(sectionOfHref('MSP', '/dashboard/scorecards')).toBe('Supply')
    expect(sectionOfHref('VENDOR', '/dashboard/training')).toBe('Procure')
    expect(sectionOfHref('GSI', '/dashboard/training')).toBe('Supply')
  })
})

describe('21 · no count before an answer, and nothing above a refusal', () => {
  it('Past contractors draws no count until the first read returns, and a refusal draws its sentence alone', () => {
    const page = code(read('src/app/dashboard/alumni/page.tsx'))
    const stats = page.indexOf('Total alumni')
    const gate = page.lastIndexOf('{data && (<>', stats)
    expect(gate, 'the counters sit inside the branch that has data').toBeGreaterThan(-1)
    expect(page).toMatch(/\) : error \? \(\s*<p className="text-etyme-attention">\{error\}<\/p>/)
  })

  it('Training counts no open job requests it could not read, and shows a dash with the reason', () => {
    const page = code(read('src/app/dashboard/training/page.tsx'))
    expect(page).not.toContain("{ data: { requirements: [] } }")
    expect(page).toContain('useState<number | null>(null)')
    expect(page).toContain('{figure(totalReqs)}')
    expect(page).toContain('{reqsWhy && (')
  })

  it('the skill gap is not drawn when the job requests could not be read, rather than calling every person on the bench spare', () => {
    const g = skillGap(null, { people: [{ skills: ['Process validation'] }, { skills: ['ICU nursing'] }] })
    expect(g.rows).toEqual([])
    expect(g.skillsTracked).toBeNull()
    expect(g.inDeficit).toBeNull()
    expect(g.comparable).toBe(false)
    expect(g.people).toBe(2)
    expect(g.says).toContain('the job requests could not be read')
  })

  it('Training’s course count waits for the course list, and a refused list shows only its sentence', () => {
    const page = code(read('src/app/dashboard/training/page.tsx'))
    expect(page).toContain('setCoursesRead(true)')
    expect(page).toMatch(/if \(!coursesRead\) \{[\s\S]*?\{err\s*\?/)
  })

  it('Supplier scorecards states its window and its order only after the list has answered', () => {
    const page = code(read('src/app/dashboard/scorecards/page.tsx'))
    const line = page.indexOf('Last {Math.round(windowDays / 30)} months.')
    expect(page.lastIndexOf('{!loading && !error && (', line)).toBeGreaterThan(-1)
  })

  it('Consultants draws its counters only after the first read, and none above a refusal', () => {
    const page = code(read('src/app/dashboard/consultants/page.tsx'))
    expect(page).toContain('setCounted(true)')
    const total = page.indexOf('consultant records</p>')
    expect(page.lastIndexOf('{counted && !error && (', total)).toBeGreaterThan(-1)
  })

  it('Rolloff offers no window to choose above a refusal', () => {
    const page = code(read('src/app/dashboard/rolloff/page.tsx'))
    const selector = page.indexOf('{d} days')
    expect(page.lastIndexOf('{!error && (', selector)).toBeGreaterThan(-1)
  })

  it('the bench draws its counters only once its list has answered, and my-work waits before drawing anything', () => {
    const bench = code(read('src/app/dashboard/bench/page.tsx'))
    expect(bench).toContain("{scope !== 'payroll' && !loading && entries.length > 0 && (")
    expect(bench).toContain('{summary && !loading && (')
    const mine = code(read('src/app/dashboard/my-work/page.tsx'))
    expect(mine).toContain('if (loading) return')
    expect(mine).toContain('if (error) return')
  })
})
