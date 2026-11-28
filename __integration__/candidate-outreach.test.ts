/**
 * Update letters to candidates (record 117, the lead's ruling of 2026-11-27)
 * on the database, through the real routes, the real runner, the real task
 * record and the real mail ledger: a letter goes only to a candidate whose
 * own yes to updates still stands, one yes from the firm releases the batch,
 * and the link in the letter takes her yes back for every firm.
 * Builds its own firm on reserved domains. The provider is a stub.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as item from '@/app/api/decision-items/[id]/route'
import * as previewRoute from '@/app/api/outreach/candidate-preview/route'
import * as batchesRoute from '@/app/api/outreach/candidate-batches/route'
import * as batchRoute from '@/app/api/outreach/batches/[id]/route'
import * as link from '@/app/api/answer/updates/[token]/route'
import * as consent from '@/app/api/updates-consent/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { walkOutreachBatches } from '@/lib/agents/outreach-batch'
import { sendMail } from '@/lib/notify/mail-door'
import { mayAgentSend } from '@/lib/agents/tasks'
import { stopUpdatesUrlFor, yesToUpdatesUrlFor } from '@/lib/notify/updates-links'
import { saidYesToUpdates } from '@/lib/updates-consent'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-candidate-outreach'
process.env.NEXTAUTH_URL = 'https://etyme.example'
const tag = `co${Date.now()}`
const w: Record<string, any> = {}
const KEY = 'outreach-batch'
const day = (n: number) => new Date(Date.now() - n * 86_400_000)
const sent: { to: string[]; text: string }[] = []
/** Every letter that left, kept across tests. */
const texts: { to: string; text: string }[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => { sent.push({ to: e.to, text: e.text }); texts.push({ to: e.to.join(), text: e.text }); return { provider: 'Resend' as const, messageId: 'm' } },
}
const setSwitch = (state: 'OFF' | 'DRAFT_ONLY' | 'ON') => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey: KEY } },
  update: { state }, create: { companyId: w.firm.id, agentKey: KEY, state, dailyCap: null, changedById: w.owner.id },
})
const run = (when: Date = new Date()) => {
  registerAgent(KEY, { ruleVersion: 't', step: (ctx) => walkOutreachBatches(ctx, { send: (m) => sendMail(m, deps as any) }) })
  return runAgent(KEY, w.firm.id, when)
}
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const pt = (token: string) => ({ params: Promise.resolve({ token }) })
const tokenOf = (url: string | null) => url!.split('/').pop()!
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const asked = (o: Record<string, unknown> = {}) => ({ subject: `Win Firm ${tag}: two data jobs`, body: 'We have two data engineering jobs open this month.', ...o })
const preview = async (body: unknown, who = w.owner) => { as(who.primaryEmail); return json(await previewRoute.POST(req('POST', '/api/outreach/candidate-preview', body))) }
const create = async (body: unknown, who = w.owner) => { as(who.primaryEmail); return json(await batchesRoute.POST(req('POST', '/api/outreach/candidate-batches', body))) }
const view = async (id: string) => { as(w.owner.primaryEmail); return json(await batchRoute.GET(req('GET', `/api/outreach/batches/${id}`), p(id))) }
const lettersOf = (taskId: string) => prisma.outreachLetter.findMany({ where: { agentTaskId: taskId }, orderBy: { createdAt: 'asc' } })
const mailTo = (who: any) => sent.filter((s) => s.to.join().includes(who.primaryEmail))
let n = 0
/** A candidate this firm keeps by a granted listing. */
async function candidate(name: string, o: { yes?: boolean; revoked?: boolean; listing?: 'GRANTED' | 'INVITED'; email?: string; yesAt?: Date } = {}) {
  n++
  const person = await prisma.person.create({ data: {
    name, primaryEmail: o.email === undefined ? `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid` : o.email,
    updatesYesAt: o.yes === false ? null : (o.yesAt ?? day(30)), updatesRevokedAt: o.revoked ? day(5) : null,
  } as any })
  const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['dbt'] } })
  await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: w.firm.id, tier: 'RETAINED', state: o.listing ?? 'GRANTED' } })
  return person
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Win Firm ${tag}`, slug: `co-win-${tag}`, kind: 'VENDOR', siteLiveAt: null, pluginsOn: [] } as any })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Win Firm LLC', country: 'US', currency: 'USD' } })
  await prisma.companyAddress.create({ data: { companyId: w.firm.id, kind: 'LEGAL', street: '12 Mill Road', city: 'Leeds', state: null, postalCode: 'LS1 4AB', country: 'GB' } })
  const ownerRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Owner', permissions: ['*'] } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  const vendorsOnly = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Buyer', permissions: ['vendors.read'] } })
  w.buyer = await prisma.person.create({ data: { name: 'Bo Buyer', primaryEmail: `bo.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.buyer.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: vendorsOnly.id } as any })

  w.asha = await candidate('Asha Rao')
  w.ben = await candidate('Ben Okoye')
  w.cora = await candidate('Cora Lind', { yes: false })
  w.dev = await candidate('Dev Shah', { revoked: true })
  w.eli = await candidate('Eli Moss', { email: ' ' })
  w.fay = await candidate('Fay Wren', { listing: 'INVITED' })
  // Said yes to updates, and keeps no record with this firm at all.
  w.stranger = await prisma.person.create({ data: { name: 'Sam Stranger', primaryEmail: `sam.${tag}@example.invalid`, updatesYesAt: day(3) } as any })
  await prisma.consultantProfile.create({ data: { personId: w.stranger.id } })
})
afterEach(() => { unregisterAgent(KEY); sent.length = 0 })

