import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asksPayroll, CLIENT_NO_PAYROLL, packSentence, joinedSentence } from '@/lib/setup-steps'
import { packFor, rolesFor, MEMBER_ROLE, REVOKED_SINCE } from '@/lib/company-defaults'
import { consoleHome, readsOnlyOwnWork } from '@/lib/console-home'
import { isDeskless } from '@/lib/nav-table'
import { dashboardReads } from '@/lib/dashboard-reads'
import { DEFAULT_CYCLE_SHIFT, SHIFT_WORDS } from '@/lib/cycle-shift'

/**
 * Round three of the sign-up walk (docs/results/2026-10-08-signup-round-3.md),
 * the platform's problems: 1, 2, 3 (in password-door.test), 5 (the role),
 * 12, 14, 15 and 16, and the loading guess in useCompanyKind.
 */

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('setup asks each kind of company only what it will use (items 1 and 2)', () => {
  it('a client is not asked its pay period or pay days, and is told in one line why there is nothing more to answer', () => {
    expect(asksPayroll('CLIENT')).toBe(false)
    expect(CLIENT_NO_PAYROLL).toBe('There is no payroll to set up. Your suppliers pay their own people, and you pay their bills.')
    const page = src('src/app/(auth)/start/page.tsx')
    expect(page).toContain('{asksPayroll(kind)')
    expect(page).toContain('<WeekPanel canEdit />')
    expect(page).toContain('{CLIENT_NO_PAYROLL}')
  })

  it('every kind that pays somebody is still asked its payroll', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP']) expect(asksPayroll(kind), kind).toBe(true)
  })

  it('a client reads its pack with its hours and no pay rhythm', () => {
    expect(packSentence(packFor('CLIENT', 'US'), 'CLIENT')).toBe('Your dates follow the US pack: weekly hours.')
    expect(packSentence(packFor('VENDOR', 'US'), 'VENDOR')).toBe('Your dates follow the US pack: weekly hours, pay every other week.')
  })

  it('the payroll panel in setup says where a pay day on a day off goes, rather than pointing at a section setup does not have', () => {
    const panel = src('src/components/settings/payroll-panel.tsx')
    expect(panel).toContain('shiftSection = true')
    expect(panel).toContain('SHIFT_WORDS[DEFAULT_CYCLE_SHIFT.pay].label.toLowerCase()')
    expect(`moves to ${SHIFT_WORDS[DEFAULT_CYCLE_SHIFT.pay].label.toLowerCase()}`).toBe('moves to the working day before')
    expect(src('src/app/(auth)/start/page.tsx')).toContain('<PayrollPanel canEdit shiftSection={false} />')
  })
})

describe('a colleague seated as Member reads only their own work (item 5)', () => {
  it('Member holds no permission at all, at every kind of company', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const) {
      const member = rolesFor(kind).find((r) => r.name === MEMBER_ROLE)!
      expect(member.permissions, kind).toEqual([])
      expect(readsOnlyOwnWork(member.permissions), kind).toBe(true)
      expect(isDeskless(member.permissions), kind).toBe(true)
    }
  })

  it('a Member seat formed before today loses the two firm-wide reads, and a Member role somebody edited keeps what they gave it', () => {
    expect(REVOKED_SINCE).toEqual([{ role: MEMBER_ROLE, was: ['assignments.read', 'timesheets.read'], now: [] }])
    const roles = src('src/lib/company-roles.ts')
    expect(roles).toContain('role.permissions.length === fix.was.length && fix.was.every((p) => role.permissions.includes(p))')
    // A colleague arriving at an older company is seated on the corrected role.
    expect(src('src/lib/seat-member.ts')).toMatch(/await ensureDefaultRoles\(companyId, company\?\.kind \?\? 'VENDOR'\)\n\s*const role = /)
  })

  it('a seat with no desk yet opens on its own work, at a client as much as at a supplier', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP'] as const) {
      expect(consoleHome({ kind, permissions: [] }).href, kind).toBe('/dashboard/my-work')
    }
    // Not known yet is not "no desk".
    expect(isDeskless(null)).toBe(false)
    expect(isDeskless(undefined)).toBe(false)
  })
})

