import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The second Tapin walk, supply's two items (CLAUDE.md, "Tapin gets
 * agents, not a website", 2026-10-30):
 *
 *  1. Tapin's bench read one number on Consultants and another on Today
 *     and Ask Etyme. Today and Ask Etyme read `benchAt`; Consultants
 *     counted its own records, an unanswered ask, a no and a placed
 *     person among them, and called a tier "on bench".
 *  2. A firm that lists a person could rewrite that person's own profile
 *     through `PATCH /api/consultants/:id`.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({
  caller: null as any,
  profile: null as any,
  profiles: [] as any[],
  context: null as any,
  bench: [] as { personId: string; name: string; since: string }[],
  invited: 0,
  writes: [] as { table: string; data: any }[],
  logs: [] as any[],
}))

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn() }))
vi.mock('@/app/api/consultants/ask-by-email', () => ({ askByEmail: vi.fn(async () => 'EMAILED') }))
vi.mock('@/app/api/today/reads', () => ({ benchAt: vi.fn(async () => h.bench) }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: vi.fn(async () => ({ caller: h.caller, error: null })),
}))
vi.mock('@/lib/db', () => {
  const prisma: Row = {
    consultantProfile: {
      findUnique: async () => h.profile,
      findMany: async () => h.profiles,
      count: async () => h.profiles.length,
      update: async ({ data }: Row) => {
        h.writes.push({ table: 'consultantProfile', data })
        return { headline: data.headline ?? h.profile.headline, skills: data.skills ?? h.profile.skills, location: data.location ?? h.profile.location }
      },
    },
    person: { update: async ({ data }: Row) => { h.writes.push({ table: 'person', data }); return data } },
    benchListing: {
      update: async ({ data }: Row) => {
        h.writes.push({ table: 'benchListing', data })
        return { firmHeadline: null, firmSkills: [], firmLocation: null, firmNotes: null, ...h.profile.listings[0], ...data }
      },
      count: async () => h.invited,
    },
    context: { findFirst: async () => h.context },
    accessLog: {
      create: async ({ data }: Row) => { h.logs.push(data); return data },
      createMany: async ({ data }: Row) => { h.logs.push(...data); return { count: data.length } },
    },
  }
  prisma.$transaction = async (fn: (tx: Row) => unknown) => fn(prisma)
  return { prisma }
})

import { benchStanding, consultantsReadBench, STANDING_WORD } from '@/lib/bench-filter'
import {
  hasOwnAccount, recordKeptBy, profileEditPlan, theirsToChangeSays, firmViewPatch, firmViewEditBody,
} from '@/lib/consultant-portfolio/firm-view'
import { GET as listConsultants } from '@/app/api/consultants/route'
import { PATCH as editConsultant } from '@/app/api/consultants/[id]/route'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

const TAPIN = { id: 'tapin', name: 'Tapin', kind: 'VENDOR' }
const RECRUITER = {
  person: { id: 'oliver' },
  company: TAPIN,
  permissions: ['consultants.read', 'consultants.write'],
}

/** A consultant record as the edit route reads it. */
function record(o: {
  name?: string
  passwordHash?: string | null
  signIns?: number
  ownSeats?: number
  otherFirms?: number
  listed?: boolean
} = {}) {
  return {
    id: 'profile-anika',
    personId: 'anika',
    headline: 'HCM lead',
    skills: ['Workday'],
    location: 'Austin, TX',
    person: {
      name: o.name ?? 'Anika Shah',
      passwordHash: o.passwordHash ?? null,
      _count: { credentials: o.signIns ?? 0, contexts: o.ownSeats ?? 0 },
    },
    listings: o.listed === false ? [] : [{ id: 'listing-tapin', firmHeadline: null, firmSkills: [], firmLocation: null, firmNotes: null }],
    _count: { listings: o.otherFirms ?? 0 },
  }
}

const patch = (body: Row) =>
  editConsultant(
    new NextRequest('http://x/api/consultants/profile-anika', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'profile-anika' }) }
  )

beforeEach(() => {
  h.caller = RECRUITER
  h.profile = record()
  h.context = null
  h.writes = []
  h.logs = []
  h.bench = []
  h.invited = 0
  h.profiles = []
})

