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

/**
 * Reconciliation: a receivables seat and a payroll clerk, one customer, and
 * six bills the firm raised in October for six people. A payment placed
 * against each of four (to the cent, short, over, and in another currency),
 * a loose payment that is owed by exactly one bill, a loose payment that
 * fits no bill, and one bill whose line rate is above its contract's. The
 * two bills the agent may move a month for sit at "payment pending".
 */
export async function addReconciliationWorld(w: GoldenWorld) {
  const { openChain, advanceChain } = await import('@/lib/money/money-chain')
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions } })
  const person = (name: string, email: string) => prisma.person.create({ data: { name, primaryEmail: mail(email) } })
  const ar = await person('Rita Receivable', 'rita.receivable'); const clerk = await person('Ravi Payroll', 'ravi.payroll')
  await prisma.context.create({ data: { personId: ar.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: (await role('Accounts Receivable', [])).id } as any })
  await prisma.context.create({ data: { personId: clerk.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: (await role('AP & Payroll', [])).id } as any })
  const client = await prisma.company.create({ data: { name: 'Golden Paying Customer', slug: 'golden-paying-customer', kind: 'CLIENT' } as any })
  const engagement = await prisma.engagement.create({ data: { title: 'Golden reconciliation' } })
  const start = d('2026-10-01'); const end = d('2026-10-31')
  const line = async (who: any) => prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: client.id, personId: who.id, billRate: 10000, startDate: d('2026-09-01'), engagementId: engagement.id } as any })
  const bill = async (number: string, ln: any, total: string, lineRate = 10000) => {
    const ts = await prisma.timesheet.create({ data: { sellContractId: ln.id, personId: ln.personId, periodStart: start, periodEnd: end, days: {}, totalHours: '10.00' } as any })
    return prisma.invoice.create({
      data: {
        engagementId: engagement.id, number, currency: 'USD', total, periodStart: start, periodEnd: end, dueAt: d('2026-11-30'), status: 'ISSUED',
        invoiceLines: { create: [{ sellContractId: ln.id, personId: ln.personId, timesheetId: ts.id, hours: '10.00', rateCents: lineRate, amountCents: Math.round(Number(total) * 100) }] },
      } as any,
    })
  }
  const month = async (ln: any, cents: number) => {
    const s = { companyId: w.firm.id, actingEntityId: w.entity.id, personId: clerk.id, heldAs: 'AP & Payroll' }
    const c = await openChain({ ...s, sellContractId: ln.id, periodStart: start, periodEnd: end }, d('2026-11-01'))
    for (const [to, stated] of [['TIMESHEET_RECEIVED', { cents, currency: 'USD' }], ['RECONCILED'], ['INVOICED', { cents, currency: 'USD' }], ['PAYMENT_PENDING']] as const) {
      await advanceChain({ ...s, chainId: c.id, to, stated: stated as any, disputeOwnerPersonId: w.owner.id })
    }
    return c
  }
  const people = await Promise.all([['Ana Rao', 'ana.rao'], ['Ben Ito', 'ben.ito'], ['Cy Lund', 'cy.lund'], ['Di Roy', 'di.roy'], ['Eli Fox', 'eli.fox'], ['Fay Gray', 'fay.gray']].map(([n, e]) => person(n, e)))
  const lines = []
  for (const p of people) lines.push(await line(p))
  const [exactBill, shortBill, overBill, fxBill, looseBill, driftBill] = [
    await bill('GOLD-EXACT', lines[0], '1000.00'), await bill('GOLD-SHORT', lines[1], '1000.00'), await bill('GOLD-OVER', lines[2], '1000.00'),
    await bill('GOLD-FX', lines[3], '1000.00'), await bill('GOLD-LOOSE', lines[4], '777.77'), await bill('GOLD-DRIFT', lines[5], '1050.00', 10500),
  ]
  const exactChain = await month(lines[0], 100000)
  const looseChain = await month(lines[4], 77777)
  const pay = (invoiceId: string | null, amount: string, extra: Record<string, unknown> = {}) =>
    prisma.payment.create({ data: { invoiceId, amount, receivedByCompanyId: w.firm.id, receivedAt: d('2026-11-10'), appliedAt: invoiceId ? d('2026-11-11') : null, ...extra } as any })
  const exactPay = await pay(exactBill.id, '1000.00', { reference: 'WIRE-1' })
  const shortPay = await pay(shortBill.id, '900.00', { reference: 'WIRE-2' })
  const overPay = await pay(overBill.id, '1100.00', { reference: 'WIRE-3' })
  const fxPay = await pay(fxBill.id, '1000.00', { currency: 'EUR', reference: 'WIRE-4' })
  const loosePay = await pay(null, '777.77', { reference: 'WIRE-5' })
  const strayPay = await pay(null, '123.45', { reference: 'WIRE-6' })
  return { ar, clerk, client, exactBill, shortBill, overBill, fxBill, looseBill, driftBill, exactChain, looseChain, exactPay, shortPay, overPay, fxPay, loosePay, strayPay }
}

