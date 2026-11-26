import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as decisions } from '@/app/api/decisions/route'
import { GET as oneCard } from '@/app/api/conversations/one-card/route'

/**
 * A list that is empty on the seeded world is a bug (CLAUDE.md). The photo
 * walk of 2026-11-26 read "Nothing needs you today" on every seeded
 * supplier seat though the seed holds weeks, bills and submissions.
 */
const D = '@demo.etyme.local'
const SUPPLIER = 'brightmoor'

describe('The seeded supplier seats read their own queue', () => {
  let seats: { email: string; role: string }[] = []
  beforeAll(async () => {
    await freshWorld()
    const rows = await prisma.context.findMany({
      where: { company: { slug: { startsWith: `world-${SUPPLIER}` } }, revokedAt: null, person: { primaryEmail: { endsWith: D } } },
      select: { person: { select: { primaryEmail: true } }, role: { select: { name: true } } },
    })
    seats = rows.map((r) => ({ email: r.person.primaryEmail, role: r.role?.name ?? 'none' }))
  })

  it('every seeded supplier role with work owes at least one card on the seeded world', async () => {
    const empty: string[] = []
    const report: string[] = []
    for (const s of seats) {
      as(s.email)
      const res = await json(await decisions(req('GET', '/api/decisions')))
      const list = (res.body?.data?.decisions ?? []) as any[]
      report.push(`${s.role} ${s.email}: ${res.status} ${list.length} ${[...new Set(list.map((d) => d.type))].join(',')}`)
      if (list.length === 0) empty.push(s.role)
    }
    console.log(report.join('\n'))
    expect(seats.length).toBeGreaterThan(0)
    expect(empty).toEqual([])
  })

  // Record 130: one person, one job, one next card. The same single card on
  // every seat is a list that is empty of the seat's own work. The Account
  // Manager's job request is due in 12 days, so a late submission she may
  // also act on rightly ranks first; the next test proves her card is there.
  it('each seeded supplier role\u2019s first card is its own kind of work', async () => {
    const OWN: Record<string, string> = {
      Recruiter: 'SUBMISSION_REVIEW',
      'AP & Payroll': 'TIMESHEET_APPROVAL',
      'Accounts Receivable': 'INVOICE_OVERDUE',
      HR: 'PAPER_TO_CHECK',
      'Contract Manager': 'CONTRACT_PAPERING',
    }
    const got: Record<string, string> = {}
    const report: string[] = []
    for (const s of seats.filter((x) => OWN[x.role])) {
      as(s.email)
      const res = await json(await oneCard(req('GET', '/api/conversations/one-card')))
      const cards = (res.body?.data?.cards ?? []) as { type: string; score: number }[]
      report.push(`${s.role}: ${cards.map((c) => `${c.type}=${c.score.toFixed(3)}`).join(' ')}`)
      got[s.role] = cards[0]?.type ?? 'none'
    }
    console.log(report.join('\n'))
    expect(got).toEqual(OWN)
  })

  it('the Account Manager is shown the job requests clients sent the firm', async () => {
    const am = seats.find((x) => x.role === 'Account Manager')
    expect(am, 'the seed seats an Account Manager').toBeTruthy()
    as(am!.email)
    const res = await json(await oneCard(req('GET', '/api/conversations/one-card')))
    const types = ((res.body?.data?.cards ?? []) as { type: string }[]).map((c) => c.type)
    expect(types).toContain('JOB_REQUEST_ANSWER')
  })
})
