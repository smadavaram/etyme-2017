/**
 * The onboarding walk, 2026-10-27, conversation's half: every new party's
 * first greeting names its one next act and the link; a colleague who
 * came in by invitation is told where she is and what to do first; and
 * where no email can be sent, the one-time link is kept on the notice so
 * a stuck sign-up can be rescued, and nowhere else.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { today, voiceBreaks, type Readers } from '@/app/api/conversations/twin/ask'
import { firstActFor, welcomeFor, FIRST_ACT_HREF, NEW_ARRIVAL_DAYS } from '@/app/api/conversations/twin/first-act'
import { workerToday, newWorkerAct, type WorkerFacts } from '@/app/api/conversations/twin/worker'
import { recordedBody, isAccountMail, bellShows, LINK_KEPT, LINK_NOT_KEPT, ACCOUNT_MAIL } from '@/lib/notify/account-mail'

const NOW = new Date('2026-10-27T15:00:00Z')

/** A company with nothing on the record: no questions, nobody waiting, no time limit. */
function quiet(): Readers {
  return {
    waiting: vi.fn(async () => []),
    othersWaiting: vi.fn(async () => []),
    limits: vi.fn(async () => ({ ok: true as const, entries: [] })),
    spendIn: vi.fn(async () => ({ ok: true as const, receipts: [], undated: 0 })),
    told: vi.fn(async () => ({ told: [], stale: [] })),
  } as unknown as Readers
}

const NEW_WORKER: WorkerFacts = {
  seat: 'CONSULTANT', seatAt: null, placements: [], toFile: [], returned: [], sent: [], ownCompanyBills: null, weeksWithNoRate: 0,
  papers: [], runningOut: [], interviews: [], stays: [], consent: { benches: [], asking: [], employers: [] }, unread: [], pageOn: false,
}

const textOf = (l: { says: string } | null | undefined) => l?.says ?? ''