describe('the preview', () => {
  it('lists only candidates the firm keeps who have a standing yes, counts the rest without naming them, and shows no address', async () => {
    const out = await preview(asked())
    expect(out.status).toBe(200)
    const d = out.body.data
    expect(d.to.map((t: any) => t.name)).toEqual(['Asha Rao', 'Ben Okoye'])
    expect(d.audience).toMatchObject({ count: 2, withoutYes: 2 }) // Cora and Dev; Fay is only asked, Sam is not kept
    const everything = JSON.stringify(d)
    for (const nobody of ['Cora', 'Dev Shah', 'Sam Stranger', 'Fay']) expect(everything).not.toContain(nobody)
    expect(everything).not.toContain('example.invalid')
    expect(d.letter).toContain('you said yes to updates')
  })
  it('a candidate with a yes and no email address is held and named, with a sentence, and gets nothing', async () => {
    const d = (await preview(asked())).body.data
    expect(d.held).toEqual([expect.objectContaining({ name: 'Eli Moss', reason: 'NO_ADDRESS' })])
  })
  it('writes nothing: no task, no letter, no card', async () => {
    const before = [await prisma.agentTask.count(), await prisma.outreachLetter.count(), await prisma.decisionItem.count()]
    await preview(asked())
    expect([await prisma.agentTask.count(), await prisma.outreachLetter.count(), await prisma.decisionItem.count()]).toEqual(before)
  })
  it('the read of each candidate named is one row in the access trail', async () => {
    await preview(asked())
    await new Promise((r) => setTimeout(r, 200))
    expect(await prisma.accessLog.count({ where: { actorPersonId: w.owner.id, subjectId: w.asha.id } })).toBeGreaterThan(0)
  })
  it('a letter with a web address pasted into it is refused naming the field', async () => {
    const out = await create(asked({ body: 'See https://example.invalid/jobs' }))
    expect(out.status).toBe(422); expect(out.body.error.field).toBe('body')
  })
  it('an update that carries a rate is refused in a sentence', async () => {
    const out = await create(asked({ body: 'The rate is great.' }))
    expect(out.status).toBe(422); expect(out.body.error.message).toMatch(/no rate, email address or phone number/)
  })
  it('a seat that does not read the firm’s candidates is refused', async () => {
    const out = await preview(asked(), w.buyer)
    expect(out.status).toBe(403)
  })
})

describe('basic outreach is core: the Outreach plugin is off for this firm throughout', () => {
  it('this firm has Outreach switched off for every test in this file, so each update letter that goes here went with it off', async () => {
    expect((await prisma.company.findUniqueOrThrow({ where: { id: w.firm.id } })).pluginsOn).not.toContain('OUTREACH')
  })
})