// ── 1. One bench, counted once ──────────────────────────────────────────

describe('Consultants, Today and Ask Etyme count the bench from one list', () => {
  it('Consultants, Today and Ask Etyme all read who is on the bench from benchAt, and Consultants counts nothing of its own', () => {
    const consultants = read('src/app/api/consultants/route.ts')
    expect(consultants).toContain("import { benchAt } from '@/app/api/today/reads'")
    expect(consultants).toContain('bench: bench ? { count: bench.length, invited: invited ?? 0 } : null')
    expect(read('src/app/api/today/route.ts')).toContain('benchAt(company.id, now)')
    expect(read('src/app/api/conversations/twin/read.ts')).toContain('benchAt(company.id, now)')
    const page = read('src/app/dashboard/consultants/page.tsx')
    expect(page).toContain('setBench(body.data?.bench ?? null)')
    // The two figures that counted a bench of their own are gone.
    expect(page).not.toContain('retainedCount')
    expect(page).not.toContain('availableNow')
    expect(page).not.toContain('ready to deploy')
  })

  it('the Bench page reads the same benchAt list for its count, so its tile cannot differ from Consultants, Today and Ask Etyme', () => {
    const route = read('src/app/api/bench/route.ts')
    expect(route).toContain("import { benchAt } from '@/app/api/today/reads'")
    expect(route).toContain("scope === 'company' && companyId ? await benchAt(companyId, now) : null")
    expect(route).toContain('onBench: benchToday ? benchToday.length : null')
    const page = read('src/app/dashboard/bench/page.tsx')
    expect(page).toContain("setOnBenchCount(forScope === 'company' ? reading.onBench : null)")
    expect(page).toContain('<Stat label="On the bench" value={onBenchCount} />')
  })

  it('three people said yes to Tapin and one is on a project, so Consultants reads two on the bench, the number Today and Ask Etyme read', async () => {
    h.bench = [
      { personId: 'anika', name: 'Anika Shah', since: '2026-10-20' },
      { personId: 'ike', name: 'Ike Danso', since: '2026-10-21' },
    ]
    h.invited = 1
    const listing = (state: string) => [{
      id: `l-${state}`, tier: 'MARKETING', state, rateMin: null, rateMax: null, grantedAt: new Date('2026-10-20'),
      termsEngagementType: null, termsPayRateCents: null, termsAgreedAt: null,
      firmHeadline: null, firmSkills: [], firmLocation: null, firmNotes: null,
    }]
    const person = (id: string, name: string) => ({ id, name, primaryEmail: `${id}@example.test`, passwordHash: null, _count: { credentials: 0, contexts: 0 } })
    const profile = (id: string, name: string, state: string) => ({
      id: `p-${id}`, personId: id, headline: null, skills: [], location: null, workAuth: null, rateFloor: null,
      availableFrom: null, visibility: 'INTERNAL', person: person(id, name), listings: listing(state), _count: { listings: 0 },
    })
    h.profiles = [
      profile('anika', 'Anika Shah', 'GRANTED'),
      profile('ike', 'Ike Danso', 'GRANTED'),
      profile('ravi', 'Ravi Kumar', 'GRANTED'),
      profile('maya', 'Maya Brooks', 'INVITED'),
    ]
    const res = await listConsultants(new NextRequest('http://x/api/consultants'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.bench).toEqual({ count: 2, invited: 1 })
    const by = Object.fromEntries(body.data.consultants.map((c: Row) => [c.person.name, c.standing]))
    expect(by).toEqual({ 'Anika Shah': 'ON_BENCH', 'Ike Danso': 'ON_BENCH', 'Ravi Kumar': 'ON_A_PROJECT', 'Maya Brooks': 'ASKED' })
    // Four records, two on the bench: the records are never read as the bench.
    expect(body.data.pagination.total).toBe(4)
    // Reading the bench is logged the way the Today page logs it.
    expect(h.logs.map((l) => [l.subjectId, l.action])).toEqual(
      expect.arrayContaining([['anika', 'TALENT_VIEW_ANON'], ['ike', 'TALENT_VIEW_ANON']])
    )
  })

  it('somebody Today counts on the bench reads On the bench on Consultants, whatever their listing says, because employment is a consent of its own', () => {
    expect(benchStanding({ onBench: true, listingState: 'GRANTED' })).toBe('ON_BENCH')
    expect(benchStanding({ onBench: true, listingState: null })).toBe('ON_BENCH')
    expect(benchStanding({ onBench: true, listingState: 'INVITED' })).toBe('ON_BENCH')
  })

  it('somebody asked and not answered, or who said no, is a consultant record and never on the bench', () => {
    expect(benchStanding({ onBench: false, listingState: 'INVITED' })).toBe('ASKED')
    expect(benchStanding({ onBench: false, listingState: 'DECLINED' })).toBe('SAID_NO')
    expect(STANDING_WORD.ASKED).toBe('Asked, not answered')
    expect(STANDING_WORD.SAID_NO).toBe('Said no')
  })

  it('somebody who said yes and is on a project here today reads On a project, never On the bench', () => {
    expect(benchStanding({ onBench: false, listingState: 'GRANTED' })).toBe('ON_A_PROJECT')
    expect(STANDING_WORD.ON_A_PROJECT).toBe('On a project')
  })

  it('where the seat does not read the bench, no row guesses On a project or On the bench', () => {
    expect(benchStanding({ onBench: null, listingState: 'GRANTED' })).toBeNull()
    expect(benchStanding({ onBench: null, listingState: null })).toBeNull()
    // An unanswered ask is still said: it is on the row's own listing.
    expect(benchStanding({ onBench: null, listingState: 'INVITED' })).toBe('ASKED')
  })

  it('the bench figure on Consultants opens where the Today page opens it, and never at a client or an MSP', async () => {
    expect(consultantsReadBench(true, 'VENDOR')).toBe(true)
    expect(consultantsReadBench(true, 'CLIENT')).toBe(false)
    expect(consultantsReadBench(false, 'VENDOR')).toBe(false)
    h.caller = { ...RECRUITER, company: { id: 'aptiva', name: 'Aptiva Workforce', kind: 'MSP' } }
    const res = await listConsultants(new NextRequest('http://x/api/consultants'))
    expect((await res.json()).data.bench).toBeNull()
  })

  it('a tier is shown on a row only once the person said yes', () => {
    const page = read('src/app/dashboard/consultants/page.tsx')
    expect(page).toContain("row.tier && (row.consent == null || row.consent === 'GRANTED')")
  })
})

// ── 2. A person's own record is theirs ──────────────────────────────────

describe('a firm that lists a person cannot overwrite the person’s own profile', () => {
  it('an account of their own is a password, a sign-in on record or the seat a person gets on signing in; an invitation is not', () => {
    expect(hasOwnAccount({ passwordSet: true, signIns: 0, ownSeats: 0 })).toBe(true)
    expect(hasOwnAccount({ passwordSet: false, signIns: 1, ownSeats: 0 })).toBe(true)
    expect(hasOwnAccount({ passwordSet: false, signIns: 0, ownSeats: 1 })).toBe(true)
    expect(hasOwnAccount({ passwordSet: false, signIns: 0, ownSeats: 0 })).toBe(false)
  })

  it('a record is the firm’s to keep only while the person has no account and no other firm lists them', () => {
    expect(recordKeptBy({ ownAccount: false, otherFirms: 0 })).toBe('FIRM')
    expect(recordKeptBy({ ownAccount: true, otherFirms: 0 })).toBe('THEM')
    expect(recordKeptBy({ ownAccount: false, otherFirms: 1 })).toBe('THEM')
  })

  it('a firm cannot change the free date or lowest rate of somebody with an account of their own; it is told so in a sentence, the refusal is logged first, and nothing is written', async () => {
    h.profile = record({ signIns: 2 })
    h.caller = { ...RECRUITER, permissions: [...RECRUITER.permissions, 'consultants.cost'] }
    const res = await patch({ skills: ['Workday', 'Boomi'], availableFrom: '2026-11-15', rateFloor: 9000 })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('THEIRS_TO_CHANGE')
    expect(body.error.message).toBe(
      'Anika Shah’s lowest rate and free date are theirs to change, not Tapin’s. ' +
        'What you type about them is kept on your bench listing: a title, skills, a place and a note.'
    )
    expect(h.writes).toEqual([])
    expect(h.logs).toEqual([expect.objectContaining({ subjectId: 'anika', action: 'PROFILE_VIEW', allowed: false })])
  })

  it('a firm cannot rename somebody with an account of their own, or set their work authorization or who sees their profile', () => {
    const plan = profileEditPlan({
      isSubject: false, ownAccount: true, otherFirms: 0, hasListing: true, name: 'Anika Shah', firm: 'Tapin',
      fields: ['name', 'workAuth', 'visibility'],
    })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.says).toBe(
      'Anika Shah’s name, work authorization and visibility are theirs to change, not Tapin’s. ' +
        'What you type about them is kept on your bench listing: a title, skills, a place and a note.'
    )
  })

  it('what a firm types about somebody with an account of their own (a title, skills, a place, a note) is kept on its bench listing and their profile is unchanged', async () => {
    h.profile = record({ passwordHash: 'set' })
    const res = await patch({ headline: 'Workday HCM consultant', skills: ['Workday', 'Boomi', 'workday'], location: 'Remote, US', notes: 'Strong on integrations' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(h.writes).toEqual([
      { table: 'benchListing', data: { firmHeadline: 'Workday HCM consultant', firmSkills: ['Workday', 'Boomi'], firmLocation: 'Remote, US', firmNotes: 'Strong on integrations' } },
    ])
    expect(body.data.kept).toBe('LISTING')
    expect(body.data.message).toBe('Saved on your bench listing. Anika Shah’s own profile is unchanged.')
    // The firm reads its own words; hers stay beside them, untouched.
    expect(body.data.consultant.headline).toBe('Workday HCM consultant')
    expect(body.data.consultant.own).toEqual({ headline: 'HCM lead', skills: ['Workday'], location: 'Austin, TX' })
  })

  it('a firm with no bench listing for somebody with an account of their own is refused in a sentence, and nothing is written', async () => {
    h.profile = record({ ownSeats: 1, listed: false })
    h.context = { id: 'seat-at-tapin' }
    const res = await patch({ skills: ['Payroll'] })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('NO_LISTING')
    expect(body.error.message).toBe('Anika Shah’s profile is theirs to change, not Tapin’s, and Tapin has no bench listing for them to keep your words on.')
    expect(h.writes).toEqual([])
  })

  it('a firm keeps the record of somebody with no account whom no other firm lists, and what it typed goes on its listing too, so its own list shows it', async () => {
    h.profile = record()
    const res = await patch({ skills: ['Workday', 'Boomi'], availableFrom: '2026-11-15' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(h.writes.map((w) => w.table)).toEqual(['consultantProfile', 'benchListing'])
    expect(h.writes[0].data).toEqual({ skills: ['Workday', 'Boomi'], availableFrom: new Date('2026-11-15') })
    expect(h.writes[1].data).toEqual({ firmSkills: ['Workday', 'Boomi'] })
    expect(body.data.kept).toBe('BOTH')
    expect(body.data.message).toBe('Saved. Matching reads it the next time it runs.')
  })

  it('somebody another firm also lists is not the first firm’s record to rewrite, even with no account, and the sentence never mentions the other firm', async () => {
    h.profile = record({ otherFirms: 1 })
    const res = await patch({ availableFrom: '2026-11-15' })
    expect(res.status).toBe(403)
    const says = (await res.json()).error.message as string
    expect(says).toBe(theirsToChangeSays({ name: 'Anika Shah', firm: 'Tapin', fields: ['availableFrom'] }))
    expect(says).not.toMatch(/another firm|other firm|also lists|bench too/i)
    expect(h.writes).toEqual([])
  })

  it('the person changes their own record from their own seat, and a firm’s note is never written on it', async () => {
    h.profile = record({ signIns: 3 })
    h.caller = { person: { id: 'anika' }, company: null, permissions: ['consultants.write'] }
    const res = await patch({ availableFrom: '2026-12-01', skills: ['Workday'] })
    expect(res.status).toBe(200)
    expect(h.writes.map((w) => w.table)).toEqual(['consultantProfile'])
    const plan = profileEditPlan({ isSubject: true, ownAccount: true, otherFirms: 2, hasListing: false, name: 'Anika Shah', firm: 'Tapin', fields: ['notes'] })
    expect(plan).toMatchObject({ ok: true, profile: false, listing: false })
  })

  it('a firm that neither employs nor lists somebody is refused, and the refusal is logged before it is sent', async () => {
    h.profile = record({ listed: false })
    h.context = null
    const res = await patch({ skills: ['Workday'] })
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('Anika Shah is not one of Tapin’s people, so there is nothing here for you to change.')
    expect(h.logs).toEqual([expect.objectContaining({ subjectId: 'anika', action: 'PROFILE_VIEW', allowed: false })])
    expect(h.writes).toEqual([])
  })

  it('a field the request does not send is left as it was on the listing', () => {
    expect(firmViewPatch({ notes: '  ' })).toEqual({ firmNotes: null })
    expect(firmViewPatch({ headline: 'Validation engineer', location: 'Raleigh, NC' })).toEqual({ firmHeadline: 'Validation engineer', firmLocation: 'Raleigh, NC' })
    expect(firmViewEditBody({ headline: ' ICU travel nurse ', skills: 'ICU, telemetry, , ICU', location: '', notes: '' }))
      .toEqual({ headline: 'ICU travel nurse', skills: ['ICU', 'telemetry'], location: null, notes: null })
  })

  it('the editor offers a firm its own view where the record is theirs, and never their free date or lowest rate', () => {
    const editor = read('src/app/dashboard/consultants/profile-editor.tsx')
    const firmView = editor.slice(editor.indexOf('function FirmViewEditor'))
    expect(firmView).toContain('How you sell them')
    expect(firmView).toContain('firmViewEditBody(form)')
    expect(firmView).not.toContain('availableFrom')
    expect(firmView).not.toContain('rateFloor')
    expect(editor).toContain("if (keptBy === 'THEM')")
    const page = read('src/app/dashboard/consultants/page.tsx')
    expect(page).toContain("keptBy={consultant.keptBy ?? 'THEM'}")
  })
})

// ── 3. The ask's log line never promises a letter that cannot leave ─────

describe('the bench ask says a letter is coming only where one can leave', () => {
  it('where no email can leave, the ask reads as waiting on their yes with the link kept on the notice for staff, never "from the letter"', async () => {
    const { askSummary } = await import('@/lib/consultant-portfolio/bench-ask')
    const { INVITE_LINK_KEPT_SAYS } = await import('@/lib/bench-filter')
    const says = askSummary({ door: 'ADD_CONSULTANT', personName: 'Anika Shah', firm: 'Tapin', path: 'NEW', tier: 'MARKETING', mailOn: false })
    expect(says).toBe(`"Anika Shah" asked onto Tapin’s bench (MARKETING). Waiting on their yes. ${INVITE_LINK_KEPT_SAYS}`)
    expect(says).not.toContain('letter')
  })

  it('where email can leave, the ask still says it waits on their yes from the letter', async () => {
    const { askSummary } = await import('@/lib/consultant-portfolio/bench-ask')
    expect(askSummary({ door: 'PUBLIC_PAGE', personName: 'Ike Danso', firm: 'Tapin', path: 'ASK_AGAIN', tier: 'MARKETING', mailOn: true }))
      .toBe('"Ike Danso", who already has a record, asked again onto Tapin’s bench (MARKETING) from Tapin’s public page. Pending their yes from the letter.')
  })

  it('the ask reads whether mail can leave from the one function the send reads', async () => {
    const ask = read('src/lib/consultant-portfolio/bench-ask.ts')
    expect(ask).toContain("import { mailLeaves } from '@/lib/notify/mail-leaves'")
    expect(ask).toContain('mailOn: mailLeaves() }),')
    expect(read('src/lib/messages.ts')).toMatch(/export function configured\(\): boolean \{\s*return mailLeaves\(\)/)
  })
})
