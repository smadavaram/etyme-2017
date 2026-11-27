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

/**
 * Immigration: an HR seat, and a specialty-occupation petition for the
 * firm's first worker, not yet filed. The petition form already has a line
 * with HR named as its signatory; the other papers the agent lists itself.
 */
export async function addImmigrationWorld(w: GoldenWorld) {
  const hr = await prisma.person.create({ data: { name: 'Hana Resources', primaryEmail: mail('hana.resources') } })
  const role = await prisma.role.create({ data: { companyId: w.firm.id, name: 'HR', permissions: ['consultants.write', 'assignments.read', 'governance.read'] } })
  await prisma.context.create({ data: { personId: hr.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: role.id } as any })
  const worker = await prisma.person.findFirstOrThrow({ where: { name: 'Priya Nair' } })
  const petition = await prisma.petition.create({ data: { id: 'petition-golden-immigration', companyId: w.firm.id, personId: worker.id, kind: 'SPECIALTY_OCCUPATION', stage: 'PREPARING', employerCompanyId: w.firm.id } })
  await prisma.checklistItem.create({ data: { companyId: w.firm.id, ownerType: 'Petition', ownerId: petition.id, kind: 'PETITION_PAPER', label: 'Petition form', signatoryPersonId: hr.id } })
  return { hr, worker, petition }
}

/**
 * Compliance watch: the golden firm is also a client with a twelve-month
 * limit, and one worker has been on its site since Dec 24, 2025, so her
 * limit lands inside the first warning. HR and a Program Manager hold seats.
 * One notice went up on Oct 1 with ten working days long gone; a second was
 * posted after the filing day it is measured against, and its period ends
 * the day after the golden Monday. One petition was filed the Friday before,
 * so its public access file is due on the Monday.
 */
export async function addComplianceWorld(w: GoldenWorld) {
  const person = (name: string, email: string) => prisma.person.create({ data: { name, primaryEmail: mail(email) } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const hr = await person('Hana Resources', 'hana.resources'); const pm = await person('Pia Program', 'pia.program')
  await prisma.context.create({ data: { personId: hr.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: (await role('HR', ['governance.read', 'assignments.read'])).id } as any })
  await prisma.context.create({ data: { personId: pm.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: (await role('Program Manager', ['assignments.read'])).id } as any })

  const policy = await prisma.governancePolicy.create({ data: { companyId: w.firm.id, name: 'Time limit' } })
  await prisma.governanceRule.create({ data: { policyId: policy.id, ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', parameters: { maxMonths: 12 }, description: 'No placement past twelve months' } as any })
  const partner = await prisma.company.create({ data: { name: 'Golden Staffing Partner', slug: 'golden-staffing-partner', kind: 'VENDOR' } as any })
  const worker = await prisma.person.findFirstOrThrow({ where: { name: 'Priya Nair' } })
  const placement = await prisma.sellContract.create({
    data: { companyId: partner.id, clientCompanyId: w.firm.id, personId: worker.id, startDate: d('2025-12-24'), state: 'IN_PROGRESS', billRate: 9000 } as any,
  })

  const site = await prisma.companyLocation.create({ data: { companyId: w.firm.id, name: 'Golden Plant Site' } as any })
  const old = await prisma.noticePosting.create({ data: { companyId: w.firm.id, kind: 'LABOR_CONDITION', locationId: site.id, postedOn: d('2026-10-01') } })
  const late = await prisma.noticePosting.create({ data: { companyId: w.firm.id, kind: 'LABOR_CONDITION', locationId: site.id, postedOn: d('2026-11-10'), measuredFromOn: d('2026-11-02') } })

  const filedFor = await prisma.person.findFirstOrThrow({ where: { name: 'Tom Ruiz' } })
  const petition = await prisma.petition.create({ data: { id: 'petition-golden-compliance', companyId: w.firm.id, personId: filedFor.id, kind: 'SPECIALTY_OCCUPATION', stage: 'FILED', filedOn: d('2026-11-20'), employerCompanyId: w.firm.id } })
  return { hr, pm, partner, worker, placement, site, old, late, petition }
}

/**
 * Submissions out to one more customer, for the confirmation tracker: a
 * plan the customer already answered on the submission's own thread, the
 * same person put forward twice for one job, one whose letter bounced, and
 * one that has waited five days after a letter that left. Each has its own
 * person or job so no card is about two things.
 */
export async function addConfirmationWorld(w: GoldenWorld) {
  const co = await prisma.company.create({ data: { name: 'Golden Reply Customer', slug: 'golden-reply-customer', kind: 'CLIENT' } as any })
  const cara = await prisma.person.create({ data: { name: 'Cara Client', primaryEmail: mail('cara.client') } })
  await prisma.context.create({ data: { personId: cara.id, companyId: co.id, type: 'EMPLOYEE' } as any })
  const ines = await prisma.person.create({ data: { name: 'Ines Ortiz', primaryEmail: mail('ines.ortiz') } })
  const priya = await prisma.person.findFirstOrThrow({ where: { name: 'Priya Nair' } })
  const tom = await prisma.person.findFirstOrThrow({ where: { name: 'Tom Ruiz' } })
  const job = (title: string) => prisma.requirement.create({
    data: { companyId: co.id, title, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: d('2026-12-07') },
  })
  const submit = async (title: string, personId: string, on: string) => prisma.submission.create({
    data: { requirementId: (await job(title)).id, personId, fromCompanyId: w.firm.id, toCompanyId: co.id, kind: 'NETWORK', rate: 9000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: d(on) },
  })
  const replied = await submit('Planner', priya.id, '2026-11-20')
  const dualA = await submit('Data Engineer', tom.id, '2026-11-17')
  const dualB = await submit('Data Engineer', tom.id, '2026-11-18')
  const bounced = await submit('Platform Engineer', priya.id, '2026-11-19')
  const waiting = await submit('Support Analyst', ines.id, '2026-11-18')
  const letter = (recordId: string, outcome: string, to: string) => prisma.mailSend.create({
    data: { companyId: w.firm.id, recordType: 'Submission', recordId, fromAddress: 'hello@etyme.example', toAddresses: [to], bccAddresses: [], subject: 'Submission', template: 'submission', templateVersion: '1', outcome } as any,
  })
  await letter(bounced.id, 'FAILED_DELIVERY', mail('desk.full'))
  await letter(waiting.id, 'SENT', mail('hiring.desk'))
  const thread = await prisma.conversation.create({ data: { companyId: co.id, withCompanyId: w.firm.id, topic: 'SUBMISSION', topicId: replied.id, participants: [] } as any })
  await prisma.message.create({ data: { conversationId: thread.id, authorId: cara.id, body: 'Can Priya do Tuesday at 10?', type: 'INTERVIEW', createdAt: d('2026-11-21') } })
  return { co, cara, ines, replied, dualA, dualB, bounced, waiting }
}
