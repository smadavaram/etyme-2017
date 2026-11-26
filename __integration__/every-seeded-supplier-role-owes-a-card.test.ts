import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as decisions } from '@/app/api/decisions/route'

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
})
