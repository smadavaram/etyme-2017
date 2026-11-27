/**
 * What each platform agent's golden snapshot adds to the golden world
 * (record 123, plan step 8). Kept apart from `golden-world.ts` so the
 * snapshots already taken on that world cannot move. Every date is fixed.
 */
import { prisma } from './harness'
import type { GoldenWorld } from './golden-world'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const mail = (n: string) => `${n}@example.invalid`

/** The quiet customer's job names a hiring manager with an address; the other quiet customer's names nobody. */
export async function addInterviewWorld(w: GoldenWorld) {
  const hm = await prisma.person.create({ data: { name: 'Hana Hiring', primaryEmail: mail('hana.hiring') } })
  const job = await prisma.requirement.findFirstOrThrow({ where: { companyId: w.quiet.id } })
  await prisma.requirement.update({ where: { id: job.id }, data: { raisedById: hm.id } })
  const submission = await prisma.submission.findFirstOrThrow({ where: { requirementId: job.id } })
  return { hm, job, submission }
}
export const GOLDEN_WEDNESDAY = new Date('2026-11-25T12:00:00Z')
export { d as goldenDay }

/**
 * Contracts: a Contract Manager and an HR seat, a payment-terms agreement
 * the first placement's terms differ from (a drift), and one placement not
 * yet started whose first day is three days after the golden Monday.
 */
export async function addContractsWorld(w: GoldenWorld) {
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const person = (name: string, email: string) => prisma.person.create({ data: { name, primaryEmail: mail(email) } })
  const cm = await person('Carl Contracts', 'carl.contracts'); const hr = await person('Hana Resources', 'hana.resources')
  await prisma.context.create({ data: { personId: cm.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: (await role('Contract Manager', ['assignments.write', 'assignments.read'])).id } as any })
  await prisma.context.create({ data: { personId: hr.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: (await role('HR', ['consultants.write', 'assignments.read', 'governance.read'])).id } as any })
  const line = await prisma.sellContract.findFirstOrThrow({ where: { companyId: w.firm.id, state: 'IN_PROGRESS' }, orderBy: { id: 'asc' } })
  const msa = await prisma.masterAgreement.create({ data: { vendorId: w.firm.id, clientId: line.clientCompanyId, paymentTerms: 30 } as any })
  await prisma.sellContract.update({ where: { id: line.id }, data: { msaId: msa.id, paymentTerms: 45 } })
  const hire = await person('Nia Newhire', 'nia.newhire')
  const soon = await prisma.sellContract.create({
    data: { companyId: w.firm.id, clientCompanyId: line.clientCompanyId, personId: hire.id, billRate: 9500, startDate: d('2026-11-26'), endDate: d('2027-05-31'), state: 'DRAFT' } as any,
  })
  return { cm, hr, line, msa, hire, soon }
}
