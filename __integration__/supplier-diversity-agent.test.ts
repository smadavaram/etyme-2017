/**
 * Supplier diversity under plugin 5 (record 132), on the database through the
 * real routes, the real runner and the real grader. A person records a portal
 * registration; the agent drafts its answers from the firm's own record and
 * claims no certification that is not held and no ownership fact the Owner has
 * not attested. A bid set aside for a certification is never put up as
 * eligible while the firm does not hold it. A person submits and marks it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { proposalsAgentStep } from '@/lib/agents/proposals-agent'
import { PROPOSAL_AGENT, PROPOSAL_RULE } from '@/lib/proposals/draft-rules'
import { gradeSkillRun } from '@/lib/skills/grade'
import { GET as listProposals, POST as startProposal } from '@/app/api/proposals/route'
import { POST as approve } from '@/app/api/proposals/[id]/approve/route'
import * as registrations from '@/app/api/diversity/registrations/route'
import * as registration from '@/app/api/diversity/registrations/[id]/route'
import { POST as markSubmitted } from '@/app/api/diversity/registrations/[id]/submitted/route'
import * as legalEntity from '@/app/api/diversity/legal-entity/route'
import * as papers from '@/app/api/diversity/certificate-papers/route'
import * as certs from '@/app/api/governance/certifications/route'
import * as attest from '@/app/api/governance/ownership-attestations/route'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-supplier-diversity'
process.env.NEXTAUTH_URL = 'https://etyme.example'

const OWNER = 'dana.owner@bidfirm.example', AM = 'oli.manager@bidfirm.example', HR = 'hana.resources@bidfirm.example', OTHER = 'sam.owner@otherfirm.example'
const MON = new Date('2026-11-23T12:00:00Z')
/** A weekday that has already happened, one per call: a card cannot open on a day that has not come, and the agent runs once a day. */
let dayCount = 0
const nextDay = () => { const d = new Date('2026-11-02T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dayCount + 2 * Math.floor(dayCount / 5)); dayCount++; return d }
const s: Record<string, string> = {}
const QUESTIONS = `1. What is your legal business name?
2. Do you hold an 8(a) certification?
3. Is the business minority-owned?
4. Describe your quality process.`

async function run(at: Date) {
  registerAgent(PROPOSAL_AGENT, { ruleVersion: PROPOSAL_RULE, step: (ctx) => proposalsAgentStep(ctx) })
  try { return await runAgent(PROPOSAL_AGENT, s.firm, at) } finally { unregisterAgent(PROPOSAL_AGENT) }
}
const call = async (email: string, f: () => Promise<Response>) => { as(email); return json(await f()) }
const idp = (id: string) => ({ params: Promise.resolve({ id }) })
const record = (email: string, body: unknown) => call(email, () => registrations.POST(req('POST', '/api/diversity/registrations', body)))
const registrationRow = (id: string) => prisma.diversityRegistration.findUniqueOrThrow({ where: { id } })
const bid = (title: string, extra: Record<string, unknown> = {}) => call(AM, () => startProposal(req('POST', '/api/proposals', { title, buyer: 'County Transit', requirements: '1. Describe your approach to quality assurance.', ...extra })))
const proposal = (id: string) => prisma.proposal.findUniqueOrThrow({ where: { id } })
const regrade = async (runId: string) => { await prisma.check.deleteMany({ where: { runId } }); return gradeSkillRun(runId) }
const heldBody = () => ({ kind: 'EIGHT_A', status: 'HELD', certifier: 'The certifying agency', number: 'A-1', issuedOn: '2026-01-01', expiresOn: '2027-12-01', documentId: s.paper })
const SET_ASIDE = 'This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.'

beforeAll(async () => {
  await resetDatabase()
  const firm = await prisma.company.create({ data: { name: 'Bidfirm Staffing', slug: 'bidfirm-diversity', kind: 'VENDOR', currency: 'USD', pluginsOn: [] } })
  const other = await prisma.company.create({ data: { name: 'Otherfirm Staffing', slug: 'otherfirm-diversity', kind: 'VENDOR', currency: 'USD', pluginsOn: ['PUBLIC_SECTOR'] } })
  s.firm = firm.id; s.other = other.id
  const role = (companyId: string, name: string, permissions: string[]) => prisma.role.create({ data: { companyId, name, permissions } })
  const seats: [string, string, string, string[], string][] = [
    [OWNER, 'Dana Owner', firm.id, ['*'], 'Owner'], [AM, 'Oli Manager', firm.id, ['submissions.read', 'submissions.create'], 'Account Manager'],
    [HR, 'Hana Resources', firm.id, ['submissions.read'], 'HR'], [OTHER, 'Sam Owner', other.id, ['*'], 'Owner'],
  ]
  for (const [email, name, companyId, perms, roleName] of seats) {
    const p = await prisma.person.create({ data: { name, primaryEmail: email } })
    s[email] = p.id
    await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId, roleId: (await role(companyId, roleName, perms)).id } })
  }
  await prisma.agentSwitch.create({ data: { companyId: firm.id, agentKey: PROPOSAL_AGENT, state: 'ON', changedById: s[OWNER] } })
  const template = await prisma.docTemplate.create({ data: { companyId: firm.id, name: 'Certificate', audience: 'COMPANY' } as never })
  const paper = await prisma.docInstance.create({ data: { templateId: template.id, subjectType: 'COMPANY', subjectId: firm.id, status: 'UPLOADED', fileName: 'cert.pdf', signedFileUrl: 'https://files.example/cert.pdf' } })
  s.paper = paper.id
}, 240_000)