/**
 * Payroll draft: an AP & Payroll seat, and two people paid by the firm every
 * month on a W2 line. October holds four accepted weeks of 40 hours for the
 * first, whose exemption is recorded, and one 45-hour week for the second,
 * whose exemption nobody has recorded, so that week is held with its reason.
 * September was run already, day by day, and is not drafted.
 */
export async function addPayrollWorld(w: GoldenWorld) {
  const client = await prisma.company.create({ data: { name: 'Golden Payroll Customer', slug: 'golden-payroll-customer', kind: 'CLIENT' } as any })
  const person = (name: string, email: string) => prisma.person.create({ data: { name, primaryEmail: mail(email) } })
  const clerk = await person('Ravi Payroll', 'ravi.payroll')
  const apRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'AP & Payroll', permissions: ['payroll.read', 'payroll.run'] } })
  await prisma.context.create({ data: { personId: clerk.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: apRole.id } as any })
  const leila = await person('Leila Farouk', 'leila.farouk'); const mo = await person('Mo Ito', 'mo.ito')
  const line = async (who: any, exempt: boolean) => {
    const start = d('2026-09-01')
    const sell = await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: client.id, personId: who.id, billRate: 11200, startDate: start, state: 'IN_PROGRESS' } as any })
    const buy = await prisma.buyContract.create({
      data: {
        companyId: w.firm.id, contractType: 'W2', state: 'IN_PROGRESS', startDate: start, payCurrency: 'USD',
        payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT', overtimeAfterHours: 40, overtimeMultiplierBps: 15000,
        candidates: { create: { personId: who.id, payRate: 6600, startDate: start } },
      } as any,
    })
    await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start } })
    if (exempt) {
      await prisma.exemptAssertion.create({
        data: {
          buyContractId: buy.id, personId: who.id, assertedByCompanyId: w.firm.id, status: 'NONEXEMPT', wageRule: 'US_FLSA',
          screenOutcome: 'CANNOT_BE_EXEMPT', screenRulesOut: [], screenSays: 'Paid by the hour.', assertedById: w.owner.id,
        } as any,
      })
    }
    return { sell, buy }
  }
  const week = async (l: { sell: any }, who: any, monday: string, perDay: number) => {
    const m = d(monday)
    const days: Record<string, number> = {}
    for (let i = 0; i < 5; i++) days[new Date(+m + i * 86_400_000).toISOString().slice(0, 10)] = perDay
    const end = new Date(+m + 4 * 86_400_000)
    const ts = await prisma.timesheet.create({
      data: {
        sellContractId: l.sell.id, personId: who.id, periodStart: m, periodEnd: end, days, totalHours: perDay * 5,
        status: 'APPROVED', submittedAt: end, approvedAt: end, clientApprovedAt: end, employerAcceptedAt: end, employerAcceptedById: w.owner.id,
      } as any,
    })
    await prisma.workAssertion.create({ data: { timesheetId: ts.id, companyId: w.firm.id, role: 'EMPLOYER_ACCEPTANCE', hours: perDay * 5, rateCents: 6600, state: 'LIVE', byId: w.owner.id } as any })
    return ts
  }
  const leilaLine = await line(leila, true); const moLine = await line(mo, false)
  for (const m of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']) await week(leilaLine, leila, m, 8)
  await week(moLine, mo, '2026-10-05', 9)
  const paid: any[] = []
  for (const m of ['2026-09-07', '2026-09-14', '2026-09-21']) {
    const ts = await week(leilaLine, leila, m, 8)
    for (const day of Object.keys(ts.days as object)) paid.push({ personId: leila.id, timesheetId: ts.id, day, hours: 8, rateCents: 6600 })
  }
  await prisma.automationLog.create({
    data: {
      companyId: w.firm.id, action: 'PAYROLL_RUN', summary: 'Payroll process: 1 contracts', reason: 'Payroll process initiated by test', reversible: false, at: d('2026-10-05'),
      payload: { action: 'process', period: '2026-09', contracts: [{ buyContractId: leilaLine.buy.id, buyContractCandidateId: 'x', person: 'Leila Farouk', hours: 120, grossPay: 792000, currency: 'USD', refused: null, paid, premiumsPriced: true }], runBy: w.owner.id, runAt: '2026-10-05T00:00:00Z' } as any,
    },
  })
  return { client, clerk, leila, mo, leilaLine, moLine, moreWeek: () => week(moLine, mo, '2026-10-12', 9) }
}

