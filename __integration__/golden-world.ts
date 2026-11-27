/**
 * The world every golden snapshot is taken on (record 123, plan step 8).
 * One firm with fixed names and fixed old dates, so the same rules on the
 * same world leave the same rows whatever day the test runs. Two customers
 * and two suppliers are active; two customers and one supplier went quiet
 * on the days the census needs; one quiet customer has a contact to write
 * to and one has none. Last week (Sunday Nov 15) holds a signed sheet, one
 * the employer shortened, and one filed and waiting.
 */
import { prisma } from './harness'

export const GOLDEN_MONDAY = new Date('2026-11-23T12:00:00Z')
export const GOLDEN_TUESDAY = new Date('2026-11-24T12:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const mail = (n: string) => `${n}@example.invalid`

export interface GoldenWorld { firm: any; owner: any; am: any; entity: any; quietContact: any; quiet: any; supplierQuiet: any }

export async function buildGoldenWorld(): Promise<GoldenWorld> {
  const co = (name: string, kind: string) => prisma.company.create({ data: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), kind } as any })
  const firm = await co('Golden Firm', 'VENDOR')
  const entity = await prisma.legalEntity.create({ data: { companyId: firm.id, name: 'Golden Firm LLC', country: 'US', currency: 'USD' } })
  await prisma.companyAddress.create({ data: { companyId: firm.id, kind: 'LEGAL', street: '1 Main Street', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' } as any })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: firm.id, name, permissions } })
  const ownerRole = await role('Owner', ['*']); const amRole = await role('Account Manager', ['submissions.read'])
  const person = (name: string, email: string) => prisma.person.create({ data: { name, primaryEmail: mail(email) } })
  const owner = await person('Dana Owner', 'dana.owner'); const am = await person('Oli Manager', 'oli.manager')
  await prisma.context.create({ data: { personId: owner.id, companyId: firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  await prisma.context.create({ data: { personId: am.id, companyId: firm.id, type: 'EMPLOYEE', roleId: amRole.id } as any })

  const reg = async (name: string, kind: string, relationship: 'CLIENT' | 'SUPPLIER') => {
    const c = await co(name, kind)
    await prisma.counterparty.create({ data: { companyId: firm.id, otherCompanyId: c.id, relationship, status: 'ACTIVE', createdAt: d('2026-06-01') } as any })
    return c
  }
  const busy = await reg('Golden Busy Customer', 'CLIENT', 'CLIENT')
  const busy2 = await reg('Golden Second Customer', 'CLIENT', 'CLIENT')
  const quiet = await reg('Golden Quiet Customer', 'CLIENT', 'CLIENT')
  const noOne = await reg('Golden Nobody Customer', 'CLIENT', 'CLIENT')
  const supplier = await reg('Golden Busy Supplier', 'VENDOR', 'SUPPLIER')
  const supplierQuiet = await reg('Golden Quiet Supplier', 'VENDOR', 'SUPPLIER')

  const worker = await person('Priya Nair', 'priya.nair'); const worker2 = await person('Tom Ruiz', 'tom.ruiz')
  const line = (clientCompanyId: string, personId: string) => prisma.sellContract.create({
    data: { companyId: firm.id, clientCompanyId, personId, startDate: d('2026-09-01'), state: 'IN_PROGRESS', billRate: 9000 } as any,
  })
  const l1 = await line(busy.id, worker.id); await line(busy2.id, worker2.id)
  await prisma.buyContract.create({ data: { companyId: firm.id, vendorCompanyId: supplier.id, startDate: d('2026-09-01'), state: 'IN_PROGRESS' } as any })

  // Quiet since August 20: active on the census a week before the Monday, dormant on it.
  const job = (companyId: string, title: string) => prisma.requirement.create({
    data: { companyId, title, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: d('2026-12-07') },
  })
  for (const [c, p] of [[quiet, worker], [noOne, worker2]] as const) {
    const r = await job(c.id, `Analyst for ${c.name}`)
    await prisma.submission.create({ data: { requirementId: r.id, personId: p.id, fromCompanyId: firm.id, toCompanyId: c.id, kind: 'NETWORK', rate: 9000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: d('2026-08-20') } })
  }
  await prisma.vendorBill.create({ data: { companyId: firm.id, vendorCompanyId: supplierQuiet.id, receivedAt: d('2026-08-20'), number: 'GB-1', totalCents: 100000, dueAt: d('2026-09-20') } as any })
  const quietContact = await prisma.companyContact.create({ data: { companyId: firm.id, atCompanyId: quiet.id, name: 'Quinn Quiet', email: mail('quinn.quiet'), kind: 'HIRING_MANAGER' } })
  await prisma.companyContact.create({ data: { companyId: firm.id, atCompanyId: supplierQuiet.id, name: 'Sam Supplier', email: mail('sam.supplier'), kind: 'RECRUITING' } })

  const week = d('2026-11-15')
  const sheet = (sellContractId: string, personId: string, totalHours: number, extra: Record<string, unknown>) => prisma.timesheet.create({
    data: { sellContractId, personId, periodStart: week, periodEnd: d('2026-11-21'), days: { '2026-11-16': totalHours }, totalHours, ...extra } as any,
  })
  await sheet(l1.id, worker.id, 40, { status: 'APPROVED', submittedAt: d('2026-11-21'), employerAcceptedAt: d('2026-11-22'), acceptedHours: 36 })
  const l2 = await prisma.sellContract.findFirstOrThrow({ where: { companyId: firm.id, clientCompanyId: busy2.id } })
  await sheet(l2.id, worker2.id, 24, { status: 'SUBMITTED', submittedAt: d('2026-11-21') })
  return { firm, owner, am, entity, quietContact, quiet, supplierQuiet }
}

export async function switchAgent(w: GoldenWorld, agentKey: string, state: 'OFF' | 'DRAFT_ONLY' | 'ON') {
  await prisma.agentSwitch.upsert({
    where: { companyId_agentKey: { companyId: w.firm.id, agentKey } },
    update: { state }, create: { companyId: w.firm.id, agentKey, state, changedById: w.owner.id },
  })
}