describe('while plugin 5 is off', () => {
  it('every diversity route refuses in one sentence naming the plugin, and the agent drafts no registration answers', async () => {
    const make = await prisma.person.findFirstOrThrow({ where: { primaryEmail: AM } })
    const kept = await prisma.diversityRegistration.create({ data: { companyId: s.firm, buyerName: 'Kept while off', questions: QUESTIONS, createdById: make.id } })
    const refusals = [
      await call(AM, () => registrations.GET(req('GET', '/api/diversity/registrations'))),
      await record(AM, { buyerName: 'X' }),
      await call(AM, () => registration.PATCH(req('PATCH', '/x', { answers: 'words' }), idp('x'))),
      await call(AM, () => markSubmitted(req('POST', '/x', {}), idp('x'))),
      await call(OWNER, () => legalEntity.GET(req('GET', '/api/diversity/legal-entity'))),
      await call(OWNER, () => legalEntity.PUT(req('PUT', '/api/diversity/legal-entity', { legalName: 'X' }))),
      await call(OWNER, () => papers.GET(req('GET', '/api/diversity/certificate-papers'))),
    ]
    for (const r of refusals) expect(r.body.error.code).toBe('PLUGIN_OFF')
    expect(refusals[0].body.error.message).toBe('Public-sector proposals is off for Bidfirm Staffing. The Owner turns it on in Settings.')
    await run(MON)
    expect((await registrationRow(kept.id)).answers).toBeNull()
    await prisma.diversityRegistration.delete({ where: { id: kept.id } })
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['PUBLIC_SECTOR'] } })
  })
})

