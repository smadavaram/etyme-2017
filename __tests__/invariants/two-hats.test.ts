import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  getNavForKind, hatsFor, offersYouHat, defaultHat, hatOf, hatForPath, readHatCookie, hatCookieValue,
  HAT_COOKIE, type NavSection,
} from '@/lib/nav-table'
import { plusMenuFor, reachablePagesFor } from '@/components/shell/header'
import { hatsForSession } from '@/components/shell/hat-list'
import { seatLinesFrom, type SessionState } from '@/components/session-provider'

/**
 * One person, two hats, switched in the account menu — the founder,
 * 2026-11-03, on Tapin's Owner seat reading the firm's links and then
 * "YOU" with five more underneath: "company user and individual can be
 * switched on the top right menu", and "You can go under profile and
 * they switch to worker account."
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const labels = (nav: readonly NavSection[]) => nav.map((s) => s.label)
const hrefs = (nav: readonly NavSection[]) => nav.flatMap((s) => s.items.map((i) => i.href))
const OWN_PAGES = ['/dashboard/my-work', '/dashboard/my-page', '/dashboard/my-benches', '/dashboard/my-work/paperwork']
const KARTHIK = ['assignments.read', 'timesheets.read']

const seats = [
  { contextId: 'c1', type: 'EMPLOYEE', companyName: 'Tapin', roleName: 'Owner' },
  { contextId: 'c2', type: 'EMPLOYEE', companyName: 'Brightmoor Staffing', roleName: 'Recruiter' },
]

describe('the menu shows one hat at a time', () => {
  for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT'] as const) {
    it(`a worker at ${kind} reads the firm's links and none of their own pages in the firm hat`, () => {
      const firm = getNavForKind(kind, false, { worker: true, permissions: ['*'], hat: 'firm' })
      expect(labels(firm)).not.toContain('You')
      for (const own of OWN_PAGES) expect(hrefs(firm), own).not.toContain(own)
    })

    it(`a worker at ${kind} reads their own five pages and none of the firm's links in the You hat`, () => {
      const own = getNavForKind(kind, false, { worker: true, permissions: ['*'], hat: 'you' })
      expect(labels(own)).toEqual(['Ask Etyme', 'You'])
      expect(own[1].items.map((i) => i.label)).toEqual(['Your work', 'Your page', 'Who has you', 'Your data', 'Your paperwork'])
    })
  }

  it('the You hat is never worn by somebody the work is not about, whatever the device remembers', () => {
    const owner = getNavForKind('VENDOR', false, { worker: false, permissions: ['*'], hat: 'you' })
    expect(labels(owner)).toContain('Jobs')
    expect(labels(owner)).not.toContain('You')
  })
})

describe('who is offered which hats', () => {
  it('an Owner on no placement is offered no You hat', () => {
    expect(offersYouHat('VENDOR', false, { worker: false, permissions: ['*'] })).toBe(false)
    const lines = hatsFor({ seats: [seats[0]], activeContextId: 'c1', personName: 'Sharath Madavaram', isConsultant: false, youOffered: false, hat: 'firm' })
    expect(lines.map((l) => l.label)).toEqual(['Tapin · Owner'])
  })

  it('an Owner who is also placed is offered "You" with their first name, after the firm seat', () => {
    const lines = hatsFor({ seats: [seats[0]], activeContextId: 'c1', personName: 'Sharath Madavaram', isConsultant: false, youOffered: true, hat: 'firm' })
    expect(lines.map((l) => l.label)).toEqual(['Tapin · Owner', 'You · Sharath'])
  })

  it('a one-person firm has one hat, because she is the firm, and reads her own pages inside her own menu', () => {
    expect(offersYouHat('CONSULTANT_CORP', false, { worker: true, permissions: ['*'] })).toBe(false)
    const solo = getNavForKind('CONSULTANT_CORP', false, { worker: true, permissions: ['*'], hat: 'you' })
    expect(labels(solo)).toEqual(['Ask Etyme', 'Your work', 'Timesheets', 'Bills', 'Contracts', 'Paperwork', 'Settings'])
    const lines = hatsFor({
      seats: [{ contextId: 's1', type: 'EMPLOYEE', companyName: 'Byrne Critical Care LLC', roleName: 'Owner' }],
      activeContextId: 's1', personName: 'Colleen Byrne', isConsultant: false, youOffered: false, hat: 'firm',
    })
    expect(lines).toHaveLength(1)
  })

  it('the account menu drawn for a one-person firm offers no You hat', () => {
    // Colleen Byrne as /api/me lists her: the Owner's seat at her own
    // firm, and the consultant seat at Halcyon that her bench listing
    // gives her. The fourth screen walk found "You · Colleen" drawn from
    // the second, where the sentence above was handed only the first.
    const contexts = [
      { id: 's1', type: 'EMPLOYEE', company: { id: 'byrne', name: 'Byrne Critical Care LLC', kind: 'CONSULTANT_CORP' }, role: { id: 'r1', name: 'Owner', permissions: ['*'] } },
      { id: 's2', type: 'CONSULTANT', company: { id: 'halcyon', name: 'Halcyon Talent', kind: 'VENDOR' }, role: null },
    ]
    const session = {
      person: { id: 'p1', name: 'Colleen Byrne' },
      company: { id: 'byrne', name: 'Byrne Critical Care LLC', kind: 'CONSULTANT_CORP' },
      contextType: 'EMPLOYEE', roleName: 'Owner', permissions: ['*'],
      isWorker: true, seat: null, isDemo: false, termsHref: null, filesAWeek: true, region: null,
      seats: seatLinesFrom(contexts), activeContextId: 's1', hat: 'firm',
      loading: false, error: null,
    } as unknown as SessionState
    expect(hatsForSession(session).map((l) => l.label)).toEqual(['Byrne Critical Care LLC · Owner'])
  })

  it('the account menu lists every seat the person holds, each as the company and the role', () => {
    const lines = hatsFor({ seats, activeContextId: 'c1', personName: 'Sharath Madavaram', isConsultant: false, youOffered: true, hat: 'firm' })
    expect(lines.map((l) => l.label)).toEqual(['Tapin · Owner', 'Brightmoor Staffing · Recruiter', 'You · Sharath'])
    expect(lines.map((l) => l.contextId)).toEqual(['c1', 'c2', 'c1'])
  })

  it('marks exactly one line as the hat being worn', () => {
    const firm = hatsFor({ seats, activeContextId: 'c2', personName: 'Sharath', isConsultant: false, youOffered: true, hat: 'firm' })
    expect(firm.filter((l) => l.current).map((l) => l.label)).toEqual(['Brightmoor Staffing · Recruiter'])
    const you = hatsFor({ seats, activeContextId: 'c2', personName: 'Sharath', isConsultant: false, youOffered: true, hat: 'you' })
    expect(you.filter((l) => l.current).map((l) => l.label)).toEqual(['You · Sharath'])
  })

  it('a consultant seat is the person’s own hat, never listed as a firm', () => {
    const lines = hatsFor({
      seats: [{ contextId: 'k1', type: 'CONSULTANT', companyName: 'Brightmoor Staffing', roleName: null }, seats[0]],
      activeContextId: 'k1', personName: 'Ravi Kumar', isConsultant: true, youOffered: false, hat: 'firm',
    })
    expect(lines.map((l) => [l.label, l.current])).toEqual([['Tapin · Owner', false], ['You · Ravi', true]])
  })
})

describe('the hat follows the page, and is remembered on the device', () => {
  const worker = { worker: true, permissions: ['*'] as string[] }

  it('a link from a notice into a worker’s own page opens the You hat', () => {
    expect(hatForPath('GSI', false, { ...worker, hat: 'firm' }, '/dashboard/my-work/paperwork')).toBe('you')
  })

  it('a page only the firm’s menu holds opens the firm hat', () => {
    expect(hatForPath('GSI', false, { ...worker, hat: 'you' }, '/dashboard/timesheets')).toBe('firm')
  })

  it('a page on both menus, or on neither, keeps the hat the person had on', () => {
    expect(hatForPath('GSI', false, { ...worker, hat: 'you' }, '/dashboard/conversations/etyme')).toBe('you')
    expect(hatForPath('GSI', false, { ...worker, hat: 'firm' }, '/dashboard/conversations/etyme')).toBe('firm')
    expect(hatForPath('GSI', false, { ...worker, hat: 'you' }, '/dashboard/my-data')).toBe('you')
    expect(hatForPath('GSI', false, { ...worker, hat: 'firm' }, '/dashboard/my-data')).toBe('firm')
    expect(hatForPath('GSI', false, { ...worker, hat: 'firm' }, '/dashboard/placements/abc')).toBe('firm')
  })

  it('a worker whose seat holds no desk opens in their own hat, because the firm hat holds only what is addressed to them', () => {
    expect(defaultHat('GSI', false, { worker: true, permissions: KARTHIK })).toBe('you')
    expect(labels(getNavForKind('GSI', false, { worker: true, permissions: KARTHIK }))).toEqual(['Ask Etyme', 'You'])
    expect(defaultHat('GSI', false, { worker: true, permissions: ['*'] })).toBe('firm')
    expect(hatOf('GSI', false, { worker: true, permissions: ['*'] })).toBe('firm')
  })

  it('the remembered hat names a seat only in the shape the app writes, and anything else is read as nothing', () => {
    expect(readHatCookie(hatCookieValue('you', 'ctx_123'))).toEqual({ hat: 'you', contextId: 'ctx_123' })
    expect(readHatCookie(hatCookieValue('firm'))).toEqual({ hat: 'firm', contextId: null })
    expect(readHatCookie('admin:ctx_1')).toEqual({ hat: null, contextId: null })
    expect(readHatCookie("firm:'; drop table")).toEqual({ hat: 'firm', contextId: null })
    expect(readHatCookie(undefined)).toEqual({ hat: null, contextId: null })
  })
})

describe('search and the + button offer the current hat’s pages', () => {
  it('search in the You hat finds the person’s own pages and none of the firm’s', () => {
    const own = reachablePagesFor('VENDOR', false, { worker: true, permissions: ['*'], hat: 'you' }).map((p) => p.href)
    expect(own).toContain('/dashboard/my-work')
    expect(own).not.toContain('/dashboard/requirements')
    const firm = reachablePagesFor('VENDOR', false, { worker: true, permissions: ['*'], hat: 'firm' }).map((p) => p.href)
    expect(firm).toContain('/dashboard/requirements')
    expect(firm).not.toContain('/dashboard/my-work')
  })

  it('the + button offers nothing the firm creates over the You hat', () => {
    expect(plusMenuFor('VENDOR', false, ['*'], true, { hat: 'you' })).toEqual([])
    expect(plusMenuFor('VENDOR', false, ['*'], true, { hat: 'firm' }).length).toBeGreaterThan(0)
  })
})

describe('the switch is the account menu’s, and a view rather than a permission', () => {
  it('the account menu lists the hats on a desktop, and the foot of the menu does on a phone', () => {
    expect(read('src/components/shell/header.tsx')).toContain('<HatList onPicked={() => setAccountOpen(false)} />')
    expect(read('src/components/shell/mobile-nav.tsx')).toContain('<HatList roomy />')
  })

  it('a seat chosen in the account menu is used only where it is the person’s own and live, and otherwise the seat it always was', () => {
    const src = read('src/lib/api-context.ts')
    expect(src).toContain('where: { id: chosen, personId: person.id, ...usable }')
    expect(src).toMatch(/: null\) \?\? await prisma\.context\.findFirst\(\{\s*where: \{ personId: person\.id, \.\.\.usable \}/)
  })

  it('a switch to another firm’s seat is logged by the route that has always logged one', () => {
    expect(read('src/components/session-provider.tsx')).toContain("await fetch('/api/me/context', {")
  })

  it('the hat is read on the server from one cookie, so Ask Etyme can greet the hat being worn', () => {
    expect(HAT_COOKIE).toBe('etyme_hat')
    expect(read('src/app/dashboard/layout.tsx')).toContain('readHatCookie(jar.get(HAT_COOKIE)?.value).hat')
  })
})
