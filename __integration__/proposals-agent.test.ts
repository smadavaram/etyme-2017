/**
 * The proposals agent (record 124, plugin 5) on the database, through the
 * real runner, the real routes and the real grader. A person records a bid;
 * the agent drafts it from the firm's own record, flags what is missing,
 * asks a person for a yes and reminds the seats owing a piece. A person
 * approves and a person says it was sent. The agent never does either.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { proposalsAgentStep } from '@/lib/agents/proposals-agent'
import { PROPOSAL_AGENT, PROPOSAL_RULE } from '@/lib/proposals/draft-rules'
import { sendMail } from '@/lib/notify/mail-door'
import { gradeSkillRun } from '@/lib/skills/grade'
import { GET as listProposals, POST as startProposal } from '@/app/api/proposals/route'
import { PATCH as editDraft } from '@/app/api/proposals/[id]/route'
import { PATCH as markPiece } from '@/app/api/proposals/[id]/pieces/[pieceId]/route'
import { POST as approve } from '@/app/api/proposals/[id]/approve/route'
import { POST as markSent } from '@/app/api/proposals/[id]/submitted/route'
import { POST as decide } from '@/app/api/decision-items/[id]/route'
import type { ModelDeps } from '@/lib/model-gateway/call'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-proposals-agent'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]

const OWNER = 'dana.owner@firm.example', AM = 'oli.manager@firm.example', HR = 'hana.resources@firm.example'
const MON = new Date('2026-11-23T12:00:00Z')
const BID = `1. Provide a certificate of insurance.
2. Provide the hourly rates by labor category.
3. Provide resumes of key personnel.
4. Describe your past performance on similar contracts.
5. Describe your approach to quality assurance.`
const s: Record<string, string> = {}
const mailDeps = { env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false, hand: async () => ({ provider: 'Resend' as const, messageId: 'm' }) }
const REGISTER = JSON.stringify([{ id: 'model-a', label: 'Provider A', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'KEY_A' }])
const gatewayAnswering = (answer: string): ModelDeps => ({ env: { ETYME_MODEL_REGISTER: REGISTER, KEY_A: 'x' }, modelOn: async () => true, adapters: { sdk: { call: async () => ({ text: answer, usage: { input_tokens: 100, output_tokens: 50 } }) as never } } })

async function run(at: Date, over: { gateway?: ModelDeps } = {}) {
  registerAgent(PROPOSAL_AGENT, { ruleVersion: PROPOSAL_RULE, step: (ctx) => proposalsAgentStep(ctx, { send: (m) => sendMail(m, mailDeps as never), gateway: over.gateway }) })
  try { return await runAgent(PROPOSAL_AGENT, s.firm, at) } finally { unregisterAgent(PROPOSAL_AGENT) }
}
const setSwitch = (state: 'OFF' | 'DRAFT_ONLY' | 'ON') => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: s.firm, agentKey: PROPOSAL_AGENT } }, update: { state }, create: { companyId: s.firm, agentKey: PROPOSAL_AGENT, state, changedById: s[OWNER] },
})
const proposal = (id: string) => prisma.proposal.findUniqueOrThrow({ where: { id }, include: { pieces: { orderBy: { label: 'asc' } } } })
const tasks = (kind: string, recordId?: string) => prisma.agentTask.findMany({ where: { companyId: s.firm, kind, ...(recordId ? { recordId } : {}) }, orderBy: { createdAt: 'asc' } })
const runsOf = (skillKey: string, recordId: string) => prisma.agentRun.findMany({ where: { companyId: s.firm, skillKey, recordId }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const start = async (title: string, requirements = BID) => {
  as(AM)
  const r = await json(await startProposal(req('POST', '/api/proposals', { title, buyer: 'County Transit', dueAt: '2027-01-31', sourceUrl: 'https://county.example/rfp', requirements })))
  expect(r.status).toBe(201)
  return r.body.data.id as string
}
const piece = <T extends { id: string; kind: string }>(p: { pieces: T[] }, kind: string): T => p.pieces.find((x) => x.kind === kind)!
const mark = async (email: string, proposalId: string, pieceId: string, body: unknown) => { as(email); return json(await markPiece(req('PATCH', '/x', body), { params: Promise.resolve({ id: proposalId, pieceId }) })) }
const approveCard = async (email: string, decisionId: string) => { as(email); return json(await decide(req('POST', '/x', { verdict: 'APPROVE' }), { params: Promise.resolve({ id: decisionId }) })) }
/** Grade a run afresh: the grader keeps the first answer, so an earlier check is cleared first. */
const regrade = async (runId: string) => { await prisma.check.deleteMany({ where: { runId } }); return gradeSkillRun(runId) }
const yes = (taskDecisionId: string, by: string) => prisma.decisionItem.update({ where: { id: taskDecisionId }, data: { state: 'APPROVED', decidedByPersonId: by, decidedAt: new Date() } })