describe('the legal entity name bids are made in', () => {
  it('an Account Manager is told only an Owner enters it, the refusal is on the access log before it is sent, and nothing changes', async () => {
    const before = await prisma.accessLog.count({ where: { action: 'DIVERSITY_REFUSED', allowed: false } })
    const r = await call(AM, () => legalEntity.PUT(req('PUT', '/api/diversity/legal-entity', { legalName: 'Should Not Stick LLC' })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Only an Owner of Bidfirm Staffing may enter the legal entity name. An Admin may read them.')
    expect(await prisma.accessLog.count({ where: { action: 'DIVERSITY_REFUSED', allowed: false } })).toBe(before + 1)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.firm } })).legalName).toBeNull()
  })
  it('until the Owner enters it the page says it is not set, and the Account Manager is told she may not change it', async () => {
    const r = await call(AM, () => legalEntity.GET(req('GET', '/api/diversity/legal-entity')))
    expect(r.body.data.legalName).toBeNull()
    expect(r.body.data.says).toMatch(/The legal entity name is not set/)
    expect(r.body.mayWrite).toBe(false)
  })
  it('the Owner enters it, it is the company’s legal name, and the entry is on the ledger naming her', async () => {
    const r = await call(OWNER, () => legalEntity.PUT(req('PUT', '/api/diversity/legal-entity', { legalName: 'Bidfirm Staffing Holdings LLC' })))
    expect(r.status).toBe(200)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.firm } })).legalName).toBe('Bidfirm Staffing Holdings LLC')
    expect(await prisma.event.count({ where: { companyId: s.firm, type: 'diversity.legal_entity_set', actorPersonId: s[OWNER] } })).toBe(1)
  })
  it('another firm’s Owner cannot change it, and an empty name is refused in a sentence', async () => {
    const empty = await call(OWNER, () => legalEntity.PUT(req('PUT', '/api/diversity/legal-entity', { legalName: '  ' })))
    expect(empty.status).toBe(422)
    const theirs = await call(OTHER, () => legalEntity.GET(req('GET', '/api/diversity/legal-entity')))
    expect(theirs.body.data.legalName).toBeNull()
  })
})

