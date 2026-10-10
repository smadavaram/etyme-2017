import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as createContract } from '@/app/api/contracts/route'
import { POST as extend } from '@/app/api/contracts/[id]/extend/route'

/**
 * The founder's decision, 2026-10-06: a line booked past the client's
 * time limit is refused, at every door that writes or moves an end date.
 * The rule is the client's own. Here it is set one month past the
 * seeded line's own end, so the person is inside the limit today and
 * any line running months past that end crosses it.
 */
const SUPPLIER = 'world-techpeple@demo.etyme.local'
const MONTH_NAME = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec) \d{1,2}, \d{4}/

describe('a contract booked past the client’s time limit', () => {
  let sell: { id: string; personId: string; clientCompanyId: string; endClientCompanyId: string | null; companyId: string; endDate: Date | null }

  beforeAll(async () => {
    await freshWorld()
    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-techpeple' } })
    sell = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.id, state: 'IN_PROGRESS', endDate: { not: null } },
      select: { id: true, personId: true, clientCompanyId: true, endClientCompanyId: true, companyId: true, endDate: true },
    })
    const clientId = sell.endClientCompanyId ?? sell.clientCompanyId
    const lines = await prisma.sellContract.findMany({
      where: { personId: sell.personId, OR: [{ endClientCompanyId: clientId }, { clientCompanyId: clientId, endClientCompanyId: null }] },
      select: { startDate: true },
    })
    const first = lines.reduce((a, l) => (l.startDate < a ? l.startDate : a), sell.endDate!)
    const monthsToEnd =
      (sell.endDate!.getUTCFullYear() - first.getUTCFullYear()) * 12 + (sell.endDate!.getUTCMonth() - first.getUTCMonth())
    const capMonths = monthsToEnd + 2
    await prisma.governancePolicy.create({
      data: {
        companyId: clientId,
        name: 'A time limit just past the line',
        rules: {
          create: {
            ruleType: 'TENURE_CAP',
            enforcementMode: 'BLOCK',
            parameters: { maxMonths: capMonths },
            description: `Nobody stays past ${capMonths} months`,
          },
        },
      },
    })
  }, 180_000)

  it('a contract booked past the client’s time limit is refused in a sentence naming the date, on the contracts route', async () => {
    as(SUPPLIER)
    const start = new Date()
    const end = new Date(sell.endDate!)
    end.setUTCMonth(end.getUTCMonth() + 6)
    const r = await json(
      await createContract(req('POST', '/api/contracts', {
        personId: sell.personId,
        companyId: sell.companyId,
        clientCompanyId: sell.clientCompanyId,
        endClientCompanyId: sell.endClientCompanyId ?? undefined,
        billRate: 9500,
        billCurrency: 'USD',
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        payRate: 8000,
        payCurrency: 'USD',
        contractType: 'W2',
      }))
    )
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('TIME_LIMIT')
    expect(r.body.error.message).toMatch(MONTH_NAME)
  })

  it('a contract booked past the client’s time limit is refused in a sentence naming the date, on extend', async () => {
    as(SUPPLIER)
    const r = await json(
      await extend(req('POST', `/api/contracts/${sell.id}/extend`, { months: 6 }), {
        params: Promise.resolve({ id: sell.id }),
      })
    )
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('TIME_LIMIT')
    expect(r.body.error.message).toMatch(MONTH_NAME)
    // And the end date did not move.
    const after = await prisma.sellContract.findUniqueOrThrow({ where: { id: sell.id } })
    expect(after.endDate!.toISOString()).toBe(sell.endDate!.toISOString())
  })
})
