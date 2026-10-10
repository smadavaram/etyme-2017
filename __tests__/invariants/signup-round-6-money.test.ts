import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DOMAINS, domainOf } from '@/lib/domains'
import { notAtACompany } from '@/app/api/people/not-at-a-company'

/**
 * Round six of the sign-up walk, 2026-10-08, on money's side. Two
 * things demand's a7b856abd left in money's files: a candidate signed
 * up on her own read "No company context" on four money routes, and
 * `/api/timesheets` now marks a rate withheld from its reader, which any
 * money reader of that route must read as withheld, never as zero or
 * "not recorded".
 */

const ROOT = process.cwd()
const src = (p: string) => readFileSync(join(ROOT, 'src', p), 'utf8')

/** Every source file in money's boundary, walked from the domain map. */
function moneyFiles(): string[] {
  const money = DOMAINS.find((d) => d.key === 'MONEY')!
  const out = new Set<string>()
  const walk = (abs: string) => {
    if (statSync(abs).isDirectory()) {
      for (const f of readdirSync(abs)) walk(join(abs, f))
    } else if (/\.(ts|tsx)$/.test(abs)) {
      const rel = relative(join(ROOT, 'src'), abs)
      if (domainOf(rel)?.key === 'MONEY') out.add(rel)
    }
  }
  for (const needle of money.owns) {
    for (const cand of [needle, `${needle}.ts`, `${needle}.tsx`]) {
      const abs = join(ROOT, 'src', cand)
      if (existsSync(abs)) walk(abs)
    }
  }
  return [...out].sort()
}

const SYSTEM_PHRASES = [
  'No company context',
  'You must belong to a company',
  'Active context must be associated with a company',
]

describe('somebody signed in at no company reads whose page a money route is, not a system phrase', () => {
  it('the sentence names the page and says where her own work is', () => {
    expect(notAtACompany('Rate history')).toBe(
      'Rate history belongs to a company, and you are not signed in at one. Your own work is under Your work.'
    )
  })

  const SITES: Array<[string, string]> = [
    ['app/api/rate-history/route.ts', 'Rate history'],
    ['app/api/payroll/run/route.ts', 'Payroll'],
    ['app/api/expenses/route.ts', 'The expense book'],
    ['app/api/contracts/route.ts', 'The list of buy contracts'],
    ['app/api/contracts/route.ts', 'The list of contracts'],
  ]
  for (const [file, what] of SITES) {
    it(`${file} tells somebody with no company that ${what.toLowerCase()} belongs to a company and where her own work is`, () => {
      expect(src(file)).toContain(`notAtACompany('${what}')`)
    })
  }

  const files = moneyFiles()
  it('the sweep reads money’s own routes, so a phrase cannot hide in a file it never opened', () => {
    expect(files).toContain('app/api/contracts/route.ts')
    expect(files).toContain('app/api/payroll/run/route.ts')
    expect(files.length).toBeGreaterThan(50)
  })

  it('no file in money’s boundary says "No company context" or another system phrase to a caller', () => {
    const offenders = files.filter((f) => {
      const text = src(f)
      return SYSTEM_PHRASES.some((p) => text.includes(`'${p}`) || text.includes(`"${p}`) || text.includes(`\`${p}`))
    })
    expect(offenders).toEqual([])
  })
})

describe('a rate withheld from the reader of the timesheets list is read as withheld, never as missing', () => {
  it('the timesheets route marks a withheld rate beside its null figure', () => {
    expect(src('app/api/timesheets/route.ts')).toMatch(/cents: null[^}]*withheld: true/)
  })

  it('every reader of the timesheets list in money’s boundary reads the withheld mark, so a withheld rate is never shown as $0 or "not recorded"', () => {
    const readers = moneyFiles().filter((f) => src(f).includes('/api/timesheets'))
    const blind = readers.filter((f) => !src(f).includes('withheld'))
    expect(blind).toEqual([])
  })

  it('no money page tells a reader a rate is "not recorded"', () => {
    const says = moneyFiles().filter((f) => f.startsWith('app/dashboard/') && /['"`]Not recorded|rate[^'"`\n]{0,20}not recorded/i.test(src(f)))
    expect(says).toEqual([])
  })
})