let p1 = ''

beforeAll(async () => {
  await resetDatabase()
  const firm = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'quillbrook-proposals', kind: 'VENDOR', currency: 'USD', pluginsOn: [] } })
  s.firm = firm.id
  await prisma.legalEntity.create({ data: { companyId: firm.id, name: 'Quillbrook Staffing LLC', country: 'US', currency: 'USD' } })
  const role = (name: string, permissions: string[]) => prisma.role.create({ data: { companyId: firm.id, name, permissions } })
  const owner = await role('Owner', ['*']), am = await role('Account Manager', ['submissions.read', 'submissions.create']), hr = await role('HR', ['submissions.read'])
  for (const [email, name, r] of [[OWNER, 'Dana Owner', owner], [AM, 'Oli Manager', am], [HR, 'Hana Resources', hr]] as const) {
    const p = await prisma.person.create({ data: { name, primaryEmail: email } })
    s[email] = p.id
    await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: firm.id, roleId: r.id } })
  }
  // The firm's own record: two engagements with two clients, and one person on the bench who said yes to being listed.
  for (const [n, who] of [['Ardmore Health', 'Priya Nair'], ['Belmont Transit', 'Tom Ruiz']]) {
    const client = await prisma.company.create({ data: { name: n, slug: n.toLowerCase().replace(/\s+/g, '-'), kind: 'CLIENT' } })
    const w = await prisma.person.create({ data: { name: who, primaryEmail: `${who.split(' ')[0].toLowerCase()}@worker.example` } })
    await prisma.sellContract.create({ data: { companyId: firm.id, clientCompanyId: client.id, personId: w.id, startDate: new Date('2026-09-01'), state: 'IN_PROGRESS', billRate: 9000 } as never })
    if (who === 'Priya Nair') {
      const cp = await prisma.consultantProfile.create({ data: { personId: w.id, skills: ['SQL', 'Spark'] } })
      await prisma.benchListing.create({ data: { consultantId: cp.id, companyId: firm.id, tier: 'MARKETING', state: 'GRANTED' } as never })
    }
  }
  await setSwitch('ON')
}, 240_000)