describe('every new party’s first greeting names its one next act', () => {
  it('a new client’s greeting names recommending a supplier as the first act', async () => {
    const act = firstActFor({ party: 'CLIENT', companyKind: 'CLIENT', suppliers: 0, jobs: 0 })
    expect(act).toEqual({
      says: 'Recommend your first supplier, then post a job.',
      links: [{ text: 'Recommend your first supplier', href: FIRST_ACT_HREF.suppliers }],
    })
    const greeted = await today(quiet(), { now: NOW, greeting: true, party: 'CLIENT', firstAct: act })
    expect(greeted.kind === 'NEEDS' && greeted.recommend).toEqual(act)
  })

  it('a client with a supplier and no job is told to post its first job, and one with both is told neither', () => {
    expect(textOf(firstActFor({ party: 'CLIENT', companyKind: 'CLIENT', suppliers: 2, jobs: 0 }))).toBe('Post your first job.')
    expect(firstActFor({ party: 'CLIENT', companyKind: 'CLIENT', suppliers: 2, jobs: 3 })).toBeNull()
  })

  it('a new MSP’s greeting offers to ask a client for a seat', () => {
    const act = firstActFor({ party: 'MSP', companyKind: 'MSP', seats: 0 })
    expect(act?.says).toBe('No client has given you a seat in its program yet. Ask a client for a seat; its owner or program manager grants it.')
    expect(act?.links).toEqual([{ text: 'Ask a client for a seat', href: FIRST_ACT_HREF.askForSeat }])
    expect(firstActFor({ party: 'MSP', companyKind: 'MSP', seats: 1 })).toBeNull()
  })

  it('a new supplier is told nothing has come from a client yet, and offered to record a client it already works with', () => {
    const act = firstActFor({ party: 'FIRM', companyKind: 'VENDOR', clients: 0 })
    expect(act?.says).toBe('Nothing from a client yet; when a client invites you, it lands here. Record a client you already work with.')
    expect(act?.links?.[0].href).toBe(FIRST_ACT_HREF.companies)
  })

  it('a new integrator is told to add its people, by a file or one by one, before a delivery manager flags who rolls off', () => {
    const act = firstActFor({ party: 'FIRM', companyKind: 'GSI', people: 0 })
    expect(act?.says).toBe('Add your people: import a file, or add them one by one. Then a delivery manager can flag who rolls off.')
    expect(act?.links?.map((l) => l.href)).toEqual([FIRST_ACT_HREF.importPeople, FIRST_ACT_HREF.people])
  })

  it('a new one-person firm’s greeting names recording her contract and her papers, never asking herself', async () => {
    const act = firstActFor({ party: 'SOLO', companyKind: 'CONSULTANT_CORP', contracts: 0, firmPapers: 0 })
    expect(act?.says).toBe('Record the contract you already have, and put your W-9 and insurance on file.')
    expect(act?.says).not.toMatch(/\bask\b/i)
    const greeted = await today(quiet(), { now: NOW, greeting: true, party: 'SOLO', firstAct: act })
    expect(JSON.stringify(greeted)).not.toMatch(/ask (your|the) (company’s )?owner/i)
    expect(textOf(firstActFor({ party: 'SOLO', companyKind: 'CONSULTANT_CORP', contracts: 1, firmPapers: 0 }))).toBe('Put your W-9 and insurance on file.')
  })

  it('a count that was not read is never said as zero, so a party whose rows could not be read is recommended nothing', () => {
    expect(firstActFor({ party: 'CLIENT', companyKind: 'CLIENT' })).toBeNull()
    expect(firstActFor({ party: 'MSP', companyKind: 'VENDOR' })).toBeNull()
    expect(firstActFor({ party: 'FIRM', companyKind: 'VENDOR' })).toBeNull()
    expect(firstActFor({ party: 'SOLO', companyKind: 'CONSULTANT_CORP' })).toBeNull()
  })

  it('somebody near the time limit is recommended before the first act', async () => {
    const near = { ...quiet(), limits: vi.fn(async () => ({ ok: true as const, entries: [
      { personId: 'p-aoife', personName: 'Aoife Kelly', limitOn: '2026-11-10', capMonths: 18, suppliers: ['Brightmoor Staffing'], recordedAt: '2026-10-27T06:00:00Z' },
    ] })) } as unknown as Readers
    const act = firstActFor({ party: 'CLIENT', companyKind: 'CLIENT', suppliers: 0, jobs: 0 })
    const greeted = await today(near, { now: NOW, greeting: true, party: 'CLIENT', firstAct: act })
    if (greeted.kind !== 'NEEDS') throw new Error('expected a greeting')
    expect(greeted.recommend?.says).toContain('Aoife Kelly')
    expect(greeted.recommend).not.toEqual(act)
  })

  it('a reply that is not the greeting never carries the first act', async () => {
    const act = firstActFor({ party: 'CLIENT', companyKind: 'CLIENT', suppliers: 0, jobs: 0 })
    const asked = await today(quiet(), { now: NOW, party: 'CLIENT', firstAct: act })
    expect(asked.kind === 'NEEDS' && asked.recommend).toBeUndefined()
  })

  it('every first act is said in the voice: short sentences, no apology, no hedging', () => {
    const acts = [
      firstActFor({ party: 'CLIENT', companyKind: 'CLIENT', suppliers: 0, jobs: 0 }),
      firstActFor({ party: 'CLIENT', companyKind: 'CLIENT', suppliers: 1, jobs: 0 }),
      firstActFor({ party: 'MSP', companyKind: 'MSP', seats: 0 }),
      firstActFor({ party: 'FIRM', companyKind: 'VENDOR', clients: 0 }),
      firstActFor({ party: 'FIRM', companyKind: 'GSI', people: 0 }),
      firstActFor({ party: 'SOLO', companyKind: 'CONSULTANT_CORP', contracts: 0, firmPapers: 0 }),
      newWorkerAct({ seat: 'CONSULTANT', pageOn: false }),
      newWorkerAct({ seat: 'CONSULTANT', pageOn: true }),
    ]
    for (const a of acts) {
      expect(a).not.toBeNull()
      expect(voiceBreaks(a!.says)).toEqual([])
      // Every link's words are in the sentence, so the screen can draw it.
      for (const l of a!.links ?? []) expect(a!.says).toContain(l.text)
    }
  })
})

