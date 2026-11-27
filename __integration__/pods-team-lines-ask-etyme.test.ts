import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { as, req, json, prisma, freshWorld } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { POST as askPost } from '@/app/api/conversations/twin/route'

/**
 * Ask Etyme and the client's team lines (record 120, pods, plan step 8).
 * Every question is asked through the real chat route as the client's seat.
 * A team sold as outcome work is never read by the client: no member name,
 * id or rate. A team on site is read by name and standing, never a rate.
 */
const D = '@demo.etyme.local'
const SELLER_OWNER = `world-brightmoor${D}`
const NAMES = ['Ada Quillfeather', 'Bram Oakhollow']
const s: Record<string, any> = {}
const sale = (tx: Prisma.TransactionClient, o: Partial<SellPodInput> = {}) => sellPod(tx, { ...s.input, ...o })

const ask = async (email: string, text: string) => {
  as(email)
  const r = await json(await askPost(req('POST', '/api/conversations/twin', { text })))
  expect(r.status, text).toBe(200)
  return r.body.data
}
const everything = (x: unknown) => JSON.stringify(x)
const QUESTIONS = [
  'Which weeks do I need to sign?',
  'Who is working at my sites?',
  'Which firms and people do we work with?',
  'Who is near the time limit?',
]

async function fileWeeks(projectOrderId: string, people: string[], day: number) {
  const lines = await prisma.sellContract.findMany({ where: { projectOrderId }, select: { id: true, personId: true } })
  await prisma.sellContract.updateMany({ where: { projectOrderId }, data: { state: 'IN_PROGRESS', startDate: new Date(Date.UTC(2026, 9, 1)) } })
  for (const l of lines) {
    await prisma.timesheet.create({
      data: {
        sellContractId: l.id, personId: l.personId, periodStart: new Date(Date.UTC(2027, 0, day)), periodEnd: new Date(Date.UTC(2027, 0, day + 6)),
        days: { [`2027-01-0${day + 1}`]: 8 }, totalHours: 8, status: 'SUBMITTED', submittedAt: new Date(),
      },
    })
  }
  return people
}

describe('Ask Etyme never tells the client about a team sold as outcome work, and tells it who is on site', () => {
  beforeAll(async () => {
    await freshWorld()
    const seller = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-northbend' }, select: { id: true } })
    s.seller = seller.id
    s.client = client.id
    const acceptor = await prisma.person.findFirstOrThrow({ where: { name: 'Marcus Oyelaran', contexts: { some: { companyId: client.id, revokedAt: null } } }, select: { id: true, primaryEmail: true } })
    s.clientEmail = acceptor.primaryEmail
    const people: string[] = []
    for (const name of NAMES) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.ae@seed.etyme.invalid` } })
      await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
      people.push(p.id)
    }
    s.people = people
    const pod = await prisma.pod.create({
      data: {
        companyId: seller.id, name: 'Data platform team', pricing: 'RATE_CARD', currency: 'USD',
        roles: { create: [
          { title: 'Data engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: people[0] } } },
          { title: 'Analyst', headcount: 1, rateCents: 9_000, sortOrder: 1, members: { create: { personId: people[1] } } },
        ] },
      },
      select: { id: true },
    })
    s.input = {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: acceptor.id,
      projectName: 'Data platform build', kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD', decidedBy: acceptor.id,
      deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date(Date.UTC(2027, 2, n * 7)) })),
    } satisfies SellPodInput
    const r = await prisma.$transaction((tx) => sale(tx))
    if (!r.ok) throw new Error(JSON.stringify(r))
    s.outcome = r
    await fileWeeks(r.projectOrderId, people, 3)
  }, 240_000)

  it('a team sold as outcome work shows no member name, id or rate in any answer Ask Etyme gives the client', async () => {
    for (const q of QUESTIONS) {
      const text = everything(await ask(s.clientEmail, q))
      for (const n of NAMES) expect(text, q).not.toContain(n)
      for (const id of s.people) expect(text, q).not.toContain(id)
      expect(text, q).not.toMatch(/\$0(\.00)?\s*\/\s*h|150\.00|90\.00/)
    }
  })

  it('a member’s week on outcome work is never listed to the client as waiting for its signature', async () => {
    const data = await ask(s.clientEmail, 'Which weeks do I need to sign?')
    expect(everything(data)).not.toContain('Quillfeather')
    const memberWeeks = await prisma.timesheet.findMany({ where: { personId: { in: s.people } }, select: { id: true } })
    expect(memberWeeks.length).toBeGreaterThan(0)
    for (const w of memberWeeks) expect(everything(data)).not.toContain(w.id)
  })

  it('asking Ask Etyme for an outcome member by name does not find her for the client', async () => {
    const data = await ask(s.clientEmail, 'Show me the hours of Ada Quillfeather')
    expect(everything(data)).not.toContain('Ada Quillfeather’s')
    expect(everything(data)).not.toMatch(/\/dashboard\/(placements|contracts|weeks)\//)
  })

  it('the selling firm still reads the member lines it sells', async () => {
    const data = await ask(SELLER_OWNER, 'Who rolls off in the next 30 days?')
    expect(data.answer).toBeTruthy()
  })

  it('a team on site is read by the client by name, and never at a rate', async () => {
    const r = await prisma.$transaction((tx) => sale(tx, { onSite: true, projectName: 'Data platform on site' }))
    if (!r.ok) throw new Error(JSON.stringify(r))
    await fileWeeks(r.projectOrderId, s.people, 10)
    const data = await ask(s.clientEmail, 'Which weeks do I need to sign?')
    const text = everything(data)
    expect(text).toContain('Quillfeather')
    expect(text).not.toMatch(/150\.00|90\.00|\$0(\.00)?\s*\/\s*h/)
  })
})
