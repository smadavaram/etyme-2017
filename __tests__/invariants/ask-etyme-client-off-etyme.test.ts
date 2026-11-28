/**
 * The walk of 2026-11-14: Ask Etyme, the worker's first screen, told a
 * contractor whose client is not on Etyme that her week "is waiting for
 * <client> to sign". Nobody at that client can sign in Etyme. Her own page
 * says the client approves in its own system and that she attaches the
 * timesheet it approved; the chat now says the same, from the same words,
 * with the same links.
 *
 * The world is made here: her own doors are stood in for, and the waiting
 * row is built by the page's own reader (`waitingWeek`), so the words the
 * chat says are the words her page says. The count-only read is used, so
 * no database is read and a week's last day reads as its first ("Nov 8").
 */

import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const work = vi.hoisted(() => ({ body: null as any }))
const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/alerts', () => ({ reportError: vi.fn(async () => undefined) }))
vi.mock('@/app/api/me/work/route', () => ({ GET: vi.fn(async () => ok(work.body)) }))
vi.mock('@/app/api/me/papers/route', () => ({ GET: vi.fn(async () => ok({ papers: [] })) }))
vi.mock('@/app/api/me/pipeline/route', () => ({ GET: vi.fn(async () => ok({ submissions: [], interviewsAhead: [] })) }))
vi.mock('@/app/api/me/benches/route', () => ({ GET: vi.fn(async () => ok(null)) }))

import { waitingWeek } from '@/lib/consultant-portfolio'
import { workerFacts } from '@/app/api/conversations/twin/worker-read'
import { weekStandsSays, stageWord, latestWeekLine, respondWorker } from '@/app/api/conversations/twin/worker'

const NOW = new Date('2026-11-14T15:00:00Z')
const CALLER = { person: { id: 'p-mara' }, context: { type: 'CONSULTANT' }, company: { name: 'Mara Quill', kind: 'CONSULTANT_CORP' } } as any
const request = new NextRequest('http://localhost/api/conversations/twin')

/** Her week of Nov 8 to 14, sent today, waiting for the client; `onEtyme` says whether the client is on Etyme. */
function worldWith(onEtyme: boolean) {
  const row = waitingWeek({
    id: 'ts-nov8',
    periodStart: new Date('2026-11-08T00:00:00Z'),
    periodEnd: new Date('2026-11-14T00:00:00Z'),
    hours: 40,
    submittedAt: NOW,
    signers: [
      { role: 'CLIENT_APPROVAL', companyId: 'c-halden', name: 'Halden Foods', offEtyme: !onEtyme, signedAt: null },
      { role: 'EMPLOYER_ACCEPTANCE', companyId: 'c-brightmoor', name: 'Brightmoor Staffing', signedAt: null },
    ] as any,
    clientApproval: null,
  }, NOW)!
  work.body = {
    placements: [],
    filing: [],
    due: [],
    timesheets: [{ id: 'ts-nov8', periodStart: '2026-11-08', status: 'SUBMITTED', hours: 40, state: { kind: 'WAITING', waitingOn: 'Halden Foods' } }],
    owed: { weeks: [{ ...row, payer: row.employer }] },
  }
  return row
}

describe('a week waiting for a client not on Etyme, in Ask Etyme', () => {
  it('a worker whose client is not on Etyme is told in Ask Etyme what her own page says, and never that the client signs it', async () => {
    const row = worldWith(false)
    const f = await workerFacts(CALLER, request, NOW, { forCount: true })
    const week = f.sent.find((w) => w.id === 'ts-nov8')!
    const says = weekStandsSays(week)
    expect(says).toBe(`Your week of Nov 8: ${row.says}`)
    expect(says).toContain('Halden Foods is not on Etyme, so nothing was sent to them.')
    expect(says).toContain('Attach the timesheet Halden Foods approved')
    expect(says).not.toMatch(/to sign/)
    expect(stageWord(week)).toBe('Waiting for Halden Foods to approve')
  })

  it('her latest week in Ask Etyme offers the attach link her page offers, before asking the client by email', async () => {
    const row = worldWith(false)
    const f = await workerFacts(CALLER, request, NOW, { forCount: true })
    const line = latestWeekLine(f)!
    expect(line.links).toEqual(row.links.map((l) => ({ text: l.says, href: l.href })))
    expect(line.links![0].text).toBe('Attach the timesheet Halden Foods approved')
    expect(line.links![1].text).toBe('Ask Halden Foods to approve by email')
  })

  it('asked whether her week is approved, Ask Etyme answers with the attach link for a client not on Etyme', async () => {
    worldWith(false)
    const f = await workerFacts(CALLER, request, NOW, { forCount: true })
    const reply: any = await respondWorker('Is my week approved?', { facts: async () => f })
    expect(reply.says).not.toMatch(/to sign/)
    expect(reply.links[0].label).toBe('Attach the timesheet Halden Foods approved')
  })

  it('a client on Etyme still reads as waiting for them to sign, with the one link to the week', async () => {
    worldWith(true)
    const f = await workerFacts(CALLER, request, NOW, { forCount: true })
    const week = f.sent.find((w) => w.id === 'ts-nov8')!
    expect(week.offEtyme ?? null).toBeNull()
    expect(weekStandsSays(week)).toBe('Your week of Nov 8 is waiting for Halden Foods to sign.')
    expect(stageWord(week)).toBe('Waiting for Halden Foods to sign')
    expect(latestWeekLine(f)!.links).toEqual([{ text: 'Your week of Nov 8', href: '/dashboard/weeks/ts-nov8' }])
  })

  it('every sentence Ask Etyme says about a client not on Etyme is under twenty-five words', async () => {
    worldWith(false)
    const f = await workerFacts(CALLER, request, NOW, { forCount: true })
    for (const sentence of weekStandsSays(f.sent[0]).split(/(?<=\.)\s+/)) {
      expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25)
    }
  })
})