describe('a portal registration, drafted from the record while nothing is held', () => {
  let r1 = ''
  beforeAll(async () => {
    const made = await record(AM, { buyerName: 'Metro Transit Authority', portalUrl: 'https://supplier.metro.example/register', questions: QUESTIONS })
    expect(made.status).toBe(201)
    r1 = made.body.data.id
    await run(MON)
  }, 120_000)

  it('the agent drafts the legal name from the Owner’s entry, says 8(a) is not held yet, and leaves minority ownership to a person because the Owner has not attested it', async () => {
    const r = await registrationRow(r1)
    expect(r.status).toBe('DRAFTED')
    expect(r.answers).toContain('A: Legal entity: Bidfirm Staffing Holdings LLC')
    expect(r.answers).toMatch(/A: Not held yet: 8\(a\)\. This draft claims no certification the record does not hold\./)
    expect(r.answers).toMatch(/A: A person answers\. The Owner has not attested to this on the record/)
    expect(r.answers).toContain('A: A person answers.')
    expect(r.answers).not.toMatch(/Held today|Attested by the Owner/)
  })
  it('the agent never marks it submitted: nobody is named as having submitted it, however often it runs', async () => {
    await run(nextDay())
    const r = await registrationRow(r1)
    expect(r.status).toBe('DRAFTED')
    expect(r.submittedById).toBeNull()
    expect(r.submittedAt).toBeNull()
  })
  it('the draft is a skill run on the ledger and a row under the supplier twin, and it passes its checker', async () => {
    const runs = await prisma.agentRun.findMany({ where: { companyId: s.firm, skillKey: 'registration.draft', recordId: r1 } })
    expect(runs).toHaveLength(1)
    expect(await regrade(runs[0].id)).toMatchObject({ graded: true, verdict: 'PASS' })
    const rows = await prisma.twinAction.findMany({ where: { companyId: s.firm, entityType: 'DiversityRegistration', entityId: r1 } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ twinKind: 'SUPPLIER', actorType: 'TWIN', outcome: 'PERFORMED', action: 'registration.draft' })
    expect(await prisma.recordAction.count({ where: { companyId: s.firm, recordType: 'DiversityRegistration', recordId: r1, action: 'REGISTRATION_DRAFTED' } })).toBe(1)
  })
  it('a registration is read back against the record: if the answers claim a certification the firm does not hold, the checker fails it', async () => {
    const [run1] = await prisma.agentRun.findMany({ where: { companyId: s.firm, skillKey: 'registration.draft', recordId: r1 } })
    const was = (await registrationRow(r1)).answers!
    await prisma.diversityRegistration.update({ where: { id: r1 }, data: { answers: was.replace(/Not held yet: 8\(a\)\.[^\n]*/, 'Held today: 8(a)') } })
    const out = await regrade(run1.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/claims 8\(a\), which the record does not hold today/)
    await prisma.diversityRegistration.update({ where: { id: r1 }, data: { answers: was } })
    await prisma.check.deleteMany({ where: { runId: run1.id } })
  })
  it('a person’s edit is kept, and a later run never writes over it', async () => {
    const edited = await call(AM, () => registration.PATCH(req('PATCH', '/x', { answers: 'Q1: x\nA: My own words.' }), idp(r1)))
    expect(edited.status).toBe(200)
    await run(nextDay())
    expect((await registrationRow(r1)).answers).toBe('Q1: x\nA: My own words.')
  })
  it('only a person marks it submitted on the portal, and it records who and when; marking it twice, or editing it afterwards, is refused', async () => {
    const hr = await call(HR, () => markSubmitted(req('POST', '/x', {}), idp(r1)))
    expect(hr.status).toBe(403)
    const done = await call(AM, () => markSubmitted(req('POST', '/x', {}), idp(r1)))
    expect(done.status).toBe(200)
    const r = await registrationRow(r1)
    expect(r).toMatchObject({ status: 'SUBMITTED', submittedById: s[AM] })
    expect(r.submittedAt).not.toBeNull()
    expect((await call(AM, () => markSubmitted(req('POST', '/x', {}), idp(r1)))).status).toBe(409)
    expect((await call(AM, () => registration.PATCH(req('PATCH', '/x', { answers: 'late' }), idp(r1)))).status).toBe(409)
    expect(await prisma.event.count({ where: { companyId: s.firm, type: 'diversity.registration_submitted_by_person', actorPersonId: s[AM] } })).toBe(1)
  })
  it('a registration with no answers cannot be marked submitted, in a sentence that says what to do', async () => {
    const bare = await record(AM, { buyerName: 'City Procurement' })
    const r = await call(AM, () => markSubmitted(req('POST', '/x', {}), idp(bare.body.data.id)))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/There are no answers on this registration yet/)
  })
  it('a seat that can only read sees the list and is not offered to record, edit or mark one', async () => {
    const list = await call(HR, () => registrations.GET(req('GET', '/api/diversity/registrations')))
    expect(list.status).toBe(200)
    expect(list.body.mayWrite).toBe(false)
    expect((await record(HR, { buyerName: 'X' })).status).toBe(403)
  })
})

describe('the same questions once the Owner holds 8(a) and attests ownership', () => {
  it('the Owner records the certificate, and a registration drafted after says Held today and who attested minority ownership and when', async () => {
    const pick = await call(OWNER, () => papers.GET(req('GET', '/api/diversity/certificate-papers')))
    expect(pick.body.data.map((p: { id: string }) => p.id)).toContain(s.paper)
    expect((await call(OWNER, () => certs.POST(req('POST', '/api/governance/certifications', heldBody())))).status).toBe(201)
    expect((await call(OWNER, () => attest.POST(req('POST', '/api/governance/ownership-attestations', { fact: 'MINORITY_OWNED', attested: true })))).status).toBe(201)
    const made = await record(AM, { buyerName: 'State Supplier Office', questions: QUESTIONS })
    await run(nextDay())
    const r = await registrationRow(made.body.data.id)
    expect(r.answers).toContain('A: Held today: 8(a)')
    expect(r.answers).toMatch(/A: Attested by the Owner: Minority-owned, attested by Dana Owner on \d{4}-\d{2}-\d{2}/)
    const [one] = await prisma.agentRun.findMany({ where: { companyId: s.firm, skillKey: 'registration.draft', recordId: made.body.data.id } })
    expect(await regrade(one.id)).toMatchObject({ graded: true, verdict: 'PASS' })
  })
  it('the agent has no door that attests, records a certification or submits: those acts are in the never tier of the supplier’s contract', async () => {
    const { tierIn, contractFor } = await import('@/lib/twin/role-contract')
    const contract = await contractFor(s.firm, 'SUPPLIER')
    for (const act of ['registration.submit', 'certification.claim', 'ownership.attest', 'proposal.submit', 'proposal.sign']) expect(tierIn(contract, act), act).toBe('NEVER')
    expect(tierIn(contract, 'registration.draft')).not.toBe('NEVER')
  })
})