describe('an empty firm reads a sentence, not a zero (item 12)', () => {
  it('the pipeline, contracts and bench tiles say there is nothing yet, in words', () => {
    const page = src('src/app/dashboard/page.tsx')
    expect(page).toContain("'Nothing is billing yet, so there is no monthly revenue to show.'")
    expect(page).toContain("'No contracts yet. One appears when a client awards you a person.'")
    expect(page).toContain("'Nobody on the bench yet.'")
  })
})

describe('System activity says what a new company is, never the picker label (item 14)', () => {
  it('a new program office joined Etyme as a program office', () => {
    expect(joinedSentence('Keel Program Office', 'MSP')).toBe('Keel Program Office joined Etyme as a program office')
  })

  it('every kind reads as a noun, and a supplier says how it sells', () => {
    expect(joinedSentence('Walk Co', 'CLIENT')).toBe('Walk Co joined Etyme as a client')
    expect(joinedSentence('Tern', 'GSI')).toBe('Tern joined Etyme as an integrator')
    expect(joinedSentence('Brookfield', 'VENDOR', 'PRIME')).toBe('Brookfield joined Etyme as a supplier that sells to clients directly')
    expect(joinedSentence('Pellwright', 'VENDOR', 'BENCH')).toBe('Pellwright joined Etyme as a supplier that sells through other suppliers')
    expect(joinedSentence('Ana Byrne LLC', 'CONSULTANT_CORP')).toBe('Ana Byrne LLC joined Etyme as a one-person company')
  })

  it('both doors that make a company write the sentence through the one helper', () => {
    for (const f of ['src/lib/password-door.ts', 'src/app/api/onboarding/route.ts']) {
      expect(src(f), f).toContain('summary: joinedSentence(')
      expect(src(f), f).not.toContain('joined Etyme as ${type.label')
    }
  })
})

describe('a program office lands on its own desk, not a supplier’s sales desk (item 15)', () => {
  it('a program office is never asked for the submissions target, pipeline revenue or the bench, whatever its seat holds', () => {
    expect(dashboardReads(['*'], 'MSP')).toEqual({ bench: false, automation: true, target: false, pipeline: false })
  })

  it('without a program it reads that it has none in sentences, its decisions and its activity, and no figure', () => {
    const page = src('src/app/dashboard/page.tsx')
    expect(page).toContain("if (kind === 'MSP') return <ProgramOfficeWithoutProgram")
    const desk = page.slice(page.indexOf('function ProgramOfficeWithoutProgram'), page.indexOf('function StatCard'))
    expect(desk).toContain('No program yet')
    expect(desk).not.toMatch(/StatCard|TheBar|monthlyRevenue|pipeline|\bbench\b|toLocaleString/i)
  })

  it('with a seat at a client it opens on that client’s program', () => {
    expect(consoleHome({ kind: 'MSP', seated: true, permissions: ['*'] }).href).toBe('/dashboard/program')
  })
})

describe('no page guesses who is reading while the session loads (item 16)', () => {
  it('Contacts passes the kind only once it is known, and draws no eyebrow or subtitle until then', () => {
    const page = src('src/app/dashboard/contacts/page.tsx')
    expect(page).not.toContain("?? 'VENDOR'")
    expect(page).toContain('{eyebrow && <p className="eyebrow">{eyebrow}</p>}')
    expect(page).toContain('{readerKind && (')
  })

  it('useCompanyKind is null while the session loads, never a supplier', () => {
    const provider = src('src/components/session-provider.tsx')
    expect(provider).toContain('export function useCompanyKind(): CompanyKind | null')
    expect(provider).toContain('return company?.kind ?? null')
  })

  it('Companies, Check queue, Automation and Integrations head with their menu’s section, never a typed "Operate"', () => {
    for (const f of ['companies', 'checks', 'automation', 'integrations']) {
      const page = src(`src/app/dashboard/${f}/page.tsx`)
      expect(page, f).not.toContain('<p className="eyebrow">Operate</p>')
      expect(page, f).toContain(`usePageSection('/dashboard/${f}')`)
    }
  })
})