/**
 * Timesheet weeks for the timesheet chase: three of the firm's own people
 * on the first customer's lines and one on a line the firm only resells.
 * Ana's week fell due on the Monday and is not filed; Bea's fell due long
 * before the chase looks back; Cal's was filed and marked done; Dev is a
 * sub-vendor's worker, whose chase is the sub-vendor's. Every date fixed.
 */
export async function addTimesheetWorld(w: GoldenWorld) {
  const busy = await prisma.company.findFirstOrThrow({ where: { name: 'Golden Busy Customer' } })
  const worker = async (name: string, email: string, employed: boolean) => {
    const p = await prisma.person.create({ data: { name, primaryEmail: mail(email) } })
    if (employed) await prisma.context.create({ data: { personId: p.id, companyId: w.firm.id, type: 'EMPLOYEE' } as any })
    const line = await prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: busy.id, personId: p.id, startDate: d('2026-09-01'), state: 'IN_PROGRESS', billRate: 9000 } as any })
    return { p, line }
  }
  const cycle = (sellContractId: string, dueOn: string, start: string, end: string, extra: Record<string, unknown> = {}) => prisma.cycle.create({
    data: { sellContractId, kind: 'TIMESHEET_SUBMIT', dueOn: d(dueOn), periodStart: d(start), periodEnd: d(end), ...extra } as any,
  })
  const ana = await worker('Ana Ruiz', 'ana.ruiz', true)
  const bea = await worker('Bea Okoye', 'bea.okoye', true)
  const cal = await worker('Cal Mensah', 'cal.mensah', true)
  const dev = await worker('Dev Rao', 'dev.rao', false)
  const anaWeek = await cycle(ana.line.id, '2026-11-23', '2026-11-15', '2026-11-21')
  const beaWeek = await cycle(bea.line.id, '2026-10-20', '2026-10-11', '2026-10-17')
  await cycle(cal.line.id, '2026-11-23', '2026-11-15', '2026-11-21', { completedAt: d('2026-11-22') })
  await cycle(dev.line.id, '2026-11-23', '2026-11-15', '2026-11-21')
  return { ana, bea, cal, dev, anaWeek, beaWeek }
}
