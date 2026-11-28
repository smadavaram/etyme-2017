/**
 * Basic outreach is core (record 135), on the database, through the real
 * routes, the real runner, the task record and the mail ledger. The firm has
 * the Outreach plugin OFF throughout: a letter to one contact and an update
 * letter to a candidate go after the firm's one yes, and each is a line on
 * that party's ledger; a selling batch stays held. Reserved domains only.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as item from '@/app/api/decision-items/[id]/route'
import * as directRoute from '@/app/api/letters/direct/route'
import * as ledgerRoute from '@/app/api/party-ledger/[kind]/[id]/route'
import * as candidateBatches from '@/app/api/outreach/candidate-batches/route'
import * as batchesRoute from '@/app/api/outreach/batches/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { walkOutreachBatches } from '@/lib/agents/outreach-batch'
import { sendMail } from '@/lib/notify/mail-door'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-basic-outreach'
process.env.NEXTAUTH_URL = 'https://etyme.example'
const tag = `bo${Date.now()}`
const w: Record<string, any> = {}
const KEY = 'outreach-batch'
const day = (n: number) => new Date(Date.now() - n * 86_400_000)
const sent: { to: string[]; text: string }[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => { sent.push({ to: e.to, text: e.text }); return { provider: 'Resend' as const, messageId: 'm' } },
}
const run = () => {
  registerAgent(KEY, { ruleVersion: 't', step: (ctx) => walkOutreachBatches(ctx, { send: (m) => sendMail(m, deps as any) }) })
  return runAgent(KEY, w.firm.id, new Date())
}
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const direct = async (body: unknown, who = w.owner) => { as(who.primaryEmail); return json(await directRoute.POST(req('POST', '/api/letters/direct', body))) }
const ledger = async (kind: 'person' | 'company', id: string, who = w.owner) => {
  as(who.primaryEmail)
  return json(await ledgerRoute.GET(req('GET', `/api/party-ledger/${kind}/${id}`), { params: Promise.resolve({ kind, id }) }))
}
const lettersOn = (l: any) => l.body.data.activity.filter((x: any) => x.source.type === 'OutreachLetter')
const asked = (o: Record<string, unknown> = {}) => ({ subject: `Win Firm ${tag}: a note`, body: 'We now run a data engineering team and would like to talk.', ...o })
const taskOf = (id: string) => prisma.agentTask.findUniqueOrThrow({ where: { id } })

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Win Firm ${tag}`, slug: `bo-win-${tag}`, kind: 'VENDOR', siteLiveAt: null, pluginsOn: [] } as any })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Win Firm LLC', country: 'US', currency: 'USD' } })
  await prisma.companyAddress.create({ data: { companyId: w.firm.id, kind: 'LEGAL', street: '12 Mill Road', city: 'Leeds', state: null, postalCode: 'LS1 4AB', country: 'GB' } })
  const ownerRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Owner', permissions: ['*'] } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  await prisma.agentSwitch.create({ data: { companyId: w.firm.id, agentKey: KEY, state: 'ON', dailyCap: null, changedById: w.owner.id } })

  // A customer the firm trades with, quiet for 100 days, with a contact; and a company it does not trade with.
  w.buyer = await prisma.company.create({ data: { name: `Buyer Co ${tag}`, slug: `bo-buyer-${tag}`, kind: 'CLIENT' } as any })
  await prisma.counterparty.create({ data: { companyId: w.firm.id, otherCompanyId: w.buyer.id, relationship: 'CLIENT', status: 'ACTIVE', createdAt: day(400) } })
  const job = await prisma.requirement.create({ data: { companyId: w.buyer.id, title: 'Job 1', skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: day(-30) } })
  const pp = await prisma.person.create({ data: { name: 'Person One', primaryEmail: `p1.${tag}@example.invalid` } })
  await prisma.submission.create({ data: { requirementId: job.id, personId: pp.id, fromCompanyId: w.firm.id, toCompanyId: w.buyer.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: day(100) } })
  const contact = (name: string, at: any, extra: Record<string, unknown> = {}) =>
    prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: at.id, name, email: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid`, kind: 'HIRING_MANAGER', ...extra } as any })
  w.priya = await contact('Priya Nair', w.buyer)
  w.quit = await contact('Quinn Quiet', w.buyer, { outreachOptOutAt: day(3) })
  w.stranger = await prisma.company.create({ data: { name: `Stranger Co ${tag}`, slug: `bo-stranger-${tag}`, kind: 'CLIENT' } as any })
  w.sam = await contact('Sam Stranger', w.stranger)

  const candidate = async (name: string, yes: boolean) => {
    const person = await prisma.person.create({ data: { name, primaryEmail: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid`, updatesYesAt: yes ? day(30) : null } as any })
    const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['dbt'] } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: w.firm.id, tier: 'RETAINED', state: 'GRANTED' } })
    return person
  }
  w.asha = await candidate('Asha Rao', true)
  w.cora = await candidate('Cora Lind', false)
})
afterEach(() => { unregisterAgent(KEY); sent.length = 0 })

describe('a letter to one contact, with the Outreach plugin off', () => {
  it('raising it writes one task, one card and one letter, and sends nothing', async () => {
    const out = await direct({ contactId: w.priya.id, ...asked() })
    expect(out.status).toBe(201)
    w.task = await taskOf(out.body.data.id)
    expect(w.task.state).toBe('PROPOSED')
    expect(await prisma.outreachLetter.count({ where: { agentTaskId: w.task.id } })).toBe(1)
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: w.task.decisionId } })
    expect(card.question).toContain('Priya Nair'); expect(JSON.stringify(card)).not.toContain('example.invalid')
  })
  it('no letter goes without the task’s yes', async () => {
    await run()
    expect(sent).toHaveLength(0)
  })
  it('a direct letter to a contact appears on that company’s ledger as waiting for a yes', async () => {
    const l = lettersOn(await ledger('company', w.buyer.id))
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ kind: 'letter' })
    expect(l[0].says).toMatch(/Waiting for a yes/)
  })
  it('after the firm’s one yes the letter goes with Outreach off, once, to her address, with the firm’s postal address and a way to stop, and no interested link', async () => {
    expect((await say(w.task.decisionId, 'APPROVE')).status).toBe(200)
    await run()
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toEqual([w.priya.email])
    expect(sent[0].text).toContain(`Win Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
    expect(sent[0].text).toMatch(/Unsubscribe here/)
    expect(sent[0].text).not.toMatch(/interested/i)
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id, template: 'direct-letter', agentTaskId: w.task.id } })).toBe(1)
  })
  it('the letter that went reads as sent on the company’s ledger, and the task is done and never sends again', async () => {
    expect(lettersOn(await ledger('company', w.buyer.id))[0].says).toMatch(/: Sent\./)
    expect((await taskOf(w.task.id)).state).toBe('DONE')
    await run()
    expect(sent).toHaveLength(0)
  })
  it('a letter the firm did not approve is never sent, and its line says it was not approved', async () => {
    const out = await direct({ contactId: w.priya.id, ...asked({ subject: 'A second note' }) })
    const t = await taskOf(out.body.data.id)
    expect((await say(t.decisionId, 'REJECT')).status).toBe(200)
    await run()
    expect(sent).toHaveLength(0)
    expect(lettersOn(await ledger('company', w.buyer.id)).map((x: any) => x.says).join('\n')).toMatch(/A second note": Not approved/)
  })
  it('a contact who unsubscribed is refused in a sentence and nothing is raised', async () => {
    const before = await prisma.agentTask.count()
    const out = await direct({ contactId: w.quit.id, ...asked() })
    expect(out.status).toBe(422); expect(out.body.error.message).toMatch(/asked for no more letters/)
    expect(await prisma.agentTask.count()).toBe(before)
  })
  it('a contact at a company the firm does not trade with is refused and nothing is raised', async () => {
    const before = await prisma.agentTask.count()
    const out = await direct({ contactId: w.sam.id, ...asked() })
    expect(out.status).toBe(422); expect(out.body.error.message).toMatch(/not one the firm trades with/)
    expect(await prisma.agentTask.count()).toBe(before)
  })
  it('a letter with a web address pasted into it is refused naming the field', async () => {
    const out = await direct({ contactId: w.priya.id, ...asked({ body: 'See https://example.invalid/jobs' }) })
    expect(out.status).toBe(422); expect(out.body.error.field).toBe('body')
  })
  it('the company’s ledger offers Write to each contact it may write to, and says why not for one who unsubscribed', async () => {
    const panel = (await ledger('company', w.buyer.id)).body.data.letters
    expect(panel.writeTo.find((c: any) => c.name === 'Priya Nair')).toMatchObject({ canWrite: true })
    expect(panel.writeTo.find((c: any) => c.name === 'Quinn Quiet')).toMatchObject({ canWrite: false, says: expect.stringMatching(/asked for no more letters/) })
  })
  it('a company that is only a name in the firm’s contacts is not on its book, so its ledger is refused and no Write to is offered', async () => {
    const out = await ledger('company', w.stranger.id)
    expect(out.status).toBe(403)
    expect(JSON.stringify(out.body)).not.toContain('letters')
  })
})

describe('an update letter to a candidate, with the Outreach plugin off', () => {
  it('goes after the firm’s one yes to a candidate who said yes, and to nobody who has not', async () => {
    as(w.owner.primaryEmail)
    const out = await json(await candidateBatches.POST(req('POST', '/api/outreach/candidate-batches', asked({ subject: 'Update for candidates' }))))
    expect(out.status).toBe(201)
    expect(out.body.data).toMatchObject({ candidates: 1 })
    w.ctask = await taskOf(out.body.data.id)
    await run()
    expect(sent).toHaveLength(0) // no letter goes without the task's yes
    await say(w.ctask.decisionId, 'APPROVE')
    await run()
    expect(sent.map((s) => s.to.join())).toEqual([w.asha.primaryEmail])
    expect(sent.some((s) => s.to.join() === w.cora.primaryEmail)).toBe(false)
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id, template: 'candidate-update', agentTaskId: w.ctask.id } })).toBe(1)
  })
  it('a candidate’s letters appear on her ledger, with her standing yes', async () => {
    const out = await ledger('person', w.asha.id)
    expect(out.status).toBe(200)
    const l = lettersOn(out)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ kind: 'update letter' }); expect(l[0].says).toMatch(/Update for candidates": Sent/)
    expect(out.body.data.letters.candidate).toMatchObject({ standing: 'YES' })
    expect(out.body.data.letters.candidate.last).toHaveLength(1)
    expect(JSON.stringify(out.body.data)).not.toContain('example.invalid')
  })
  it('a candidate without a standing yes gets nothing, and her ledger says no letter goes to her', async () => {
    const out = await ledger('person', w.cora.id)
    expect(lettersOn(out)).toHaveLength(0)
    expect(out.body.data.letters.candidate).toMatchObject({ standing: 'NOT_YET' })
    expect(out.body.data.letters.candidate.says).toMatch(/no letter goes to her/)
  })
  it('a candidate who took her yes back reads as such and is written nothing', async () => {
    await prisma.person.update({ where: { id: w.cora.id }, data: { updatesYesAt: day(10), updatesRevokedAt: day(2) } })
    const out = await ledger('person', w.cora.id)
    expect(out.body.data.letters.candidate).toMatchObject({ standing: 'TOOK_BACK' })
  })
  it('a client’s ledger of the same people carries no letters panel, because a client sends none', async () => {
    const role = await prisma.role.create({ data: { companyId: w.buyer.id, name: 'Owner', permissions: ['*'] } })
    const rep = await prisma.person.create({ data: { name: 'Cleo Client', primaryEmail: `cleo.${tag}@example.invalid` } })
    await prisma.context.create({ data: { personId: rep.id, companyId: w.buyer.id, type: 'EMPLOYEE', roleId: role.id } as any })
    const out = await ledger('company', w.firm.id, rep)
    if (out.status === 200) expect(out.body.data.letters?.writeTo ?? null).toBeNull()
  })
})

describe('a selling batch with the Outreach plugin off', () => {
  it('is still held: it is drafted and approved, and nothing leaves until the Owner turns Outreach on', async () => {
    as(w.owner.primaryEmail)
    const out = await json(await batchesRoute.POST(req('POST', '/api/outreach/batches', {
      audience: 'DORMANT_CUSTOMERS', offerKind: 'HOT_LIST', offer: { lines: [{ skills: 'SQL, dbt', availability: 'two weeks' }] }, subject: `Win Firm ${tag}: SQL and dbt people`, body: 'Two data engineers are free in two weeks.',
    })))
    expect(out.status).toBe(201)
    const t = await taskOf(out.body.data.id)
    await say(t.decisionId, 'APPROVE')
    await run()
    expect(sent).toHaveLength(0)
    expect(await prisma.mailSend.count({ where: { companyId: w.firm.id, template: 'outreach-batch' } })).toBe(0)
    expect((await taskOf(t.id)).state).toBe('APPROVED')
  })
})
