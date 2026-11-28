import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { as, req, json, prisma, resetDatabase } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { GET as apGet } from '@/app/api/ap/route'
import { GET as rateHistoryGet } from '@/app/api/rate-history/route'
import { GET as receiptOptionsGet } from '@/app/api/ap/receipts/options/route'
import { GET as profitabilityGet } from '@/app/api/profitability/route'
import { readPodMargin } from '@/lib/money/pod-margin-read'
import { clientLinesFrom } from '@/lib/money/paid-line'
import { readOwnStatement } from '@/lib/money/tenant-statement'

/**
 * Every client money reader of a sold team, called as the client's own seat
 * (record 120, "Pods: member lines and the client"). A team sold as outcome
 * work is never read by the client: no member name, id or rate on any page.
 * A team marked on site is read as any contractor on the client's site: by
 * name, never a rate. The seller's own seat reads its lines as before.
 */
const CLIENT = 'pmr-client@client.example'
const SELLER = 'pmr-owner@seller.example'
const s: Record<string, any> = {}
const OUTCOME = ['Ada Quillfeather', 'Bram Oakhollow']
const ONSITE = ['Cleo Fenwhistle', 'Dov Marlowe']
const get = async (fn: any, url: string, email = CLIENT) => { as(email); return json(await fn(req('GET', url))) }
const idRoute = async (fn: any, email: string, id: string, body?: unknown) => { as(email); return json(await fn(req('POST', '/x', body ?? {}), { params: Promise.resolve({ id }) })) }
const mention = (body: unknown, needles: string[]) => needles.filter((n) => JSON.stringify(body).includes(n))

