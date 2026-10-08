import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  recordStep, isFinished, nextStep, outstanding, reminderFor, showsSteps,
  countryGuessSentence, packSentence, currencyFor, COUNTRIES, deskPageFor, DESK_PAGES,
  stepsFor, railFor, stepLabel, claimedSentence, SETUP_RAIL,
  type SetupRecord,
} from '@/lib/setup-steps'
import { rolesFor, countryFromDomain, packFor, MEMBER_ROLE, payRhythmForPack } from '@/lib/company-defaults'
import { deskHome } from '@/components/desk-home'
import { getNavForKind } from '@/lib/nav-table'
import { readsOnlyOwnWork } from '@/lib/console-home'

/**
 * Setup asks five things, then stops. Decided by the founder, 2026-10-07.
 */

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const NOW = new Date('2026-10-07T15:00:00Z')
const KINDS = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const

describe('setup asks five things, then stops', () => {
  it('a new company is created the same way from first sign-in and from Add company: same pack, roles, location and holidays', () => {
    const create = src('src/lib/company-create.ts')
    const firstSignIn = src('src/app/api/onboarding/route.ts')
    const addCompany = src('src/app/api/companies/route.ts')
    expect(firstSignIn).toContain('await createCompany(')
    expect(addCompany).toContain('await createCompany(')
    // Neither door makes a company, a role, a head office or a holiday of its own.
    for (const door of [firstSignIn, addCompany]) {
      expect(door).not.toMatch(/\.company\.create\(/)
      expect(door).not.toMatch(/\.role\.create\(/)
      expect(door).not.toMatch(/companyLocation\.create\(/)
      expect(door).not.toMatch(/holiday\.createMany\(/)
    }
    // The hard-coded seven, "Accountant" among them, are gone.
    expect(addCompany).not.toContain('const DEFAULT_ROLES')
    expect(addCompany).not.toContain("'Accountant'")
    for (const piece of ['packFor(input.kind, country)', 'rolesFor(input.kind)', 'companyLocation.create', 'holidaysFor(country, y)']) {
      expect(create, piece).toContain(piece)
    }
  })

  it('setup guesses the country from the web address and says it is a guess', () => {
    expect(countryFromDomain('acme.co.uk')).toBe('GB')
    expect(countryGuessSentence('GB', 'acme.co.uk')).toBe('We guessed United Kingdom from your web address. Change it if that is wrong.')
    expect(countryGuessSentence('US', 'acme.com')).toBe('We guessed United States from your web address. Change it if that is wrong.')
    // A personal address guesses nothing, and says so.
    expect(countryGuessSentence('US', null)).toContain('A personal email does not say where you are')
    // Every country the guess can produce is one setup offers, with its currency.
    for (const d of ['a.in', 'a.co.uk', 'a.ca', 'a.au', 'a.de', 'a.ie', 'a.sg', 'a.com']) {
      expect(COUNTRIES.map((c) => c.code)).toContain(countryFromDomain(d))
    }
    expect(currencyFor('IN')).toBe('INR')
    expect(currencyFor('GB')).toBe('GBP')
    expect(currencyFor('ZZ')).toBe('USD')
  })

  it('the pack follows the country and the type, and setup says which in one line read off the pack itself', () => {
    // The rhythm said once (regulatory, round one of the sign-up walk).
    expect(packSentence(packFor('VENDOR', 'US'))).toBe('Your dates follow the US pack: weekly hours, pay every other week.')
    expect(packSentence(packFor('CLIENT', 'IN'))).toBe('Your dates follow the India pack: monthly hours, pay monthly.')
    expect(packSentence(packFor('GSI', 'US'))).toBe('Your dates follow the US pack: weekly hours, pay every other week.')
    // A monthly pack's payroll panel shows monthly, and changes no date.
    expect(payRhythmForPack('IN_DELIVERY')).toEqual({ payPeriod: 'MONTHLY', payDaysOfMonth: [28], payCalcDaysBefore: 3 })
    expect(payRhythmForPack('US_IT')).toBeNull()
  })

  it('a company may click through setup in five steps taking every default, and each answer is recorded with who and when', () => {
    let r: SetupRecord = { COMPANY: { outcome: 'DONE', byId: 'p1', at: NOW.toISOString() } }
    expect(nextStep(r)).toBe('WORK')
    for (const [step, outcome] of [['WORK', 'DONE'], ['PEOPLE', 'SKIPPED'], ['TEAM', 'SKIPPED']] as const) {
      const v = recordStep(r, step, outcome, 'p1', NOW)
      expect(v.ok, step).toBe(true)
      if (v.ok) r = v.record
    }
    expect(isFinished(r)).toBe(true)
    expect(nextStep(r)).toBeNull()
    expect(r.WORK).toEqual({ outcome: 'DONE', byId: 'p1', at: '2026-10-07T15:00:00.000Z' })
    expect(r.TEAM).toEqual({ outcome: 'SKIPPED', byId: 'p1', at: '2026-10-07T15:00:00.000Z' })
  })

  it('only your people and your team may be skipped, and a refusal says what to do instead', () => {
    const work = recordStep({}, 'WORK', 'SKIPPED', 'p1', NOW)
    expect(work).toEqual({ ok: false, message: expect.stringContaining('the defaults are already filled in. Press Continue') })
    expect(recordStep({}, 'COMPANY', 'SKIPPED', 'p1', NOW).ok).toBe(false)
    expect(recordStep({}, 'BILLING', 'DONE', 'p1', NOW).ok).toBe(false)
  })

  it('a company that skips its people and its team is reminded on the dashboard, once, with a link back', () => {
    const r: SetupRecord = {
      COMPANY: { outcome: 'DONE', byId: 'p1', at: NOW.toISOString() },
      WORK: { outcome: 'DONE', byId: 'p1', at: NOW.toISOString() },
      PEOPLE: { outcome: 'SKIPPED', byId: 'p1', at: NOW.toISOString() },
      TEAM: { outcome: 'SKIPPED', byId: 'p1', at: NOW.toISOString() },
    }
    const none = { peopleImported: false, teammates: 0 }
    expect(reminderFor({ startedAt: NOW, record: r, facts: none })).toEqual({
      says: 'Finish setting up: your people, your team.',
      href: '/start?finish=1',
    })
    // Done another way — an import committed, a teammate invited — counts.
    expect(reminderFor({ startedAt: NOW, record: r, facts: { peopleImported: true, teammates: 0 } })!.says)
      .toBe('Finish setting up: your team.')
    expect(reminderFor({ startedAt: NOW, record: r, facts: { peopleImported: true, teammates: 2 } })).toBeNull()
    // A company formed before the steps existed is never reminded.
    expect(reminderFor({ startedAt: null, record: {}, facts: none })).toBeNull()
    // Drawn on the consoles only, from one component in the layout.
    expect(src('src/app/dashboard/layout.tsx')).toContain('<SetupReminder />')
    expect(src('src/components/setup-reminder.tsx')).toContain("new Set(['/dashboard', '/dashboard/program', '/dashboard/my-work'])")
  })

  it('a company that finished setup never sees the steps again', () => {
    const base = { startedAt: NOW, mayRun: true, owed: 2 }
    expect(showsSteps({ ...base, finishedAt: null, followedLinkBack: false })).toBe(true)
    expect(showsSteps({ ...base, finishedAt: NOW, followedLinkBack: false })).toBe(false)
    // Only on purpose, from the reminder's link, and only while something is owed.
    expect(showsSteps({ ...base, finishedAt: NOW, followedLinkBack: true })).toBe(true)
    expect(showsSteps({ ...base, finishedAt: NOW, followedLinkBack: true, owed: 0 })).toBe(false)
    // Never to a seat that cannot change the company's setup, never to a company that never began.
    expect(showsSteps({ ...base, finishedAt: null, followedLinkBack: false, mayRun: false })).toBe(false)
    expect(showsSteps({ ...base, startedAt: null, finishedAt: null, followedLinkBack: false })).toBe(false)
    expect(outstanding({}, { peopleImported: false, teammates: 0 })).toEqual(['COMPANY', 'WORK', 'PEOPLE', 'TEAM'])
  })

  it('a colleague joining on a claimed domain gets a seat with the Member role, and Member reads only their own work', () => {
    for (const kind of KINDS) {
      const member = rolesFor(kind).find((r) => r.name === MEMBER_ROLE)
      expect(member, kind).toBeTruthy()
      expect(readsOnlyOwnWork(member!.permissions)).toBe(true)
    }
    // One way to seat a colleague, shared by the domain door and the
    // password door (2026-10-08): lib/seat-member.
    const seat = src('src/lib/seat-member.ts')
    expect(seat).toContain('async function seatAsMember(')
    expect(seat).toContain('void tellOwnerSomebodyJoined(companyId, personId, MEMBER_ROLE)')
    for (const door of ['src/app/api/onboarding/route.ts', 'src/lib/password-door.ts']) {
      const route = src(door)
      expect(route, door).toContain("import { seatAsMember } from '@/lib/seat-member'")
      // Every join path seats as Member; none creates a seat with no role.
      expect(route, door).not.toMatch(/type: 'EMPLOYEE', companyId: (decision|entry)\.companyId \}/)
    }
  })

  it('a colleague with a role lands on their own desk', () => {
    const at = (kind: (typeof KINDS)[number], role: string) => {
      const seed = rolesFor(kind).find((r) => r.name === role)!
      return deskHome({ kind, isConsultant: false, role, permissions: seed.permissions })
    }
    expect(at('VENDOR', 'Recruiter')).toBe('/dashboard/requirements')
    expect(at('VENDOR', 'AP & Payroll')).toBe('/dashboard/payroll')
    expect(at('VENDOR', 'Accounts Receivable')).toBe('/dashboard/ar')
    expect(at('CLIENT', 'AP Clerk')).toBe('/dashboard/ap')
    expect(at('CLIENT', 'Procurement Lead')).toBe('/dashboard/suppliers')
    // Never a page the seat's own menu does not offer, for any role at any kind.
    for (const kind of KINDS) {
      for (const role of rolesFor(kind)) {
        const href = deskHome({ kind, isConsultant: false, role: role.name, permissions: role.permissions })
        const menu = getNavForKind(kind, false, { permissions: role.permissions }).flatMap((s) => s.items).map((i) => i.href)
        const consoles = ['/dashboard', '/dashboard/program', '/dashboard/my-work']
        expect(menu.includes(href) || consoles.includes(href), `${kind} ${role.name} → ${href}`).toBe(true)
      }
    }
    // A role with no page of its own opens on the console.
    expect(deskPageFor('Owner', ['/dashboard/requirements'], '/dashboard')).toBe('/dashboard')
    expect(Object.keys(DESK_PAGES)).not.toContain('Owner')
  })

  it('the settings page and setup draw the week and payroll from one component', () => {
    const settings = src('src/app/dashboard/settings/page.tsx')
    const setup = src('src/app/(auth)/start/page.tsx')
    for (const page of [settings, setup]) {
      expect(page).toContain("import { WeekPanel } from '@/components/settings/week-panel'")
      expect(page).toContain("import { PayrollPanel } from '@/components/settings/payroll-panel'")
    }
    expect(settings).not.toContain('function WeekPanel(')
    expect(settings).not.toContain('function PayrollPanel(')
    // The note about twice a month stays on the payroll panel.
    expect(src('src/components/settings/payroll-panel.tsx')).toContain('{STATE_PAY_NOTE}')
  })

  it('the setup page shows the prototype’s five steps in order and words', () => {
    const setup = src('src/app/(auth)/start/page.tsx')
    expect(setup).toContain('railFor(kind)')
    expect(railFor('VENDOR')).toEqual(SETUP_RAIL)
    for (const words of ['Your company', 'How you work', 'Your people', 'Your team', 'Skip for now',
      'A system of record with none of your records is a demo.']) {
      expect(setup, words).toContain(words)
    }
  })
})

describe('setup after round two of the sign-up walk', () => {
  const by = 'person-1'
  it('a one-person firm\'s setup is three steps and never asks for a contractor list or a team', () => {
    expect(stepsFor('CONSULTANT_CORP')).toEqual(['COMPANY', 'WORK'])
    expect(railFor('CONSULTANT_CORP').map((s) => s.label)).toEqual(['Sign in', 'Your company', 'How you work'])
    expect(stepLabel('WORK', 'CONSULTANT_CORP')).toBe('Step 3 of 3')
    expect(stepLabel('WORK', 'VENDOR')).toBe('Step 3 of 5')

    // Her two steps finish setup, and nothing is owed or reminded after them.
    let record: SetupRecord = {}
    for (const step of ['COMPANY', 'WORK']) {
      const v = recordStep(record, step, 'DONE', by, NOW, 'CONSULTANT_CORP')
      if (!v.ok) throw new Error(v.message)
      record = v.record
      if (step === 'WORK') expect(v.finished).toBe(true)
    }
    expect(nextStep(record, 'CONSULTANT_CORP')).toBeNull()
    const facts = { peopleImported: false, teammates: 0 }
    expect(outstanding(record, facts, 'CONSULTANT_CORP')).toEqual([])
    expect(reminderFor({ startedAt: NOW, record, facts, kind: 'CONSULTANT_CORP' })).toBeNull()
    // The same record at a staffing firm still owes its people and its team.
    expect(reminderFor({ startedAt: NOW, record, facts, kind: 'VENDOR' })?.says).toBe('Finish setting up: your people, your team.')
    // Asked for a list anyway, it says why not.
    expect(recordStep(record, 'PEOPLE', 'SKIPPED', by, NOW, 'CONSULTANT_CORP'))
      .toEqual({ ok: false, message: 'A one-person firm has no contractor list or team to set up.' })

    // The page says nothing about colleagues to her, and draws no list or team step.
    const page = src('src/app/(auth)/start/page.tsx')
    expect(page).toContain("{!solo && ' Colleagues join by invitation")
    expect(page).toContain("{step === 'PEOPLE' && !solo && (")
    expect(page).toContain("{step === 'TEAM' && !solo && (")
    expect(page).not.toMatch(/Step \d of 5/)
  })

  it('a password sign-up for a one-person firm names the firm on its owner\'s profile', () => {
    const create = src('src/lib/company-create.ts')
    expect(create).toMatch(/company\.kind === 'CONSULTANT_CORP'[\s\S]{0,200}consultantProfile\.upsert[\s\S]{0,200}ownCompanyId: company\.id/)
  })

  it('a supplier that took its record from an invitation opens setup at how it works, with its client named', () => {
    expect(claimedSentence('Northbend Athletic')).toBe('Northbend Athletic is your client. Next: your week and payroll.')
    const state = src('src/lib/setup-state.ts')
    expect(state).toContain('export async function beginClaimedSetup(')
    expect(state).toContain("recordStep(readRecord(c.setupSteps), 'COMPANY', 'DONE', personId, now)")
    expect(state).toContain('c.isDemo')
    expect(src('src/app/api/onboarding/route.ts')).toContain('await beginClaimedSetup(')
    expect(src('src/app/(auth)/start/page.tsx')).toContain('{setup.claimedSays &&')
    expect(src('src/app/(auth)/verify/[token]/page.tsx')).toContain("b.data.already === false ? '/start'")
  })
})