describe('the batch and its one yes', () => {
  it('raising a batch writes one task, one card and a letter for each candidate with a yes, and nobody else', async () => {
    await setSwitch('ON')
    const out = await create(asked())
    expect(out.status).toBe(201)
    expect(out.body.data).toMatchObject({ candidates: 2, held: 1 })
    w.task = await prisma.agentTask.findUniqueOrThrow({ where: { id: out.body.data.id } })
    expect(w.task.state).toBe('PROPOSED')
    expect(await prisma.decisionItem.count({ where: { id: w.task.decisionId, state: 'OPEN' } })).toBe(1)
    expect((await lettersOf(w.task.id)).map((l) => l.contactId).sort()).toEqual([w.asha.id, w.ben.id].sort())
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: w.task.decisionId } })
    expect(card.question).toContain('2 candidates')
    expect(JSON.stringify(card)).not.toContain('example.invalid')
  })
  it('nothing is sent before the firm’s one yes', async () => {
    await run()
    expect(sent).toHaveLength(0)
  })
  it('the batch page names the candidates and never shows an address', async () => {
    const v = (await view(w.task.id)).body.data
    expect(v.audience).toBe('Candidates who said yes to updates')
    expect(v.rows.map((r: any) => r.name).sort()).toEqual(['Asha Rao', 'Ben Okoye'])
    expect(JSON.stringify(v)).not.toContain('example.invalid')
    expect(v.counts).toMatchObject({ contacts: 2, sent: 0, waiting: 2 })
  })
  it('a candidate who takes her yes back after the card and before the send gets nothing, and her letter is stopped', async () => {
    await prisma.person.update({ where: { id: w.ben.id }, data: { updatesRevokedAt: new Date() } })
    expect((await say(w.task.decisionId, 'APPROVE')).status).toBe(200)
    await run()
    expect(mailTo(w.ben)).toHaveLength(0)
    const ben = (await lettersOf(w.task.id)).find((l) => l.contactId === w.ben.id)!
    expect([ben.state, ben.stoppedReason]).toEqual(['STOPPED', 'UNSUBSCRIBED'])
  })
  it('a candidate whose yes stands gets one email with one address, naming the firm, its postal address and a link that stops updates, and no interested link', async () => {
    const rows = await prisma.mailSend.findMany({ where: { companyId: w.firm.id, template: 'candidate-update', agentTaskId: w.task.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].toAddresses).toEqual([w.asha.primaryEmail]); expect(rows[0].bccAddresses).toHaveLength(0)
    const text = texts.find((t) => t.to === w.asha.primaryEmail)!.text
    expect(text).toContain(`Win Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
    expect(text).toMatch(/https:\/\/etyme\.example\/answer\/updates\/\S+/)
    expect(text).not.toMatch(/outreach-interest/)
    expect(text).toContain('We have two data engineering jobs open this month.')
  })
  it('the batch closes once every letter has gone or been stopped, and the letter is never sent again', async () => {
    const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: w.task.id } })
    expect(task.state).toBe('DONE')
    await run(new Date(Date.now() + 30 * 86_400_000))
    expect(sent).toHaveLength(0)
    expect((await lettersOf(w.task.id)).find((l) => l.contactId === w.asha.id)).toMatchObject({ state: 'SENT', attempt: 1, nextDueAt: null })
  })
  it('the check on the send passes for the update letter a candidate with a standing yes was sent, and fails the same letter once she is shown to have taken her yes back before it left', async () => {
    const l = (await lettersOf(w.task.id)).find((x) => x.contactId === w.asha.id)!
    const runRow = await prisma.agentRun.findFirstOrThrow({ where: { companyId: w.firm.id, skillKey: 'chase.send', recordId: l.id } })
    expect(await gradeSkillRun(runRow.id)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    const before = await prisma.person.findUniqueOrThrow({ where: { id: w.asha.id }, select: { updatesYesAt: true, updatesRevokedAt: true } })
    const mail = await prisma.mailSend.findFirstOrThrow({ where: { companyId: w.firm.id, recordId: l.id } })
    try {
      await prisma.person.update({ where: { id: w.asha.id }, data: { updatesRevokedAt: new Date(mail.createdAt.getTime() - 1000), updatesYesAt: new Date(mail.createdAt.getTime() - 86_400_000) } })
      await prisma.check.deleteMany({ where: { runId: runRow.id } })
      const out = await gradeSkillRun(runRow.id)
      expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
      expect(out.graded && out.reason).toMatch(/she had taken her yes to updates back when it was sent/)
    } finally {
      await prisma.person.update({ where: { id: w.asha.id }, data: before })
      await prisma.check.deleteMany({ where: { runId: runRow.id } })
    }
  })
  it('a second send of the same letter is refused by the task ledger, so one yes releases one letter each and no more', async () => {
    const l = (await lettersOf(w.task.id))[0]
    const may = await mayAgentSend(w.task.id, { companyId: w.firm.id, agentKey: KEY, recordType: 'OutreachLetter', recordId: l.id, template: 'candidate-update', attempt: 2 })
    expect(may.ok).toBe(false)
  })
  it('the batch page counts the letter as sent and the candidate who took her yes back as unsubscribed', async () => {
    const v = (await view(w.task.id)).body.data
    expect(v.counts).toMatchObject({ contacts: 2, sent: 1, unsubscribed: 1 })
  })
})

describe('the link in the letter', () => {
  const stopOf = () => `${w.stopToken}`
  it('every letter carries her own stop link, and the link is not in the mail ledger, the card or a reply', async () => {
    // Re-send to a fresh batch so the text can be read: a stub keeps what it was handed.
    w.cleo = await candidate('Cleo Park')
    w.dara = await candidate('Dara Voss')
    await prisma.person.update({ where: { id: w.asha.id }, data: { updatesYesAt: new Date() } }) // her yes stands again
    // Asha was written to today; the 180 days hold her. Only the two new candidates get this batch.
    const out = await create(asked({ subject: `Win Firm ${tag}: a second note` }))
    expect(out.body.data).toMatchObject({ candidates: 2 })
    expect(out.body.data.held).toBeGreaterThanOrEqual(2) // Asha waits 180 days, Eli has no address
    w.task2 = await prisma.agentTask.findUniqueOrThrow({ where: { id: out.body.data.id } })
    await say(w.task2.decisionId, 'APPROVE')
    await run()
    expect(sent).toHaveLength(2)
    const cleo = mailTo(w.cleo)[0].text
    expect(cleo).toMatch(/https:\/\/etyme\.example\/answer\/updates\/\S+/)
    expect(cleo).toContain(`Win Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
    expect(cleo).not.toMatch(/answer\/outreach-interest/)
    w.stopToken = /answer\/updates\/(\S+)/.exec(cleo)![1]
    w.dara_token = /answer\/updates\/(\S+)/.exec(mailTo(w.dara)[0].text)![1]
    expect(w.stopToken).not.toBe(w.dara_token)
    const stuff = JSON.stringify([await prisma.mailSend.findMany({ where: { companyId: w.firm.id } }), await prisma.decisionItem.findMany({ where: { companyId: w.firm.id } }), await prisma.recordAction.findMany({ where: { companyId: w.firm.id } })])
    expect(stuff).not.toContain(w.stopToken.split('.')[0])
    expect(stopOf()).toBeTruthy()
  })
  it('opening the stop link changes nothing, and pressing the button ends her yes for every firm', async () => {
    const t = w.stopToken
    expect((await link.GET(req('GET', `/api/answer/updates/${t}`), pt(t))).status).toBe(200)
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.cleo.id } }))).toBe(true)
    const done = await link.POST(req('POST', `/api/answer/updates/${t}`), pt(t))
    expect(done.status).toBe(200)
    expect((await json(done)).body.data.says).toContain('No firm will send you updates')
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.cleo.id } }))).toBe(false)
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.dara.id } }))).toBe(true)
  })
  it('using the stop link twice changes nothing the second time', async () => {
    const t = w.stopToken
    const before = (await prisma.person.findUniqueOrThrow({ where: { id: w.cleo.id } })).updatesRevokedAt
    expect((await link.POST(req('POST', `/api/answer/updates/${t}`), pt(t))).status).toBe(200)
    expect((await prisma.person.findUniqueOrThrow({ where: { id: w.cleo.id } })).updatesRevokedAt?.getTime()).toBe(before?.getTime())
  })
  it('a link that was cut short says so and changes nothing', async () => {
    const bad = w.dara_token.slice(0, -4)
    const out = await link.POST(req('POST', `/api/answer/updates/${bad}`), pt(bad))
    expect(out.status).toBe(404)
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.dara.id } }))).toBe(true)
  })
  it('a stop link cannot give a yes, and a yes link cannot take one back', async () => {
    const stop = w.stopToken
    await link.POST(req('POST', `/api/answer/updates/${stop}`), pt(stop))
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.cleo.id } }))).toBe(false)
    const yes = tokenOf(yesToUpdatesUrlFor(w.dara.id))
    expect((await json(await link.GET(req('GET', `/api/answer/updates/${yes}`), pt(yes)))).body.data).toMatchObject({ purpose: 'YES', already: true })
    await link.POST(req('POST', `/api/answer/updates/${yes}`), pt(yes))
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.dara.id } }))).toBe(true)
  })
  it('the yes link gives her yes, so a candidate who took it back can say it again from a letter', async () => {
    const yes = tokenOf(yesToUpdatesUrlFor(w.cleo.id))
    expect((await json(await link.GET(req('GET', `/api/answer/updates/${yes}`), pt(yes)))).body.data).toMatchObject({ purpose: 'YES', already: false })
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.cleo.id } }))).toBe(false)
    expect((await link.POST(req('POST', `/api/answer/updates/${yes}`), pt(yes))).status).toBe(200)
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: w.cleo.id } }))).toBe(true)
  })
})