describe('while the plugin is off', () => {
  it('every proposals route refuses in one sentence naming the plugin, and the agent drafts and opens nothing', async () => {
    as(AM)
    const g = await json(await listProposals(req('GET', '/api/proposals')))
    expect(g.status).toBe(403)
    expect(g.body.error.message).toBe('Public-sector proposals is off for Quillbrook Staffing. The Owner turns it on in Settings.')
    for (const r of [
      await startProposal(req('POST', '/api/proposals', { title: 'X' })),
      await editDraft(req('PATCH', '/x', { draft: 'words' }), { params: Promise.resolve({ id: 'x' }) }),
      await markPiece(req('PATCH', '/x', { haveIt: false }), { params: Promise.resolve({ id: 'x', pieceId: 'y' }) }),
      await approve(req('POST', '/x', {}), { params: Promise.resolve({ id: 'x' }) }),
      await markSent(req('POST', '/x', {}), { params: Promise.resolve({ id: 'x' }) }),
    ]) expect((await json(r)).body.error.code).toBe('PLUGIN_OFF')
    // A bid recorded while it was on, then the plugin switched off: the agent leaves it alone.
    const own = await prisma.person.findFirstOrThrow({ where: { primaryEmail: AM } })
    const kept = await prisma.proposal.create({ data: { companyId: s.firm, title: 'Kept while off', createdById: own.id, requirements: BID } })
    const out = await run(MON)
    // The framework stops the run and says why on the ledger, instead of a silent no-op inside the step.
    expect(out.ran).toBe(false)
    expect(out.why).toBe('Proposals did not run: Public-sector proposals is off for Quillbrook Staffing. The Owner turns it on in Settings. Nothing was deleted.')
    expect((await proposal(kept.id)).draft).toBeNull()
    expect(await prisma.agentTask.count({ where: { companyId: s.firm } })).toBe(0)
    expect(await prisma.agentRun.count({ where: { companyId: s.firm, skillKey: { startsWith: 'proposal.' } } })).toBe(0)
    await prisma.proposal.delete({ where: { id: kept.id } })
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['PUBLIC_SECTOR'] } })
  })
})

describe('a bid a person recorded, the first run with no model set up', () => {
  beforeAll(async () => { p1 = await start('Solicitation 24-117'); await run(MON) }, 120_000)

  it('the rules write the draft from the firm’s own record, and the run says Not configured', async () => {
    const p = await proposal(p1)
    expect(p.draft).toMatch(/Quillbrook Staffing supplies contract staff in Spark, SQL/)
    expect(p.draft).toMatch(/2 engagements on its record with 2 clients/)
    const [r] = await runsOf('proposal.draft', p1)
    expect(r).toMatchObject({ tier: 'LOW', model: null, verdict: 'PASS', agentKey: PROPOSAL_AGENT })
    expect(r.failReason).toMatch(/^Not configured/)
  })

  it('the draft names nobody, states no rate and carries the buyer’s requirement lines without a status', async () => {
    const d = (await proposal(p1)).draft!
    expect(d).not.toMatch(/Priya|Tom Ruiz|Ardmore|Belmont/)
    expect(d).not.toMatch(/\$\s?\d/)
    expect(d).toContain('- Provide the hourly rates by labor category.')
  })

  it('the proposal gets a missing piece for each kind the requirements name, and the record fills only key personnel and past performance', async () => {
    const p = await proposal(p1)
    expect(p.pieces.map((x) => [x.kind, x.haveIt]).sort()).toEqual([['BENCH', true], ['COMPLIANCE', false], ['PAST_PERFORMANCE', true], ['RATES', false]])
    expect(piece(p, 'BENCH').source).toBe('1 person on the bench agreed to be listed (counted from the record)')
    expect(piece(p, 'RATES').source).toBeNull()
    expect(piece(p, 'COMPLIANCE').source).toBeNull()
  })

  it('it waits on pieces, and the page flags the requirement nothing answers, so a person writes it', async () => {
    expect((await proposal(p1)).state).toBe('NEEDS_PIECES')
    as(AM)
    const g = await json(await listProposals(req('GET', '/api/proposals')))
    const row = g.body.data.find((x: { id: string }) => x.id === p1)
    expect(g.body.mayWrite).toBe(true)
    expect(row.flags.map((f: { status: string }) => f.status).sort()).toEqual(['A_PERSON_WRITES', 'MISSING_PIECE', 'MISSING_PIECE'])
    expect(row.flags.find((f: { status: string }) => f.status === 'A_PERSON_WRITES').text).toBe('Describe your approach to quality assurance.')
  })

  it('no card for a yes is opened while a piece is missing', async () => {
    expect(await tasks('PROPOSAL_REVIEW', p1)).toHaveLength(0)
  })

  it('a reminder is proposed once for each seat that owes a piece, HR for the compliance papers and the Account Manager for the rates, and nothing is sent', async () => {
    const t = await tasks('PROPOSAL_CHASE', p1)
    expect(t).toHaveLength(2)
    expect(t.map((x) => (x.payload as { seatPersonId: string }).seatPersonId).sort()).toEqual([s[HR], s[AM]].sort())
    expect(t.every((x) => x.state === 'PROPOSED')).toBe(true)
    expect(await prisma.mailSend.count({ where: { companyId: s.firm, recordId: p1 } })).toBe(0)
    await run(MON) // a second run proposes nothing more
    expect(await tasks('PROPOSAL_CHASE', p1)).toHaveLength(2)
  })

  it('each act is a skill run on the ledger, and each draft, check and reminder proposal is a row under the supplier twin', async () => {
    for (const k of ['proposal.draft', 'proposal.check', 'proposal.chase']) expect((await runsOf(k, p1)).length, k).toBeGreaterThan(0)
    const rows = await prisma.twinAction.findMany({ where: { companyId: s.firm, entityType: 'Proposal', entityId: p1 } })
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(rows.every((r) => r.twinKind === 'SUPPLIER' && r.actorType === 'TWIN' && r.outcome === 'PERFORMED' && r.rationale.length > 0 && r.ruleCited.length > 0)).toBe(true)
    expect(new Set(rows.map((r) => r.action))).toEqual(new Set(['proposal.draft', 'proposal.chase']))
    expect(await prisma.recordAction.count({ where: { companyId: s.firm, agentKey: PROPOSAL_AGENT, recordType: 'Proposal', recordId: p1 } })).toBeGreaterThanOrEqual(2)
  })

  it('the draft, check and reminder runs each pass when their checkers re-read the record', async () => {
    for (const k of ['proposal.draft', 'proposal.check', 'proposal.chase']) {
      for (const r of await runsOf(k, p1)) expect(await regrade(r.id), k).toMatchObject({ graded: true, verdict: 'PASS' })
    }
  })

  it('a draft with an amount of money put in it afterwards fails its checker, naming that', async () => {
    const was = (await proposal(p1)).draft!
    await prisma.proposal.update({ where: { id: p1 }, data: { draft: was.replace('contract staff', 'contract staff at $95 an hour') } })
    const [r] = await runsOf('proposal.draft', p1)
    await prisma.check.deleteMany({ where: { runId: r.id } })
    const out = await gradeSkillRun(r.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/amount of money/)
    await prisma.proposal.update({ where: { id: p1 }, data: { draft: was } })
    await prisma.check.deleteMany({ where: { runId: r.id } })
  })
})

