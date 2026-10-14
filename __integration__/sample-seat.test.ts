import { describe, it, expect, beforeAll, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The integration config leaves JSX in the classic runtime; the pages are
// drawn here as Next would draw them on the server.
;(globalThis as any).React = React

// Nobody is signed in: the session door answers "nobody" rather than
// reaching for a request scope a test does not have.
vi.mock('next-auth/next', () => ({ getServerSession: async () => null }))

import { NextRequest } from 'next/server'
import { req, freshWorld, prisma, as } from './harness'
import { asSampleSeat, getCallerContext } from '@/lib/api-context'
import { SAMPLE_COOKIE, SAMPLE_COOKIE_VALUE, SAMPLE_REFUSAL, EMBED_STEPS } from '@/lib/sample-seat'
import { readStep } from '@/app/embed/demo/read'
import EmbedStepPage from '@/app/embed/demo/[step]/page'
import EmbedDemoPage from '@/app/embed/demo/page'

import { GET as program } from '@/app/api/program/route'
import { POST as approveWeek } from '@/app/api/timesheets/[id]/approve/route'
import { PATCH as setWeek } from '@/app/api/settings/week/route'
import { POST as raiseRequisition } from '@/app/api/requisitions/route'

/**
 * The product inside the home page, read-only (founder, 2026-10-14).
 *
 * Anybody, with no account, reads the seeded Northbend Athletic program
 * manager's screens through a shared seat, and nothing they do can touch
 * the seeded world: every write is refused at the one caller check, in
 * one sentence that offers their own demo and sign-up.
 */

const SAMPLE = { cookie: `${SAMPLE_COOKIE}=${SAMPLE_COOKIE_VALUE}` }

/** What a stranger could have changed, counted and read back whole. */
async function theWorld() {
  const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
  const pm = await prisma.context.findFirstOrThrow({
    where: { companyId: northbend.id, role: { name: 'Program Manager' } },
    select: { lastUsedAt: true },
  })
  return {
    northbend: JSON.stringify(northbend),
    pmLastUsed: pm.lastUsedAt?.toISOString() ?? null,
    requirements: await prisma.requirement.count(),
    timesheets: await prisma.timesheet.count(),
    signed: await prisma.timesheet.count({ where: { status: 'APPROVED' } }),
    waiting: await prisma.timesheet.count({ where: { status: 'SUBMITTED' } }),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
    automation: await prisma.automationLog.count(),
    events: await prisma.event.count(),
  }
}

let weekId = ''

describe('the shared sample seat the home page frames', () => {
  beforeAll(async () => {
    await freshWorld()
    as('')
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { status: 'SUBMITTED', person: { name: 'Omar Haddad' } },
      select: { id: true },
    })
    weekId = week.id
  }, 120_000)

  it('a stranger with no account can read every embedded screen: the program, job requests and suppliers, submissions, the weeks waiting, and the invoice receipts', async () => {
    as('')
    for (const step of EMBED_STEPS) {
      const reads = await readStep(step)
      for (const [name, r] of Object.entries(reads)) {
        expect(r.ok, `${step}: ${name} said ${'says' in r ? r.says : ''}`).toBe(true)
      }
    }
    const pages: Record<string, string> = {}
    for (const step of EMBED_STEPS) pages[step] = renderToStaticMarkup(await EmbedStepPage({ params: { step } }))
    expect(pages.overview).toContain('Helena Marsh')
    expect(pages.source).toContain('HCM integration lead')
    expect(pages.source).toContain('Teleworld Solutions')
    expect(pages.submit).toContain('Daniel Okafor')
    expect(pages.approve).toContain('Omar Haddad')
    expect(pages.approve).toContain('45h claimed on a 40h-a-week job.')
    expect(pages.pay).toContain('Lucía Fernández: Bills 41.5 h; 40 h were signed')
    for (const html of Object.values(pages)) expect(html).toContain('Sample company')
  }, 60_000)

  it('the frame opens on the program dashboard: every contractor on site, the supplier, and the rate the client pays', async () => {
    as('')
    const html = renderToStaticMarkup(await EmbedDemoPage())
    expect(html).toContain('>Program<')
    expect(html).toContain('Helena Marsh')
    expect(html).toContain('Brightmoor Staffing')
    expect(html).toMatch(/\$1\d\d\/hr/)
    // No menus: the screen and nothing else.
    expect(html).not.toMatch(/<nav[\s>]/)
  }, 60_000)

  it('a screen that is not one of the five is not found rather than drawn empty', async () => {
    await expect(EmbedStepPage({ params: { step: 'payroll' } })).rejects.toThrow()
  })

  it('a visitor signed in somewhere else still sees the sample in the frame, never their own company', async () => {
    as('world-cavanaugh-programme@demo.etyme.local')
    const reads = await readStep('overview')
    as('')
    expect(reads.program.ok).toBe(true)
    expect((reads.program as any).data.client.name).toBe('Northbend Athletic')
  }, 60_000)

  it('the sample cookie alone, with no account, reads the program as the Northbend program manager', async () => {
    as('')
    const res = await program(req('GET', '/api/program', undefined, SAMPLE))
    expect(res.status).toBe(200)
    expect((await res.json()).data.client.name).toBe('Northbend Athletic')
  }, 60_000)

  it('every write from the sample seat is refused with the one sentence and its two doors, on three routes, and the seeded world is unchanged', async () => {
    as('')
    const before = await theWorld()
    const answers = [
      await approveWeek(req('POST', `/api/timesheets/${weekId}/approve`, {}, SAMPLE), { params: { id: weekId } } as any),
      await setWeek(req('PATCH', '/api/settings/week', { daysOff: [5, 6], reason: 'try' }, SAMPLE)),
      await raiseRequisition(req('POST', '/api/requisitions', { title: 'A stranger’s job', headcount: 1 }, SAMPLE)),
    ]
    for (const res of answers) {
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('SAMPLE_READ_ONLY')
      expect(body.error.message).toBe(SAMPLE_REFUSAL)
      expect(body.error.actions.map((a: any) => a.label)).toEqual(['Open your own demo', 'Sign up'])
    }
    expect(await theWorld()).toEqual(before)
  }, 60_000)

  it('reading every screen as the sample seat changes nothing, not even the program manager’s own last use, so the access review does not read strangers as her', async () => {
    as('')
    const before = await theWorld()
    await program(req('GET', '/api/program', undefined, SAMPLE))
    for (const step of EMBED_STEPS) await readStep(step)
    expect(await theWorld()).toEqual(before)
  }, 60_000)

  it('the sample seat cannot read another company’s program', async () => {
    as('')
    const other = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corning' }, select: { id: true } })
    const res = await program(req('GET', `/api/program?clientCompanyId=${other.id}`, undefined, SAMPLE))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(await res.json())).not.toContain('Cavanaugh Glassworks')
  }, 60_000)

  it('the read-only flag cannot be lifted by a request header or a body field', async () => {
    as('')
    const owner = await prisma.context.findFirstOrThrow({
      where: { company: { slug: 'world-nike' }, role: { name: 'Owner' } },
      select: { id: true },
    })
    const res = await approveWeek(
      req('POST', `/api/timesheets/${weekId}/approve`, { readOnly: false, sample: false }, {
        ...SAMPLE, 'x-read-only': 'false', 'x-etyme-sample': 'off', 'x-context-id': owner.id,
      }),
      { params: { id: weekId } } as any
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe(SAMPLE_REFUSAL)
  }, 60_000)

  it('and cannot be claimed by one either: a header or a body naming the sample, with no cookie, is nobody', async () => {
    as('')
    const res = await program(req('GET', '/api/program', undefined, {
      'x-etyme-sample': SAMPLE_COOKIE_VALUE, 'x-read-only': 'true',
    }))
    expect(res.status).toBe(401)
  }, 60_000)

  it('somebody signed in who carries the sample cookie is themselves, never the sample', async () => {
    as('world-nike-programme@demo.etyme.local')
    const res = await approveWeek(req('POST', `/api/timesheets/${weekId}/approve`, {}, SAMPLE), { params: { id: weekId } } as any)
    as('')
    const body = await res.json()
    expect(body.error?.code).not.toBe('SAMPLE_READ_ONLY')
  }, 60_000)

  it('the sample seat fails closed where no method can be read: a caller resolved with no request is refused', async () => {
    as('')
    const { caller, error } = await asSampleSeat(() => getCallerContext())
    expect(caller).toBeNull()
    expect(error!.status).toBe(403)
    expect((await error!.json()).error.message).toBe(SAMPLE_REFUSAL)
  })
})