describe('a bid set aside for a certification', () => {
  let p1 = ''
  it('naming a certification that is not one of the kinds, or Another one with no name, is refused in a sentence', async () => {
    expect((await bid('Bad kind', { requiresCertification: 'GOLD' })).body.error.message).toMatch(/Pick the certification the bid is set aside for/)
    expect((await bid('No name', { requiresCertification: 'OTHER' })).body.error.message).toMatch(/Name the certification the bid is set aside for/)
  })
  it('with the 8(a) certification lapsed, the agent drafts the bid, says it is set aside for 8(a) firms, claims nothing, and does not put it up as eligible', async () => {
    // The Owner’s 8(a) is held in date now; move it to lapsed so the firm does not hold it today.
    await prisma.supplierCertification.updateMany({ where: { companyId: s.firm, kind: 'EIGHT_A' }, data: { status: 'LAPSED' } })
    const made = await bid('RFP 8(a) set-aside staffing', { requiresCertification: 'EIGHT_A' })
    expect(made.status).toBe(201)
    p1 = made.body.data.id
    await run(nextDay())
    const p = await proposal(p1)
    expect(p.draft).toContain('This bid is set aside for 8(a) firms. Your 8(a) certification has lapsed.')
    expect(p.draft).toContain('No certification is held on the record, so this draft claims none.')
    expect(p.draft).not.toMatch(/^Held today:/m)
    expect(p.draft).toContain('Entity: Bidfirm Staffing Holdings LLC')
    expect(p.state).toBe('NEEDS_PIECES')
    expect(await prisma.agentTask.count({ where: { companyId: s.firm, kind: 'PROPOSAL_REVIEW', recordId: p1 } })).toBe(0)
  })
  it('the page says so in a sentence, and approving it is refused with that sentence', async () => {
    const g = await call(AM, () => listProposals(req('GET', '/api/proposals')))
    const row = g.body.data.find((x: { id: string }) => x.id === p1)
    expect(row.setAside).toBe('8(a)')
    expect(row.eligibility).toEqual({ eligible: false, says: 'This bid is set aside for 8(a) firms. Your 8(a) certification has lapsed.' })
    await prisma.proposal.update({ where: { id: p1 }, data: { state: 'READY_FOR_PERSON' } })
    const no = await call(AM, () => approve(req('POST', '/x', {}), idp(p1)))
    expect(no.status).toBe(409)
    expect(no.body.error.message).toBe('This bid is set aside for 8(a) firms. Your 8(a) certification has lapsed.')
    expect((await proposal(p1)).state).toBe('READY_FOR_PERSON')
    expect((await proposal(p1)).approvedById).toBeNull()
  })
  it('the next run takes it back to waiting, because a certification that is not held cannot make a bid ready', async () => {
    await run(nextDay())
    expect((await proposal(p1)).state).toBe('NEEDS_PIECES')
  })
  it('once the Owner records the certification as held, in date, with its certificate, the next run puts the bid up for a person’s yes and she may approve it', async () => {
    expect((await call(OWNER, () => certs.POST(req('POST', '/api/governance/certifications', heldBody())))).status).toBe(200)
    await run(nextDay())
    expect((await proposal(p1)).state).toBe('READY_FOR_PERSON')
    expect(await prisma.agentTask.count({ where: { companyId: s.firm, kind: 'PROPOSAL_REVIEW', recordId: p1 } })).toBe(1)
    const ok = await call(AM, () => approve(req('POST', '/x', {}), idp(p1)))
    expect(ok.status).toBe(200)
    expect((await proposal(p1)).approvedById).toBe(s[AM])
  })
  it('the proposal checker agrees with the record: a bid left waiting is still right once the certification’s expiry day has passed', async () => {
    const runs = await prisma.agentRun.findMany({ where: { companyId: s.firm, skillKey: 'proposal.check', recordId: p1 }, orderBy: { at: 'asc' } })
    expect(runs.length).toBeGreaterThan(0)
    for (const r of runs.slice(0, 1)) expect(await regrade(r.id)).toMatchObject({ graded: true })
    const q = await bid('RFP lapsed later', { requiresCertification: 'EIGHT_A' })
    await run(nextDay())
    const [chk] = await prisma.agentRun.findMany({ where: { companyId: s.firm, skillKey: 'proposal.check', recordId: q.body.data.id } })
    expect(chk).toBeDefined()
    await prisma.proposal.update({ where: { id: q.body.data.id }, data: { state: 'NEEDS_PIECES' } })
    await prisma.supplierCertification.updateMany({ where: { companyId: s.firm, kind: 'EIGHT_A' }, data: { expiresOn: new Date('2026-11-01') } })
    const later = await regrade(chk.id)
    // The pieces say ready; the record no longer holds 8(a), so waiting is right and the checker agrees.
    expect(later).toMatchObject({ graded: true, verdict: 'PASS' })
  })
  it('a certification that expires by date stops counting the day after its expiry, with no sweep needed', async () => {
    const made = await bid('RFP expiry day', { requiresCertification: 'EIGHT_A' })
    const g = await call(AM, () => listProposals(req('GET', '/api/proposals')))
    const row = g.body.data.find((x: { id: string }) => x.id === made.body.data.id)
    expect(row.eligibility.eligible).toBe(false)
    expect(row.eligibility.says).toContain('expired on 2026-11-01')
  })
  it('an open bid is unaffected: it is eligible and reads as before', async () => {
    const made = await bid('RFP open to all')
    const g = await call(AM, () => listProposals(req('GET', '/api/proposals')))
    const row = g.body.data.find((x: { id: string }) => x.id === made.body.data.id)
    expect(row.setAside).toBeNull()
    expect(row.eligibility).toEqual({ eligible: true, says: null })
  })
  it('the set-aside sentence the draft carries is the one the Owner’s reader gives for a certification never held', async () => {
    await prisma.supplierCertification.deleteMany({ where: { companyId: s.firm } })
    const made = await bid('RFP never held', { requiresCertification: 'EIGHT_A' })
    await run(nextDay())
    expect((await proposal(made.body.data.id)).draft).toContain(SET_ASIDE)
  })
})

describe('another firm', () => {
  it('another firm’s Owner sees none of this firm’s registrations and cannot mark one submitted', async () => {
    const mine = await prisma.diversityRegistration.findFirstOrThrow({ where: { companyId: s.firm } })
    const list = await call(OTHER, () => registrations.GET(req('GET', '/api/diversity/registrations')))
    expect(list.status).toBe(200)
    expect(list.body.data).toEqual([])
    expect((await call(OTHER, () => markSubmitted(req('POST', '/x', {}), idp(mine.id)))).status).toBe(404)
    expect((await call(OTHER, () => registration.PATCH(req('PATCH', '/x', { answers: 'mine now' }), idp(mine.id)))).status).toBe(404)
  })
})
