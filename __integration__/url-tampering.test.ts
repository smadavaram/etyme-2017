import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as payroll } from '@/app/api/payroll/route'
import { GET as submissions } from '@/app/api/submissions/route'
import { GET as holidays } from '@/app/api/holidays/route'

/**
 * You cannot read another company's book by editing the URL.
 *
 * `resolveClientCompany` was written because routes took
 * `?clientCompanyId=` straight from the query string, so any signed-in
 * user could read any client's tenure ledger by changing it. That helper
 * fixed the seven routes it was applied to. It was never applied to the
 * rest, and the same shape survived in three of them.
 *
 * The permission check is not the defence. A vendor owner holds `*` in
 * their own company, so `payroll.read` passes and the route then reads
 * whichever company the URL names. Authorisation that authenticates the
 * caller and then trusts the caller's parameter is not authorisation.
 *
 * Each leak gets two tests: the tampered read must be refused, and the
 * honest read must still work. A fix that closes the hole by breaking
 * the legitimate case is not a fix, and that is the failure mode this
 * class of change actually has.
 */
/** The submission list's row shape — company ids arrive nested, not flat. */
interface Row {
  rate?: number | null
  fromCompany?: { id: string }
  toCompany?: { id: string }
}

describe('reading another company by editing the URL', () => {
  let cloudepa: { id: string; seat: string }
  let computerSystems: { id: string; seat: string }
  let placedPerson: { id: string; name: string }

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const co = async (slug: string) => {
      const c = await prisma.company.findFirstOrThrow({ where: { slug } })
      return { id: c.id, seat: `${slug}@demo.etyme.local` }
    }
    cloudepa = await co('world-cloudepa')
    computerSystems = await co('world-computer-systems')

    // Somebody CloudEPA placed. Their submissions carry a rate, and the
    // chain above them carries a different one.
    const s = await prisma.submission.findFirstOrThrow({
      where: { fromCompanyId: computerSystems.id },
      include: { person: true },
    })
    placedPerson = { id: s.personId, name: s.person.name }
  }, 180_000)

  // ── Payroll ────────────────────────────────────────────────────────

  it('a vendor cannot read another vendor\'s payroll by naming them in the URL', async () => {
    as(cloudepa.seat)
    const res = await json(
      await payroll(req('GET', `/api/payroll?companyId=${computerSystems.id}`))
    )
    expect(res.status).not.toBe(200)
  })

  it('a vendor can still read its own payroll', async () => {
    as(cloudepa.seat)
    const res = await json(await payroll(req('GET', '/api/payroll')))
    expect(res.status).toBe(200)
  })

  it('naming your own company in the URL is the same as not naming one', async () => {
    as(cloudepa.seat)
    const named = await json(
      await payroll(req('GET', `/api/payroll?companyId=${cloudepa.id}`))
    )
    expect(named.status).toBe(200)
  })

  // ── Submissions ────────────────────────────────────────────────────

  it('a vendor cannot read another vendor\'s submissions by naming them in the URL', async () => {
    as(cloudepa.seat)
    const res = await json(
      await submissions(
        req('GET', `/api/submissions?companyId=${computerSystems.id}&direction=sent`)
      )
    )
    const rows: Row[] = res.body?.data?.submissions ?? []
    const leaked = rows.filter((r) => r.fromCompany?.id === computerSystems.id)
    expect(leaked).toEqual([])
  })

  it('a vendor cannot read one person\'s submissions across every company', async () => {
    as(cloudepa.seat)
    const res = await json(
      await submissions(req('GET', `/api/submissions?personId=${placedPerson.id}`))
    )
    const rows: Row[] = res.body?.data?.submissions ?? []
    // Every row that comes back must involve the caller. A person's whole
    // submission history across the market is not CloudEPA's to read.
    const foreign = rows.filter(
      (r) => r.fromCompany?.id !== cloudepa.id && r.toCompany?.id !== cloudepa.id
    )
    expect(foreign).toEqual([])
  })

  it('a vendor can still read its own submissions', async () => {
    as(cloudepa.seat)
    const res = await json(
      await submissions(req('GET', `/api/submissions?companyId=${cloudepa.id}&direction=sent`))
    )
    expect(res.status).toBe(200)
  })

  it('a rate on a submission never belongs to a company the reader is not party to', async () => {
    as(cloudepa.seat)
    const res = await json(
      await submissions(req('GET', `/api/submissions?companyId=${computerSystems.id}`))
    )
    const rows: Row[] = res.body?.data?.submissions ?? []
    for (const r of rows) {
      if (r.rate === undefined || r.rate === null) continue
      expect([r.fromCompany?.id, r.toCompany?.id]).toContain(cloudepa.id)
    }
  })

  // ── Holidays ───────────────────────────────────────────────────────

  it('a vendor cannot read another company\'s holiday calendar by naming them in the URL', async () => {
    as(cloudepa.seat)
    const res = await json(
      await holidays(req('GET', `/api/holidays?companyId=${computerSystems.id}`))
    )
    expect(res.status).not.toBe(200)
  })

  it('a vendor can still read its own holiday calendar', async () => {
    as(cloudepa.seat)
    const res = await json(await holidays(req('GET', '/api/holidays')))
    expect(res.status).toBe(200)
  })
})