describe('the reminders, one yes per task', () => {
  it('on Drafts only nothing is sent, even after a person has said yes', async () => {
    for (const t of await tasks('PROPOSAL_CHASE', p1)) await yes(t.decisionId, s[AM])
    await setSwitch('DRAFT_ONLY')
    await run(MON)
    expect(await prisma.mailSend.count({ where: { companyId: s.firm, recordId: p1 } })).toBe(0)
  })

  it('with the agent On, each seat that owes a piece is sent one reminder naming it, to a colleague at the firm and to nobody else', async () => {
    await setSwitch('ON')
    await run(MON)
    const sent = await prisma.mailSend.findMany({ where: { companyId: s.firm, recordId: p1, outcome: 'SENT' }, orderBy: { createdAt: 'asc' } })
    expect(sent.flatMap((m) => m.toAddresses).sort()).toEqual([AM, HR].sort())
    const toHr = sent.find((m) => m.toAddresses.includes(HR))!
    expect(toHr.agentTaskId).toBeTruthy()
    await run(MON) // the follow-up waits two working days
    expect(await prisma.mailSend.count({ where: { companyId: s.firm, recordId: p1, outcome: 'SENT' } })).toBe(2)
    for (const r of await runsOf('chase.send', p1)) expect(await gradeSkillRun(r.id)).toMatchObject({ graded: true, verdict: 'PASS' })
  })

  it('a person has to say where a piece is: a bare mark in hand is refused in a sentence', async () => {
    const p = await proposal(p1)
    const r = await mark(AM, p1, piece(p, 'RATES').id, { haveIt: true })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Say where the piece is kept, in a few words, so the next person can find it.')
  })

  it('the last missing piece put in makes the proposal ready for a yes with no agent run, and the agent then closes the reminders as answered and opens one card', async () => {
    const p = await proposal(p1)
    expect((await mark(HR, p1, piece(p, 'COMPLIANCE').id, { haveIt: true, source: 'Insurance certificate, HR drive' })).status).toBe(200)
    expect((await proposal(p1)).state).toBe('NEEDS_PIECES')
    expect((await mark(AM, p1, piece(p, 'RATES').id, { haveIt: true, source: 'Rate sheet 2027, finance drive' })).status).toBe(200)
    expect((await proposal(p1)).state).toBe('READY_FOR_PERSON')
    await run(MON)
    expect((await tasks('PROPOSAL_CHASE', p1)).map((t) => t.state)).toEqual(['CLOSED_BY_ARRIVAL', 'CLOSED_BY_ARRIVAL'])
    const cards = await tasks('PROPOSAL_REVIEW', p1)
    expect(cards).toHaveLength(1)
    expect(cards[0].state).toBe('PROPOSED')
    expect((cards[0].plan as { sendsNothing?: boolean }).sendsNothing).toBe(true)
    for (const k of ['proposal.ask', 'proposal.chase']) for (const r of await runsOf(k, p1)) expect(await regrade(r.id), k).toMatchObject({ graded: true, verdict: 'PASS' })
  })

  it('a second run does not open a second card', async () => {
    await run(MON)
    expect(await tasks('PROPOSAL_REVIEW', p1)).toHaveLength(1)
  })
})