async function team(companyId: string, names: string[]) {
  const ids: string[] = []
  for (const name of names) {
    const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.pmr@seed.etyme.invalid` } })
    await prisma.context.create({ data: { personId: p.id, companyId, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
    ids.push(p.id)
  }
  const pod = await prisma.pod.create({
    data: {
      companyId, name: `${names[0]} team`, pricing: 'RATE_CARD', currency: 'USD',
      roles: { create: names.map((_, i) => ({ title: ['Data engineer', 'Analyst'][i], headcount: 1, rateCents: 15_000 - i * 6_000, sortOrder: i, members: { create: { personId: ids[i] } } })) },
    },
    select: { id: true },
  })
  return { ids, podId: pod.id }
}

describe('the client’s money readers never read a member of a team sold as outcome work', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Harrowgate Foods', slug: 'pmr-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'pmr-seller', kind: 'VENDOR', currency: 'USD' } })
    Object.assign(s, { client: client.id, seller: seller.id })
    const cRole = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    const sRole = await prisma.role.create({ data: { companyId: seller.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    for (const [email, name, companyId, roleId, type] of [
      [CLIENT, 'Imogen Daleford', client.id, cRole.id, 'CLIENT_CONTACT'],
      [SELLER, 'Mira Osei', seller.id, sRole.id, 'EMPLOYEE'],
    ] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type, companyId, roleId } })
    }
    const sale = (tx: Prisma.TransactionClient, t: { podId: string }, o: Partial<SellPodInput>) => sellPod(tx, {
      podId: t.podId, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: s[CLIENT], decidedBy: s[CLIENT],
      projectName: 'Data platform build', kind: 'MILESTONE', priceCents: 3_000_000, currency: 'USD',
      deliverables: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, amountCents: 1_000_000, dueOn: new Date(Date.now() + n * 14 * 86_400_000) })),
      ...o,
    })
    const a = await team(seller.id, OUTCOME)
    const b = await team(seller.id, ONSITE)
    s.outcomeIds = a.ids
    s.onSiteIds = b.ids
    const one = await prisma.$transaction((tx) => sale(tx, a, {}))
    const two = await prisma.$transaction((tx) => sale(tx, b, { projectName: 'Platform on site', onSite: true }))
    if (!one.ok || !two.ok) throw new Error(JSON.stringify([one, two]))
    s.one = one
    s.two = two
    // Both teams have started, a month ago, and each member filed a week.
    const start = new Date(Date.now() - 35 * 86_400_000)
    await prisma.sellContract.updateMany({ where: { projectOrderId: { in: [one.projectOrderId, two.projectOrderId] } }, data: { state: 'IN_PROGRESS', startDate: start, startConfirmedAt: start } })
    // The seller and the client have signed an agreement, and both teams' lines sit under it.
    const msa = await prisma.masterAgreement.create({ data: { vendorId: seller.id, clientId: client.id, paymentTerms: 30 } })
    await prisma.sellContract.updateMany({ where: { projectOrderId: { in: [one.projectOrderId, two.projectOrderId] } }, data: { msaId: msa.id } })
    s.lines = await prisma.sellContract.findMany({ where: { projectOrderId: { in: [one.projectOrderId, two.projectOrderId] } }, select: { id: true, personId: true, projectOrderId: true } })
    const weekEnd = new Date(Date.now() - 3 * 86_400_000)
    weekEnd.setUTCHours(0, 0, 0, 0)
    weekEnd.setUTCDate(weekEnd.getUTCDate() - weekEnd.getUTCDay() - 1)
    const weekStart = new Date(weekEnd.getTime() - 6 * 86_400_000)
    s.sheets = {}
    for (const l of s.lines) {
      const ts = await prisma.timesheet.create({
        data: {
          sellContractId: l.id, personId: l.personId, periodStart: weekStart, periodEnd: weekEnd,
          days: { [weekStart.toISOString().slice(0, 10)]: 8 }, totalHours: 8, status: 'SUBMITTED', submittedAt: new Date(),
        },
      })
      s.sheets[l.personId] = ts.id
    }
  }, 240_000)

  const clientRead = async (fn: any, url: string) => get(fn, url)

  it('the client’s cash flow never carries a member line of outcome work, and still reads the member on site', async () => {
    const r = await clientRead(apGet, '/api/ap?view=cash-flow&period=90d')
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(500)
    expect(mention(r.body, OUTCOME)).toEqual([])
    expect(mention(r.body, s.outcomeIds)).toEqual([])
    expect(mention(r.body, s.lines.filter((l: any) => l.projectOrderId === s.one.projectOrderId).map((l: any) => l.id))).toEqual([])
  })

  it('the client’s rate history offers no rate change on a member line of outcome work', async () => {
    const r = await clientRead(rateHistoryGet, '/api/rate-history')
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(500)
    expect(mention(r.body, OUTCOME)).toEqual([])
    const ids = (r.body.data?.changeable ?? []).map((c: any) => c.contractId)
    for (const l of s.lines.filter((l: any) => l.projectOrderId === s.one.projectOrderId)) expect(ids).not.toContain(l.id)
  })

  it('the selling firm’s rate history still offers its own member lines, so the filter is the client’s alone', async () => {
    const r = await get(rateHistoryGet, '/api/rate-history', SELLER)
    const ids = (r.body.data?.changeable ?? []).map((c: any) => c.contractId)
    for (const l of s.lines.filter((l: any) => l.projectOrderId === s.one.projectOrderId)) expect(ids).toContain(l.id)
  })

  it('the lines a client pays a supplier on never include a member line of outcome work', async () => {
    const lines = await clientLinesFrom(s.client, s.seller)
    const hidden = s.lines.filter((l: any) => l.projectOrderId === s.one.projectOrderId).map((l: any) => l.id)
    expect(lines.map((l) => l.id).filter((id) => hidden.includes(id))).toEqual([])
    expect(lines.length).toBeGreaterThan(0)
  })

  it('the client’s invoice receipt options never name a member of outcome work', async () => {
    const r = await clientRead(receiptOptionsGet, '/api/ap/receipts/options')
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(500)
    expect(mention(r.body, OUTCOME)).toEqual([])
  })

  it('an Enterprise client’s bill counts a member on site as a contractor and never a member of outcome work', async () => {
    await prisma.company.update({ where: { id: s.client }, data: { edition: 'ENTERPRISE' } })
    const st = await readOwnStatement(s.client)
    expect(st).not.toBeNull()
    const text = JSON.stringify(st)
    expect(mention(text, OUTCOME)).toEqual([])
    expect(st!.activeContractors).toBe(ONSITE.length)
  })

  it('the selling firm’s profitability says a member line of a sold team is billed by deliverable', async () => {
    const r = await get(profitabilityGet, '/api/profitability?by=contract&scope=all', SELLER)
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(500)
    const rows = (r.body.data?.rows ?? []) as any[]
    const team = rows.filter((x) => s.lines.some((l: any) => l.id === x.contractId))
    expect(team.length).toBeGreaterThan(0)
    for (const row of team) {
      expect(row.billedByDeliverable).toBe(true)
      expect(row.billedByDeliverableSays).toBe('This team is billed by deliverable.')
    }
  })

  it('the project margin the selling firm reads says it is billed by deliverable', async () => {
    const project = await prisma.podProject.findFirst({ where: { projectOrderId: s.one.projectOrderId }, select: { id: true } })
    const m = await readPodMargin({ companyId: s.seller, personId: s[SELLER] }, { scope: 'COMPANY', unitIds: [] }, project!.id)
    expect(m.ok).toBe(true)
    if (m.ok) expect(m.billedByDeliverableSays).toBe('This team is billed by deliverable.')
  })
})