describe('a new worker', () => {
  it('a new worker’s greeting says Your page is off and offers to turn it on', () => {
    const greeted = workerToday(NEW_WORKER, { greeting: true, now: NOW })
    expect(greeted.recommend).toEqual({
      says: 'Your page is off. Turn on Your page so firms can find you, and put a paper on file.',
      links: [{ text: 'Turn on Your page', href: '/dashboard/my-page' }, { text: 'put a paper on file', href: '/dashboard/my-work/paperwork' }],
    })
    // Never told firms find her through a page that is off.
    expect(JSON.stringify(greeted)).not.toContain('Firms find you through Your page')
  })

  it('a new worker whose page is on is told so and asked for a paper next', () => {
    expect(workerToday({ ...NEW_WORKER, pageOn: true }, { greeting: true, now: NOW }).recommend?.says)
      .toBe('Nobody has placed you yet. Your page is on, so firms can find you. Put a paper on file next.')
  })

  it('a firm’s own employee with no work yet is not offered Your page, and where the page could not be read the old sentence stands', () => {
    expect(newWorkerAct({ seat: 'EMPLOYEE', pageOn: false })).toBeNull()
    const unknown = workerToday({ ...NEW_WORKER, pageOn: undefined }, { greeting: true, now: NOW })
    expect(unknown.recommend).toBeUndefined()
    expect(unknown.more.map((l) => l.says)).toContain('Nobody has placed you yet. Firms find you through Your page.')
  })
})

describe('a colleague who came in by invitation', () => {
  const invitedAt = new Date('2026-10-27T09:00:00Z')

  it('a colleague who arrives from the invitation gets a greeting that names her company and her first thing to do', () => {
    expect(welcomeFor({ company: 'Brightmoor Staffing', role: 'Account Manager', invitedAt, asked: false, recommended: true, now: NOW }))
      .toEqual({ says: 'Welcome to Brightmoor Staffing, as Account Manager. Your first thing to do is the recommendation above.' })
    const nothing = welcomeFor({ company: 'Northbend Athletic', role: 'AP Clerk', invitedAt, asked: false, recommended: false, now: NOW, today: '/dashboard/program' })
    expect(nothing?.says).toBe('Welcome to Northbend Athletic, as AP Clerk. Nothing waits on you yet. Start on Today: the company’s work is there, and anything for you arrives here first.')
    expect(nothing?.links).toEqual([{ text: 'Today', href: '/dashboard/program' }])
    expect(voiceBreaks(nothing!.says)).toEqual([])
  })

  it('the welcome is said only until she asks something, and only for two weeks after the invitation', () => {
    expect(welcomeFor({ company: 'Brightmoor Staffing', role: null, invitedAt, asked: true, recommended: false, now: NOW })).toBeNull()
    const late = new Date(invitedAt.getTime() + (NEW_ARRIVAL_DAYS + 1) * 86_400_000)
    expect(welcomeFor({ company: 'Brightmoor Staffing', role: null, invitedAt, asked: false, recommended: false, now: late })).toBeNull()
    expect(welcomeFor({ company: 'Brightmoor Staffing', role: null, invitedAt: null, asked: false, recommended: false, now: NOW })).toBeNull()
  })

  it('the greeting route says the welcome first under the headline, never for a demo seat or a seat that keeps no thread', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/route.ts'), 'utf8')
    expect(src).toMatch(/caller\.company\.isDemo \|\| !thread\.saved\) return answer/)
    expect(src).toContain('more: [line, ...(answer.more ?? [])]')
  })
})

describe('the rescue link where no email can be sent', () => {
  const lines = ['Confirm your email to finish signing up for Etyme.']
  const link = 'https://etyme.test/verify?token=abc'

  it('where no email can be sent, the confirmation link is kept on the notice so a stuck sign-up can be rescued; where email is sent, it is never kept', () => {
    expect(recordedBody(lines, link, 'NOT_CONFIGURED')).toBe(`${lines[0]}\n\n${LINK_KEPT}\n${link}`)
    expect(recordedBody(lines, link, 'SENT')).toBe(`${lines[0]}\n\n${LINK_NOT_KEPT}`)
    expect(recordedBody(lines, link, 'SENT')).not.toContain('token=')
  })

  it('a send that failed with a provider set up keeps no link either, because the link lives in the mailbox', () => {
    expect(recordedBody(lines, link, 'FAILED')).not.toContain(link)
  })

  it('a kept link is never a line in anybody’s list or greeting', () => {
    const kept = { type: 'SYSTEM', title: 'Ama Owusu invited you to Brightmoor Staffing', body: recordedBody(lines, link, 'NOT_CONFIGURED') }
    expect(isAccountMail(kept)).toBe(true)
    expect(isAccountMail({ ...kept, type: ACCOUNT_MAIL })).toBe(true)
    expect(JSON.stringify(bellShows())).toContain(LINK_KEPT)
  })
})