describe('the yes, and the proposal that is sent', () => {
  it('a piece taken back while the card is open stops the yes, in a sentence, and the agent withdraws the card', async () => {
    const [card] = await tasks('PROPOSAL_REVIEW', p1)
    const p = await proposal(p1)
    expect((await mark(AM, p1, piece(p, 'RATES').id, { haveIt: false })).status).toBe(200)
    expect((await proposal(p1)).state).toBe('NEEDS_PIECES')
    const no = await approveCard(AM, card.decisionId)
    expect(no.status).toBe(409)
    expect(no.body.error.message).toMatch(/cannot go to approved|still missing/)
    expect((await prisma.decisionItem.findUniqueOrThrow({ where: { id: card.decisionId } })).state).toBe('OPEN')
    as(AM)
    expect((await json(await approve(req('POST', '/x', {}), { params: Promise.resolve({ id: p1 }) }))).status).toBe(409)
    await run(MON)
    expect((await tasks('PROPOSAL_REVIEW', p1))[0].state).toBe('STOPPED')
  })

  it('when the piece is back, a new card opens, and a person’s yes on it approves the proposal as her own act', async () => {
    const p = await proposal(p1)
    await mark(AM, p1, piece(p, 'RATES').id, { haveIt: true, source: 'Rate sheet 2027, finance drive' })
    await run(MON)
    const cards = await tasks('PROPOSAL_REVIEW', p1)
    expect(cards).toHaveLength(2)
    const r = await approveCard(AM, cards[1].decisionId)
    expect(r.status).toBe(200)
    const after = await proposal(p1)
    expect(after.state).toBe('APPROVED')
    expect(after.approvedById).toBe(s[AM])
    expect(after.submittedAt).toBeNull()
  })

  it('the agent’s next run closes the card and moves nothing: it does not mark the proposal sent', async () => {
    await run(MON)
    expect((await tasks('PROPOSAL_REVIEW', p1))[1].state).toBe('DONE')
    expect((await proposal(p1)).state).toBe('APPROVED')
    expect(await prisma.mailSend.count({ where: { companyId: s.firm, toAddresses: { has: 'county.example' } } })).toBe(0)
  })

  it('an approved draft is not edited under the person who approved it', async () => {
    as(AM)
    const r = await json(await editDraft(req('PATCH', '/x', { draft: 'New words' }), { params: Promise.resolve({ id: p1 }) }))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/Words changed now would not be the words approved/)
  })

  it('only a person records that it was sent, outside Etyme', async () => {
    as(AM)
    expect((await json(await markSent(req('POST', '/x', {}), { params: Promise.resolve({ id: p1 }) }))).status).toBe(200)
    const after = await proposal(p1)
    expect(after).toMatchObject({ state: 'SUBMITTED', submittedById: s[AM] })
    await run(MON)
    expect((await proposal(p1)).state).toBe('SUBMITTED')
  })
})

