import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chipsFor, emptyBook, CHIP_PAGES, SOLO_FIRST_STEP } from '@/app/dashboard/decisions/chips'
import { rolesFor } from '@/lib/company-defaults'
import { openBecause } from '@/lib/nav-table'
import { refusalSentence, namesAPermission } from '@/lib/refusal-words'
import { noDeskYet } from '@/app/api/program/no-desk'

/**
 * Round three of the sign-up walk, 2026-10-08, on the buying side's pages
 * (docs/results/2026-10-08-signup-round-3.md). Each sentence is one fix
 * the walk asked for, numbered as the walk numbered it, plus the three
 * routes the Member change of 801e7b900 left asking nothing.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const owner = (kind: Parameters<typeof rolesFor>[0]) =>
  rolesFor(kind).find((r) => r.isOwner)!.permissions as readonly string[]
const labels = (chips: { label: string }[]) => chips.map((c) => c.label)

describe('13: a one-person firm’s Needs attention offers only what her menu has, and a first step', () => {
  const ana = { kind: 'CONSULTANT_CORP' as const, isConsultant: false, permissions: owner('CONSULTANT_CORP') }

  it('offers her no Job requests, Rolloff, Submissions, To paper or To start chip', () => {
    const shown = labels(chipsFor(ana, {}, 0))
    for (const never of ['Job requests', 'Rolloff', 'Submissions', 'To paper', 'To start']) {
      expect(shown, never).not.toContain(never)
    }
  })

  it('still offers her Timesheets, Expenses and Bills, whose pages are on her menu', () => {
    expect(labels(chipsFor(ana, {}, 0))).toEqual(['All', 'Timesheets', 'Expenses', 'Bills'])
  })

  it('offers a chip with something waiting under it even where its page is not on the menu, so no item hides behind a filter nobody can pick', () => {
    const shown = chipsFor(ana, { CONTRACT_PAPERING: 1 }, 1)
    expect(shown.find((c) => c.key === 'CONTRACT_PAPERING')?.count).toBe(1)
  })

  it('still offers a staffing supplier’s owner every chip, because every page is on its menu', () => {
    const shown = labels(chipsFor({ kind: 'VENDOR', isConsultant: false, permissions: owner('VENDOR') }, {}, 0))
    expect(shown).toEqual(['All', 'Timesheets', 'Job requests', 'Expenses', 'Rolloff', 'Submissions', 'To paper', 'To start', 'Bills'])
  })

  it('offers a client’s program manager the Job requests chip, under the client menu’s own page', () => {
    const pm = rolesFor('CLIENT').find((r) => r.name === 'Program Manager')!.permissions as readonly string[]
    expect(labels(chipsFor({ kind: 'CLIENT', isConsultant: false, permissions: pm }, {}, 0))).toContain('Job requests')
  })

  it('reads papering and starting as following an award on a submission, so a firm with no Submissions page has neither', () => {
    expect(CHIP_PAGES.CONTRACT_PAPERING).toEqual(['/dashboard/submissions'])
    expect(CHIP_PAGES.CONTRACT_START).toEqual(['/dashboard/submissions'])
  })

  it('tells her on an empty book, in one sentence, to record the contract she already has or wait for a firm to put her forward', () => {
    const empty = emptyBook('CONSULTANT_CORP', true)
    expect(empty.lead).toBe('Nothing needs you yet.')
    expect(empty.says).toBe(SOLO_FIRST_STEP)
    expect(empty.says).toMatch(/record it under Contracts/)
    expect(empty.says).toMatch(/a firm puts you forward/)
    expect(empty.says.split('. ').length).toBe(1)
    expect(empty.says).not.toMatch(/Check back later/)
  })

  it('opens Record a placement from the first step only where her seat may record one', () => {
    expect(emptyBook('CONSULTANT_CORP', true)).toMatchObject({ href: '/dashboard/contracts?new=1', action: 'Record your contract' })
    expect(emptyBook('CONSULTANT_CORP', false)).toMatchObject({ href: null, action: null })
  })

  it('leaves every other firm’s empty book reading "All clear."', () => {
    expect(emptyBook('VENDOR', true)).toMatchObject({ lead: 'All clear.', href: null })
    expect(emptyBook('CLIENT', true).says).toBe('Nothing needs your attention right now. Check back later.')
  })

  it('the page draws its chips and its empty book from these answers, not from a fixed list', () => {
    const page = read('src/app/dashboard/decisions/page.tsx')
    expect(page).toMatch(/chipsFor\(/)
    expect(page).toMatch(/emptyBook\(/)
    expect(page).not.toMatch(/key: 'ROLLOFF_ACTION', label: 'Rolloff'/)
  })
})

describe('a desk-less seat reads timesheets, the budget and the org view by URL no more than by menu', () => {
  const routes = {
    timesheets: 'src/app/api/timesheets/route.ts',
    budget: 'src/app/api/program/budget/route.ts',
    org: 'src/app/api/program/org/route.ts',
  }
  const getOf = (p: string) => {
    const src = read(p)
    const start = src.indexOf('export async function GET')
    const after = src.indexOf('export async function', start + 10)
    return src.slice(start, after < 0 ? src.length : after)
  }

  for (const [name, path] of Object.entries(routes)) {
    it(`the ${name} route refuses the same seat the menu hides the link from, by the menu’s own rule`, () => {
      const body = getOf(path)
      expect(body).toMatch(/isDeskless\(caller\.permissions\)/)
      expect(body).toMatch(/noDeskYet\(/)
      expect(body).toMatch(/allowed: false/)
      expect(body).toMatch(/status: 403/)
    })
  }

  it('the menu still offers all three to every desk, so the gate asks no permission a desk on the menu lacks', () => {
    for (const href of ['/dashboard/timesheets', '/dashboard/program/budget', '/dashboard/program/org']) {
      expect(openBecause(href), href).not.toBeNull()
    }
  })

  it('a desk-less worker reads only their own weeks rather than being refused them', () => {
    const body = getOf(routes.timesheets)
    expect(body).toMatch(/personId: caller\.person\.id \}\] \}/)
    expect(body).toMatch(/rowScope = own/)
  })

  it('a seated program office is judged by its seat and never refused as desk-less', () => {
    expect(getOf(routes.budget)).toMatch(/!seat && isDeskless/)
    expect(getOf(routes.org)).toMatch(/!seat && isDeskless/)
    expect(getOf(routes.timesheets)).toMatch(/!desk\?\.seat && isDeskless/)
  })

  it('the refusal says the page is not part of the seat and names no permission key', () => {
    const says = noDeskYet('Timesheets', 'Walk Co')
    expect(says).toBe('Timesheets is not part of your seat at Walk Co. Ask your company’s owner if you need it.')
    expect(namesAPermission(says)).toBe(false)
    // The same words lib/refusal-words says to a seat it can name no desk for.
    expect(refusalSentence('needs timesheets.read', { company: 'Walk Co', what: 'Timesheets' })).toBe(says)
  })
})

describe('the award’s comments are in American English', () => {
  it('lib/award says annualizes and annualization, never the British spelling', () => {
    expect(read('src/lib/award.ts')).not.toMatch(/annualis/i)
  })
})

describe('the duplicate check takes its eyebrow from the reader’s menu', () => {
  it('draws the section from usePageSection and nothing while it loads, never a typed "Governance"', () => {
    const page = read('src/app/dashboard/identity/page.tsx')
    expect(page).toMatch(/usePageSection\('\/dashboard\/identity'\)/)
    // PageHead draws the eyebrow only when the menu gives one
    // (shared-primitives), so passing the section is drawing nothing while it loads.
    expect(page).toMatch(/<PageHead\s+eyebrow=\{section\}/)
    expect(page).not.toMatch(/<p className="eyebrow">Governance<\/p>/)
    expect(page).not.toMatch(/eyebrow="Governance"/)
  })
})
