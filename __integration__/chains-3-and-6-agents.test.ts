/**
 * Chain 3 (the contracts checklist, the immigration checklist, the onboarding
 * pack) and chain 6 (the compliance watch: tenure, notice postings, the
 * public access file) of record 112, on the database through the real runner
 * and the real routes. Builds its own firms on reserved domains.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { registerContractsChecklist, CONTRACTS_CHECKLIST_AGENT } from '@/lib/agents/contracts-checklist'
import { registerImmigrationChecklist, IMMIGRATION_CHECKLIST_AGENT } from '@/lib/agents/immigration-checklist'
import { registerComplianceWatch, COMPLIANCE_WATCH_AGENT } from '@/lib/agents/compliance-watch'
import * as petitions from '@/app/api/compliance/immigration-petitions/route'
import * as petition from '@/app/api/compliance/immigration-petitions/[id]/route'
import * as itemRoute from '@/app/api/compliance/checklist-items/[id]/route'
import * as notices from '@/app/api/compliance/notice-postings/route'
import * as notice from '@/app/api/compliance/notice-postings/[id]/route'
import * as itemsList from '@/app/api/compliance/checklist-items/route'
import * as accessFiles from '@/app/api/compliance/access-files/route'
import * as accessFile from '@/app/api/compliance/access-files/[id]/route'

const tag = `c36${Date.now()}`
const mail = (n: string) => `${n}.${tag}@example.invalid`
const MON = new Date('2026-11-23T12:00:00Z')
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const w: Record<string, any> = {}

async function person(name: string) {
  return prisma.person.create({ data: { name, primaryEmail: mail(name.toLowerCase().replace(/\s/g, '.')) } })
}
async function seat(companyId: string, who: any, roleId: string) {
  await prisma.context.create({ data: { personId: who.id, companyId, type: 'EMPLOYEE', roleId } as any })
}
const switchOn = (companyId: string, agentKey: string, state: 'OFF' | 'DRAFT_ONLY' | 'ON' = 'ON') => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId, agentKey } }, update: { state }, create: { companyId, agentKey, state, changedById: w.owner.id },
})
function runs(key: string, register: () => void, companyId: string, now = MON) {
  unregisterAgent(key); register()
  return runAgent(key, companyId, now)
}
const cards = (companyId: string) => prisma.decisionItem.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } })
const ledger = (companyId: string, action: string) => prisma.recordAction.findMany({ where: { companyId, action } })
let n = 0
async function line(over: Record<string, unknown> = {}) {
  const who = await person(`Worker ${++n}`)
  return prisma.sellContract.create({
    data: { companyId: w.firm.id, clientCompanyId: w.client.id, personId: who.id, billRate: 12_500, startDate: day('2026-09-01'), engagementId: w.engagement.id, state: 'IN_PROGRESS', ...over } as any,
  })
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `C36 Firm ${tag}`, slug: `c36-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `C36 Client ${tag}`, slug: `c36-client-${tag}`, kind: 'CLIENT' } as any })
  w.engagement = await prisma.engagement.create({ data: { title: `C36 ${tag}` } })
  const role = (companyId: string, name: string, permissions: string[]) => prisma.role.create({ data: { companyId, name, permissions } })
  w.owner = await person('Dana Owner'); w.hr = await person('Hana Resources'); w.cm = await person('Carl Contracts'); w.pm = await person('Pia Program'); w.clientOwner = await person('Cora Clientowner')
  await seat(w.firm.id, w.owner, (await role(w.firm.id, 'Owner', ['*'])).id)
  await seat(w.firm.id, w.hr, (await role(w.firm.id, 'HR', ['consultants.write', 'assignments.read'])).id)
  await seat(w.firm.id, w.cm, (await role(w.firm.id, 'Contract Manager', ['assignments.write', 'assignments.read'])).id)
  await seat(w.client.id, w.clientOwner, (await role(w.client.id, 'Owner', ['*'])).id)
  await seat(w.client.id, w.pm, (await role(w.client.id, 'Program Manager', ['assignments.read'])).id)
  const policy = await prisma.governancePolicy.create({ data: { companyId: w.client.id, name: 'Time limit' } })
  await prisma.governanceRule.create({ data: { policyId: policy.id, ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', parameters: { maxMonths: 12 }, description: 'No placement past twelve months' } as any })
  w.site = await prisma.companyLocation.create({ data: { companyId: w.firm.id, name: 'Lakewood HQ' } as any })
  w.msa = await prisma.masterAgreement.create({ data: { vendorId: w.firm.id, clientId: w.client.id, paymentTerms: 30 } as any })
  for (const k of [CONTRACTS_CHECKLIST_AGENT, IMMIGRATION_CHECKLIST_AGENT, COMPLIANCE_WATCH_AGENT]) await switchOn(w.firm.id, k, 'OFF')
  await switchOn(w.client.id, COMPLIANCE_WATCH_AGENT, 'OFF')
})
afterEach(() => { for (const k of [CONTRACTS_CHECKLIST_AGENT, IMMIGRATION_CHECKLIST_AGENT, COMPLIANCE_WATCH_AGENT]) unregisterAgent(k) })

describe('the contracts checklist agent', () => {
  it('an agent that is off lists nothing and opens nothing', async () => {
    w.matched = await line()
    w.drifted = await line({ msaId: w.msa.id, paymentTerms: 45 })
    const out = await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    expect(out.ran).toBe(false)
    expect(await prisma.checklistItem.count({ where: { companyId: w.firm.id } })).toBe(0)
    expect(await cards(w.firm.id)).toHaveLength(0)
  })

  it('a placement whose line matches its agreement lists its items as met and opens no card', async () => {
    await switchOn(w.firm.id, CONTRACTS_CHECKLIST_AGENT, 'ON')
    await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    const items = await prisma.checklistItem.findMany({ where: { ownerId: w.matched.id } })
    expect(items.map((i) => [i.label, i.state, i.agreedValue, i.actualValue])).toEqual([['Bill rate', 'MET', '$125.00 an hour', '$125.00 an hour']])
  })

  it('payment terms that differ from the agreement are a drift and open one card to the Contract Manager', async () => {
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { ownerId: w.drifted.id, label: 'Payment terms' } })
    expect([item.state, item.agreedValue, item.actualValue]).toEqual(['DRIFT', 'Net 30', 'Net 45'])
    const d = (await cards(w.firm.id)).filter((x) => JSON.stringify(x.proofLinks).includes(item.id))
    expect(d).toHaveLength(1)
    expect(d[0].ownerPersonId).toBe(w.cm.id)
    expect(d[0].question).toMatch(/Payment terms for Worker 2 at C36 Client .* reads Net 45 on the line. The agreed value is Net 30. Look at it\?/)
    expect(d[0].proof).toMatch(/changed nothing/)
  })

  it('running again opens no second card for the same drift', async () => {
    const before = (await cards(w.firm.id)).length
    await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    expect((await cards(w.firm.id)).length).toBe(before)
  })

  it('a rate changed on the line is a drift and the agreed value does not move by itself', async () => {
    await prisma.sellContract.update({ where: { id: w.matched.id }, data: { billRate: 13_000 } })
    await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { ownerId: w.matched.id, label: 'Bill rate' } })
    expect([item.state, item.agreedValue, item.actualValue]).toEqual(['DRIFT', '$125.00 an hour', '$130.00 an hour'])
    expect((await cards(w.firm.id)).filter((x) => x.question.includes('Bill rate'))).toHaveLength(1)
    w.rateItem = item
  })

  it('recording a signed paper without saying which paper it is is refused in a sentence', async () => {
    as(w.cm.primaryEmail)
    const r = await json(await itemRoute.POST(req('POST', `/api/compliance/checklist-items/${w.rateItem.id}`, { action: 'RECORD_SIGNED' }), p(w.rateItem.id)))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Say which signed paper this comes from: its name, number or date.')
  })

  it('a seat that does not look after contracts cannot record what a signed paper says', async () => {
    as(w.hr.primaryEmail)
    const r = await json(await itemRoute.POST(req('POST', `/api/compliance/checklist-items/${w.rateItem.id}`, { action: 'RECORD_SIGNED', paperReference: 'Amendment 2' }), p(w.rateItem.id)))
    expect(r.status).toBe(403)
  })

  it('a person recording the signed paper moves the agreed value, writes who did it, and the item is met', async () => {
    as(w.cm.primaryEmail)
    const r = await json(await itemRoute.POST(req('POST', `/api/compliance/checklist-items/${w.rateItem.id}`, { action: 'RECORD_SIGNED', paperReference: 'Rate amendment of Nov 20' }), p(w.rateItem.id)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: w.rateItem.id } })
    expect([item.state, item.agreedValue, item.decidedById]).toEqual(['MET', '$130.00 an hour', w.cm.id])
    const row = (await ledger(w.firm.id, 'AGREED_VALUE_RECORDED'))[0]
    expect(row.personId).toBe(w.cm.id)
    expect(row.agentKey).toBeNull()
    expect(row.summary).toMatch(/Rate amendment of Nov 20/)
  })

  it('an item somebody waived with a reason is left alone by the agent', async () => {
    await prisma.checklistItem.update({ where: { id: w.rateItem.id }, data: { state: 'WAIVED_WITH_REASON', waivedReason: 'Client confirmed by phone' } })
    await prisma.sellContract.update({ where: { id: w.matched.id }, data: { billRate: 14_000 } })
    await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: w.rateItem.id } })).state).toBe('WAIVED_WITH_REASON')
  })

  it('a placement whose dates run past its order’s is a drift in the dates, said in a person’s words', async () => {
    const order = await prisma.workOrder.create({ data: { issuedById: w.client.id, issuedToId: w.firm.id, recordedById: w.firm.id, number: `PO-${tag}`, amount: '100000.00', startDate: day('2026-09-01'), endDate: day('2026-12-31') } as any })
    const l = await line({ workOrderId: order.id, startDate: day('2026-09-01'), endDate: day('2027-02-28') })
    await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { ownerId: l.id, label: 'Line dates inside the order' } })
    expect(item.state).toBe('DRIFT')
    expect((await cards(w.firm.id)).some((x) => x.question.includes('outside the order’s Sep 1, 2026 to Dec 31, 2026'))).toBe(true)
  })
})

describe('the onboarding pack', () => {
  it('a placement starting in three days with papers missing opens one card to HR naming them', async () => {
    w.soon = await line({ state: 'DRAFT', startDate: day('2026-11-26'), endDate: day('2027-05-31') })
    await line({ state: 'DRAFT', startDate: day('2026-12-20'), endDate: day('2027-05-31') })
    await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    const d = (await cards(w.firm.id)).filter((x) => JSON.stringify(x.proofLinks).includes(w.soon.id))
    expect(d).toHaveLength(1)
    expect(d[0].ownerPersonId).toBe(w.hr.id)
    expect(d[0].question).toMatch(/starts at C36 Client .* in 3 days, and \d+ papers? (is|are) still missing: /)
    expect(d[0].proof).toMatch(/The agent sent nothing/)
  })

  it('a placement starting in twenty days gets no pack card yet', async () => {
    const later = (await cards(w.firm.id)).filter((x) => x.question.includes('in 26 days') || x.question.includes('in 27 days'))
    expect(later).toHaveLength(0)
  })

  it('running again opens no second pack card', async () => {
    const before = (await cards(w.firm.id)).length
    await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    expect((await cards(w.firm.id)).length).toBe(before)
  })

  it('a placement already running is not asked for a pack', async () => {
    expect((await cards(w.firm.id)).filter((x) => JSON.stringify(x.proofLinks).includes(w.matched.id) && x.question.includes('starts at'))).toHaveLength(0)
  })
})

describe('the immigration checklist', () => {
  it('starting a petition makes each paper its own line, and the route files nothing', async () => {
    w.worker = await person('Priya Nair')
    await seat(w.firm.id, w.worker, (await prisma.role.findFirstOrThrow({ where: { companyId: w.firm.id, name: 'HR' } })).id)
    as(w.hr.primaryEmail)
    const r = await json(await petitions.POST(req('POST', '/api/compliance/immigration-petitions', { personId: w.worker.id, kind: 'SPECIALTY_OCCUPATION' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    w.petition = await prisma.petition.findUniqueOrThrow({ where: { id: r.body.data.id } })
    const lines = await prisma.checklistItem.findMany({ where: { ownerId: w.petition.id }, orderBy: { createdAt: 'asc' } })
    expect(lines.map((l) => [l.label, l.state])).toEqual([['Labor condition application', 'OPEN'], ['Petition form', 'OPEN'], ['Representation form', 'OPEN'], ['Approval notice copy', 'OPEN']])
  })

  it('a petition for a person the firm neither employs nor lists is refused in a sentence', async () => {
    const stranger = await person('Sam Stranger')
    as(w.hr.primaryEmail)
    const r = await json(await petitions.POST(req('POST', '/api/compliance/immigration-petitions', { personId: stranger.id, kind: 'SPECIALTY_OCCUPATION' })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/not on your payroll or your bench/)
  })

  it('each signature line sends one card to the signatory seat named on it, and the others to the Owner', async () => {
    const lines = await prisma.checklistItem.findMany({ where: { ownerId: w.petition.id } })
    const pf = lines.find((l) => l.label === 'Petition form')!
    as(w.hr.primaryEmail)
    const named = await json(await itemRoute.POST(req('POST', `/api/compliance/checklist-items/${pf.id}`, { action: 'SET_SIGNATORY', signatoryPersonId: w.hr.id }), p(pf.id)))
    expect(named.status, JSON.stringify(named.body)).toBe(200)
    await switchOn(w.firm.id, IMMIGRATION_CHECKLIST_AGENT, 'ON')
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    const mine = (await cards(w.firm.id)).filter((x) => x.question.includes('needs your signature'))
    expect(mine).toHaveLength(3)
    expect(mine.find((x) => x.question.startsWith('The petition form'))!.ownerPersonId).toBe(w.hr.id)
    expect(mine.filter((x) => !x.question.startsWith('The petition form')).every((x) => x.ownerPersonId === w.owner.id)).toBe(true)
  })

  it('running again opens no second signature card', async () => {
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    expect((await cards(w.firm.id)).filter((x) => x.question.includes('needs your signature'))).toHaveLength(3)
  })

  it('the agent never marks a paper as on hand, whatever a card was answered', async () => {
    for (const c of (await cards(w.firm.id)).filter((x) => x.question.includes('needs your signature'))) {
      await prisma.decisionItem.update({ where: { id: c.id }, data: { state: 'APPROVED', decidedAt: new Date(), decidedByPersonId: w.owner.id } as any })
    }
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    expect(await prisma.checklistItem.count({ where: { ownerId: w.petition.id, state: 'MET' } })).toBe(0)
  })

  it('marking a paper on hand without its reference is refused in a sentence', async () => {
    const l = await prisma.checklistItem.findFirstOrThrow({ where: { ownerId: w.petition.id, label: 'Approval notice copy' } })
    as(w.hr.primaryEmail)
    const r = await json(await itemRoute.POST(req('POST', `/api/compliance/checklist-items/${l.id}`, { action: 'MARK_MET' }), p(l.id)))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/Etyme keeps the reference, never the paper/)
  })

  it('a petition is complete only when a person has recorded every line, and the agent then says so once', async () => {
    as(w.hr.primaryEmail)
    const lines = await prisma.checklistItem.findMany({ where: { ownerId: w.petition.id }, orderBy: { createdAt: 'asc' } })
    for (const l of lines.slice(0, 3)) {
      const r = await json(await itemRoute.POST(req('POST', `/api/compliance/checklist-items/${l.id}`, { action: 'MARK_MET', paperReference: `${l.label} copy 1` }), p(l.id)))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    expect(await ledger(w.firm.id, 'PETITION_PAPERS_COMPLETE')).toHaveLength(0)
    const last = lines[3]
    await json(await itemRoute.POST(req('POST', `/api/compliance/checklist-items/${last.id}`, { action: 'MARK_MET', paperReference: 'Approval notice copy 1' }), p(last.id)))
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    expect(await ledger(w.firm.id, 'PETITION_PAPERS_COMPLETE')).toHaveLength(1)
  })

  it('a petition recorded without its lines gets them listed by the agent', async () => {
    const bare = await prisma.petition.create({ data: { companyId: w.firm.id, personId: w.worker.id, kind: 'SPECIALTY_OCCUPATION', stage: 'PREPARING', employerCompanyId: w.firm.id } })
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    expect(await prisma.checklistItem.count({ where: { ownerId: bare.id } })).toBe(4)
  })

  it('a petition that was withdrawn is not chased', async () => {
    const gone = await prisma.petition.create({ data: { companyId: w.firm.id, personId: w.worker.id, kind: 'SPECIALTY_OCCUPATION', stage: 'WITHDRAWN', employerCompanyId: w.firm.id } })
    await runs(IMMIGRATION_CHECKLIST_AGENT, registerImmigrationChecklist, w.firm.id)
    expect(await prisma.checklistItem.count({ where: { ownerId: gone.id } })).toBe(0)
  })
})

describe('the compliance watch: tenure', () => {
  it('a person 27 days from the client’s twelve-month limit opens one card to the program manager', async () => {
    const near = await line({ startDate: day('2025-12-20'), endDate: null })
    const far = await line({ startDate: day('2026-08-01'), endDate: null })
    const past = await line({ startDate: day('2025-06-01'), endDate: null })
    w.near = near; w.far = far; w.past = past
    await switchOn(w.client.id, COMPLIANCE_WATCH_AGENT, 'ON')
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.client.id)
    const all = await cards(w.client.id)
    const nearName = (await prisma.person.findUniqueOrThrow({ where: { id: near.personId } })).name
    const farName = (await prisma.person.findUniqueOrThrow({ where: { id: far.personId } })).name
    const pastName = (await prisma.person.findUniqueOrThrow({ where: { id: past.personId } })).name
    const nearCards = all.filter((c) => c.question.startsWith(nearName))
    expect(nearCards).toHaveLength(1)
    expect(nearCards[0].ownerPersonId).toBe(w.pm.id)
    expect(nearCards[0].question).toMatch(/reaches the 12-month time limit at C36 Client .* in \d+ days\. Review the placement now\?/)
    expect(all.some((c) => c.question.startsWith(farName))).toBe(false)
    expect(all.filter((c) => c.question.startsWith(pastName))).toHaveLength(1)
    expect(all.find((c) => c.question.startsWith(pastName))!.question).toMatch(/passed the 12-month time limit .* and is still on site/)
  })

  it('running again the same day opens no second tenure card', async () => {
    const before = (await cards(w.client.id)).length
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.client.id)
    expect((await cards(w.client.id)).length).toBe(before)
  })

  it('the watch changes no placement: nothing is extended, ended or paused', async () => {
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: w.near.id } })).state).toBe('IN_PROGRESS')
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: w.past.id } })).endDate).toBeNull()
  })

  it('a firm that set no limit is not watched, so a supplier never reads another firm’s days', async () => {
    await switchOn(w.firm.id, COMPLIANCE_WATCH_AGENT, 'ON')
    const before = (await cards(w.firm.id)).length
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.firm.id)
    expect((await cards(w.firm.id)).filter((c) => c.question.includes('time limit'))).toHaveLength(0)
    expect((await cards(w.firm.id)).length).toBeGreaterThanOrEqual(before)
  })
})

describe('the compliance watch: notice postings', () => {
  it('a person records a notice posted at a site, and the period end is ten working days on', async () => {
    as(w.hr.primaryEmail)
    const a = await json(await notices.POST(req('POST', '/api/compliance/notice-postings', { kind: 'Labor condition', locationId: w.site.id, postedOn: '2026-11-09' })))
    expect(a.status, JSON.stringify(a.body)).toBe(201)
    const b = await json(await notices.POST(req('POST', '/api/compliance/notice-postings', { kind: 'Labor condition', locationId: w.site.id, postedOn: '2026-11-16' })))
    w.noticeA = a.body.data.id; w.noticeB = b.body.data.id
    const list = await json(await notices.GET(req('GET', '/api/compliance/notice-postings')))
    expect(list.body.data.notices.map((x: any) => [x.postedOn, x.periodEndsOn])).toEqual([['2026-11-16', '2026-11-30'], ['2026-11-09', '2026-11-23']])
  })

  it('a notice at a site that is not the firm’s is refused in a sentence', async () => {
    as(w.hr.primaryEmail)
    const r = await json(await notices.POST(req('POST', '/api/compliance/notice-postings', { kind: 'Labor condition', locationId: 'nope', postedOn: '2026-11-09' })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/must be one of your firm’s sites/)
  })

  it('when a posting period ends the agent opens one card to HR to take it down, and not for the notice still up', async () => {
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.firm.id)
    const mine = (await cards(w.firm.id)).filter((c) => c.question.includes('has been up its required time'))
    expect(mine).toHaveLength(1)
    expect(mine[0].ownerPersonId).toBe(w.hr.id)
    expect(mine[0].question).toBe('The Labor condition notice posted at Lakewood HQ on Nov 9, 2026 has been up its required time. Take it down and record the removal?')
    expect(await prisma.noticePosting.count({ where: { takenDownOn: { not: null } } })).toBe(0)
  })

  it('taking a notice down early is refused until a reason is given, then recorded with it', async () => {
    as(w.hr.primaryEmail)
    const no = await json(await notice.PATCH(req('PATCH', `/api/compliance/notice-postings/${w.noticeB}`, { takenDownOn: '2026-11-20' }), p(w.noticeB)))
    expect(no.status).toBe(422)
    expect(no.body.error.message).toMatch(/Say why the notice came down sooner/)
    const yes = await json(await notice.PATCH(req('PATCH', `/api/compliance/notice-postings/${w.noticeB}`, { takenDownOn: '2026-11-20', reason: 'The site closed early' }), p(w.noticeB)))
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    expect((await ledger(w.firm.id, 'NOTICE_REMOVED_EARLY'))[0].summary).toMatch(/Reason: The site closed early/)
  })

  it('a person recording the removal on time closes the loop and a notice cannot come down before it went up', async () => {
    as(w.hr.primaryEmail)
    const bad = await json(await notice.PATCH(req('PATCH', `/api/compliance/notice-postings/${w.noticeA}`, { takenDownOn: '2026-11-01' }), p(w.noticeA)))
    expect(bad.status).toBe(422)
    const ok = await json(await notice.PATCH(req('PATCH', `/api/compliance/notice-postings/${w.noticeA}`, { takenDownOn: '2026-11-23' }), p(w.noticeA)))
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect((await prisma.noticePosting.findUniqueOrThrow({ where: { id: w.noticeA } })).removedById).toBe(w.hr.id)
    const before = (await cards(w.firm.id)).length
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.firm.id)
    expect((await cards(w.firm.id)).length).toBe(before)
  })
})

describe('the compliance watch: the public access file', () => {
  it('a petition filed on a Friday has its file tracked as due the Monday, with one card to HR', async () => {
    as(w.hr.primaryEmail)
    const f = await json(await petition.PATCH(req('PATCH', `/api/compliance/immigration-petitions/${w.petition.id}`, { filedOn: '2026-11-20', stage: 'FILED' }), p(w.petition.id)))
    expect(f.status, JSON.stringify(f.body)).toBe(200)
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.firm.id)
    const file = await prisma.publicAccessFile.findFirstOrThrow({ where: { petitionId: w.petition.id } })
    expect(file.readyBy.toISOString().slice(0, 10)).toBe('2026-11-23')
    expect(file.approvedById).toBeNull()
    const d = (await cards(w.firm.id)).filter((c) => c.question.includes('public access file'))
    expect(d).toHaveLength(1)
    expect(d[0].ownerPersonId).toBe(w.hr.id)
    expect(d[0].question).toBe('The public access file for Priya Nair’s petition is due Nov 23, 2026. Is it ready to approve?')
    w.file = file
  })

  it('running again opens no second tracker and no second card', async () => {
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.firm.id)
    expect(await prisma.publicAccessFile.count({ where: { petitionId: w.petition.id } })).toBe(1)
    expect((await cards(w.firm.id)).filter((c) => c.question.includes('public access file'))).toHaveLength(1)
  })

  it('once the due day has passed with no approval a second card says it is overdue', async () => {
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.firm.id, new Date('2026-11-25T12:00:00Z'))
    const late = (await cards(w.firm.id)).filter((c) => c.question.includes('was due Nov 23, 2026 and is not approved'))
    expect(late).toHaveLength(1)
  })

  it('approving after the due day is refused until a reason is given, then recorded as late with it', async () => {
    as(w.hr.primaryEmail)
    const no = await json(await accessFile.PATCH(req('PATCH', `/api/compliance/access-files/${w.file.id}`, { readyOn: '2026-11-25' }), p(w.file.id)))
    expect(no.status).toBe(422)
    expect(no.body.error.message).toMatch(/Say why it was ready later/)
    const yes = await json(await accessFile.PATCH(req('PATCH', `/api/compliance/access-files/${w.file.id}`, { readyOn: '2026-11-25', reason: 'Counsel sent it back for a correction' }), p(w.file.id)))
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    const done = await prisma.publicAccessFile.findUniqueOrThrow({ where: { id: w.file.id } })
    expect([done.approvedById, done.readyOn?.toISOString().slice(0, 10)]).toEqual([w.hr.id, '2026-11-25'])
    expect((await ledger(w.firm.id, 'ACCESS_FILE_APPROVED_LATE'))[0].summary).toMatch(/Reason: Counsel sent it back/)
  })

  it('an approved file opens no further card', async () => {
    const before = (await cards(w.firm.id)).length
    await runs(COMPLIANCE_WATCH_AGENT, registerComplianceWatch, w.firm.id, new Date('2026-11-27T12:00:00Z'))
    expect((await cards(w.firm.id)).length).toBe(before)
  })
})

describe('what these agents never do', () => {
  it('no task was proposed and nothing was sent, on any of the three agents', async () => {
    expect(await prisma.agentTask.count({ where: { companyId: { in: [w.firm.id, w.client.id] } } })).toBe(0)
  })

  it('every act the agents did is on the ledger under the agent’s key with its rule version', async () => {
    const rows = await prisma.recordAction.findMany({ where: { companyId: { in: [w.firm.id, w.client.id] }, agentKey: { in: [CONTRACTS_CHECKLIST_AGENT, IMMIGRATION_CHECKLIST_AGENT, COMPLIANCE_WATCH_AGENT] }, action: { notIn: ['NOT_RUN', 'STOPPED_AT_CAP', 'FAILED', 'SWITCH_CHANGED'] } } })
    expect(rows.length).toBeGreaterThan(10)
    expect(rows.every((r) => r.heldAs === 'agent' && r.ruleVersion)).toBe(true)
  })

  it('on drafts only the agents still list and open cards, since they send nothing', async () => {
    await switchOn(w.firm.id, CONTRACTS_CHECKLIST_AGENT, 'DRAFT_ONLY')
    const l = await line({ msaId: w.msa.id, paymentTerms: 60 })
    const out = await runs(CONTRACTS_CHECKLIST_AGENT, registerContractsChecklist, w.firm.id)
    expect(out.ran).toBe(true)
    expect(await prisma.checklistItem.count({ where: { ownerId: l.id, state: 'DRIFT' } })).toBe(1)
  })
})

describe('the two new lists the screens read', () => {
  it('a seat that does not look after contracts is refused the checklist list, and the refusal is on the access log before the answer', async () => {
    const outsider = await person('Olive Outsider')
    await seat(w.firm.id, outsider, (await prisma.role.create({ data: { companyId: w.firm.id, name: 'Reader', permissions: ['requirements.read'] } })).id)
    const before = await prisma.accessLog.count({ where: { actorPersonId: outsider.id } })
    as(outsider.primaryEmail)
    const r = await json(await itemsList.GET(req('GET', '/api/compliance/checklist-items')))
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { actorPersonId: outsider.id } })).toBe(before + 1)
    w.outsider = outsider
  })

  it('the contract manager reads the checklist list with the agreed value beside the line’s own', async () => {
    as(w.cm.primaryEmail)
    const r = await json(await itemsList.GET(req('GET', '/api/compliance/checklist-items')))
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.data.placements)).toBe(true)
    expect(r.body.data.rules.confirmed).toBe(false)
  })

  it('a seat that does not look after paperwork is refused the public access files, and the refusal is on the access log before the answer', async () => {
    const before = await prisma.accessLog.count({ where: { actorPersonId: w.outsider.id } })
    as(w.outsider.primaryEmail)
    const r = await json(await accessFiles.GET(req('GET', '/api/compliance/access-files')))
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { actorPersonId: w.outsider.id } })).toBe(before + 1)
  })

  it('HR reads the public access files with the day each is due and whether a person approved it', async () => {
    as(w.hr.primaryEmail)
    const r = await json(await accessFiles.GET(req('GET', '/api/compliance/access-files')))
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.data.files)).toBe(true)
    expect(r.body.data.mayApprove).toBe(true)
  })
})