describe('a person’s own words, a model, and the role contract', () => {
  it('a draft a person wrote is never written over by the agent', async () => {
    const id = await start('Solicitation 24-200')
    as(AM)
    expect((await json(await editDraft(req('PATCH', '/x', { draft: 'My own words.' }), { params: Promise.resolve({ id }) }))).status).toBe(200)
    await run(MON)
    expect((await proposal(id)).draft).toBe('My own words.')
    expect(await runsOf('proposal.draft', id)).toHaveLength(0)
  })

  it('a model’s paragraphs that come from the record are used, through the gateway at the low tier, with the cost on the run', async () => {
    const id = await start('Solicitation 24-300')
    const good = JSON.stringify({ capability: 'Quillbrook Staffing supplies contract staff in Spark and SQL.', pastWork: 'The firm has 2 engagements with 2 clients.' })
    await run(MON, { gateway: gatewayAnswering(good) })
    const p = await proposal(id)
    expect(p.draft).toContain('Quillbrook Staffing supplies contract staff in Spark and SQL.')
    const [r] = await runsOf('proposal.draft', id)
    expect(r).toMatchObject({ model: 'model-a', tier: 'LOW', verdict: 'PASS', inputTokens: 100, outputTokens: 50 })
    expect(await gradeSkillRun(r.id)).toMatchObject({ graded: true, verdict: 'PASS' })
  })

  it('a model that states a rate is not used: the rules write the draft, and the run is marked as failed with the reason', async () => {
    const id = await start('Solicitation 24-400')
    const bad = JSON.stringify({ capability: 'Senior engineers at $95 an hour.', pastWork: 'The firm has 2 engagements with 2 clients.' })
    await run(MON, { gateway: gatewayAnswering(bad) })
    const p = await proposal(id)
    expect(p.draft).not.toMatch(/\$|95/)
    const [r] = await runsOf('proposal.draft', id)
    expect(r.verdict).toBe('FAIL')
    expect(r.failReason).toMatch(/amount of money/)
  })

  it('a role contract that puts drafting at never means nothing is drafted and no twin row is written for it', async () => {
    await prisma.roleContract.create({ data: { companyId: s.firm, twinKind: 'SUPPLIER', version: 1, actsAlone: [], needsApproval: ['proposal.ask', 'proposal.chase'], neverTouches: ['proposal.draft'], setByPersonId: s[OWNER], reason: 'Owner: no drafting' } })
    const id = await start('Solicitation 24-500')
    await run(MON)
    expect((await proposal(id)).draft).toBeNull()
    expect(await prisma.twinAction.count({ where: { companyId: s.firm, entityId: id, action: 'proposal.draft' } })).toBe(0)
  })
})

describe('who is reminded', () => {
  it('a seat that cannot open the Proposals page is passed over, and the reminder goes to the Owner instead of a dead end', async () => {
    await prisma.role.updateMany({ where: { companyId: s.firm, name: 'HR' }, data: { permissions: ['consultants.read'] } })
    const id = await start('Solicitation 24-600', '1. Provide a certificate of insurance.')
    await run(MON)
    const t = await tasks('PROPOSAL_CHASE', id)
    expect(t).toHaveLength(1)
    expect((t[0].payload as { seatPersonId: string }).seatPersonId).toBe(s[OWNER])
  })
})