describe('her own page', () => {
  it('she gives her yes and takes it back on her own record, and the sentence she reads says which', async () => {
    as(w.ben.primaryEmail)
    const on = await json(await consent.POST(req('POST', '/api/updates-consent')))
    expect(on.body.data).toMatchObject({ yes: true, says: 'You said yes to updates. You can stop them at any time.' })
    const off = await json(await consent.DELETE(req('DELETE', '/api/updates-consent')))
    expect(off.body.data).toMatchObject({ yes: false, says: 'No updates will be sent to you until you say yes.' })
  })
})

describe('what a letter to candidates does to the rest of outreach', () => {
  it('a candidate letter never counts against any company’s 180 days, and the stop of a company contact is a different record', async () => {
    const { lastOutreachOn } = await import('@/lib/agents/dormant-outreach')
    const letters = await prisma.outreachLetter.findMany({ where: { companyId: w.firm.id } })
    expect(letters.length).toBeGreaterThan(0)
    for (const l of letters) {
      expect(await lastOutreachOn(w.firm.id, l.atCompanyId, 'CUSTOMER')).toBeNull()
      expect(await lastOutreachOn(w.firm.id, l.atCompanyId, 'SUPPLIER')).toBeNull()
    }
  })
  it('a batch letter to a company counts in the dormant check-in’s 180 days, on its own side', async () => {
    const { lastOutreachOn } = await import('@/lib/agents/dormant-outreach')
    const co = await prisma.company.create({ data: { name: `Orchid ${tag}`, slug: `co-orchid-${tag}`, kind: 'CLIENT' } as any })
    const task = await prisma.agentTask.create({ data: { companyId: w.firm.id, agentKey: KEY, kind: 'OUTREACH_BATCH', recordType: 'Company', recordId: w.firm.id, state: 'RUNNING', decisionId: (await prisma.decisionItem.findFirstOrThrow({ where: { companyId: w.firm.id } })).id, plan: {}, payload: { side: 'CUSTOMER' } } as any })
    await prisma.outreachLetter.create({ data: { companyId: w.firm.id, agentTaskId: task.id, contactId: 'c1', atCompanyId: co.id, email: 'x@example.invalid', state: 'SENT', attempt: 1 } })
    const last = await lastOutreachOn(w.firm.id, co.id, 'CUSTOMER')
    expect(last).not.toBeNull()
    expect(await lastOutreachOn(w.firm.id, co.id, 'SUPPLIER')).toBeNull()
  })
})

describe('where no email can leave', () => {
  it('a letter waits ready, unsent, and the preview says mail cannot leave from here', async () => {
    const saved = { ...process.env }
    delete process.env.NOTIFY_FROM_EMAIL; delete process.env.RESEND_API_KEY; delete process.env.SENDGRID_API_KEY
    try {
      as(w.owner.primaryEmail)
      const s = await json(await previewRoute.GET(req('GET', '/api/outreach/candidate-preview')))
      expect(s.body.data.mail).toBe(false)
      expect(s.body.data).not.toHaveProperty('to')
    } finally { Object.assign(process.env, saved) }
  })
})
