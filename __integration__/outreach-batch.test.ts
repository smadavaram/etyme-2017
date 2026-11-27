/**
 * Outreach to companies (record 117, step 1) on the database, through the
 * real routes, the real runner, the real task record and the real mail
 * ledger: preview that writes nothing, one batch that is one task and one
 * card, one yes that releases every letter and both follow-ups, and the
 * unsubscribe and "I'm interested" links that stop a contact's letters.
 * Builds its own firm on reserved domains. The provider is a stub; the
 * door's rules are the real ones.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma, resetDatabase, as, req, json } from './harness'
import * as item from '@/app/api/decision-items/[id]/route'
import * as previewRoute from '@/app/api/outreach/preview/route'
import * as batchesRoute from '@/app/api/outreach/batches/route'
import * as batchRoute from '@/app/api/outreach/batches/[id]/route'
import * as interest from '@/app/api/answer/outreach-interest/[token]/route'
import * as unsub from '@/app/api/answer/outreach/[token]/route'
import { decideBody } from '@/lib/decision-queue'
import { runAgent, registerAgent, unregisterAgent, actsToday } from '@/lib/agents/runner'
import { walkOutreachBatches } from '@/lib/agents/outreach-batch'
import { sendMail } from '@/lib/notify/mail-door'
import { addWorkingDays } from '@/lib/agents/checklist-rules'
import { mayAgentSend } from '@/lib/agents/tasks'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-outreach'
process.env.NEXTAUTH_URL = 'https://etyme.example'
const tag = `ob${Date.now()}`
const w: Record<string, any> = {}
const KEY = 'outreach-batch'
const day = (n: number) => new Date(Date.now() - n * 86_400_000)
const sent: { to: string[]; text: string }[] = []
let bounceOn: string | null = null
/** Every letter that left, by recipient, kept across tests. */
const texts: { to: string; text: string }[] = []
const deps = {
  env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false,
  hand: async (e: any) => {
    if (bounceOn && e.to.join().includes(bounceOn)) throw new Error('Mailbox does not exist')
    sent.push({ to: e.to, text: e.text }); texts.push({ to: e.to.join(), text: e.text }); return { provider: 'Resend' as const, messageId: 'm' }
  },
}
const setSwitch = (state: 'OFF' | 'DRAFT_ONLY' | 'ON', dailyCap: number | null = null) => prisma.agentSwitch.upsert({
  where: { companyId_agentKey: { companyId: w.firm.id, agentKey: KEY } },
  update: { state, dailyCap }, create: { companyId: w.firm.id, agentKey: KEY, state, dailyCap, changedById: w.owner.id },
})
const run = (when: Date) => {
  registerAgent(KEY, { ruleVersion: 't', step: (ctx) => walkOutreachBatches(ctx, { send: (m) => sendMail(m, deps as any) }) })
  return runAgent(KEY, w.firm.id, when)
}
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const pt = (token: string) => ({ params: Promise.resolve({ token }) })
const say = async (decisionId: string, verdict: 'APPROVE' | 'REJECT') => {
  as(w.owner.primaryEmail)
  return json(await item.POST(req('POST', `/api/decision-items/${decisionId}`, decideBody(verdict, verdict === 'REJECT' ? 'Not this one.' : '', w.entity.id)), p(decisionId)))
}
const hot = { lines: [{ skills: 'Spark, Airflow, SQL', availability: 'from December 8' }] }
const asked = (o: Record<string, unknown> = {}) => ({ audience: 'DORMANT_CUSTOMERS', offerKind: 'HOT_LIST', offer: hot, subject: `Win Firm ${tag}: people available for work`, body: 'Two data engineers are free from December 8.', ...o })
const preview = async (body: unknown) => { as(w.owner.primaryEmail); return json(await previewRoute.POST(req('POST', '/api/outreach/preview', body))) }
const create = async (body: unknown) => { as(w.owner.primaryEmail); return json(await batchesRoute.POST(req('POST', '/api/outreach/batches', body))) }
const view = async (id: string) => { as(w.owner.primaryEmail); return json(await batchRoute.GET(req('GET', `/api/outreach/batches/${id}`), p(id))) }
const letters = () => prisma.outreachLetter.findMany({ where: { agentTaskId: w.task.id }, orderBy: { createdAt: 'asc' } })
const letterOf = async (contact: any) => (await letters()).find((l) => l.contactId === contact.id)!
const mail = () => prisma.mailSend.findMany({ where: { companyId: w.firm.id, template: 'outreach-batch' }, orderBy: { createdAt: 'asc' } })
const mailTo = (contact: any) => sent.filter((s) => s.to.join().includes(contact.email))
let n = 0
const newCo = (name: string, extra: Record<string, unknown> = {}) => prisma.company.create({ data: { name: `${name} ${tag}`, slug: `ob-${name.toLowerCase().replace(/\s/g, '-')}-${tag}`, kind: 'CLIENT', ...extra } as any })
const contactAt = (co: any, name: string, extra: Record<string, unknown> = {}) =>
  prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: co.id, name, email: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid`, kind: 'HIRING_MANAGER', ...extra } as any })
/** A customer on the firm's register whose last work was `quietFor` days ago. */
async function customer(name: string, quietFor: number) {
  n++
  const co = await newCo(name)
  await prisma.counterparty.create({ data: { companyId: w.firm.id, otherCompanyId: co.id, relationship: 'CLIENT', status: 'ACTIVE', createdAt: day(400) } })
  const job = await prisma.requirement.create({ data: { companyId: co.id, title: `Job ${n}`, skills: ['sql'], status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: day(-30) } })
  const person = await prisma.person.create({ data: { name: `Person ${n}`, primaryEmail: `p${n}.${tag}@example.invalid` } })
  await prisma.submission.create({ data: { requirementId: job.id, personId: person.id, fromCompanyId: w.firm.id, toCompanyId: co.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', checkState: 'SENT', submittedAt: day(quietFor) } })
  return co
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await newCo('Win Firm', { kind: 'VENDOR', siteLiveAt: null, pluginsOn: ['OUTREACH'] })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Win Firm LLC', country: 'US', currency: 'USD' } })
  const ownerRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Owner', permissions: ['*'] } })
  w.owner = await prisma.person.create({ data: { name: 'Dana Owner', primaryEmail: `dana.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
  const recruiterRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Recruiter', permissions: ['consultants.read'] } })
  w.recruiter = await prisma.person.create({ data: { name: 'Rae Recruiter', primaryEmail: `rae.${tag}@example.invalid` } })
  await prisma.context.create({ data: { personId: w.recruiter.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: recruiterRole.id } as any })

  w.orchid = await customer('Orchid Foods', 100); w.mina = await contactAt(w.orchid, 'Mina Cho')
  w.birch = await customer('Birch Works', 100); w.bea = await contactAt(w.birch, 'Bea Birch'); await contactAt(w.birch, 'Other Birch', { kind: 'OTHER' })
  w.gum = await customer('Gum Supply', 100); w.gus = await contactAt(w.gum, 'Gus Gum')
  w.hazel = await customer('Hazel Mills', 100); w.hal = await contactAt(w.hazel, 'Hal Hazel')
  w.cedar = await customer('Cedar Co', 100); await contactAt(w.cedar, 'Cy Cedar', { outreachOptOutAt: day(10) })
  w.dune = await customer('Dune Co', 100)
  w.elm = await customer('Elm Co', 5); await contactAt(w.elm, 'Eli Elm')
  w.fern = await newCo('Fern Co', { kind: 'UNCLASSIFIED', listedById: w.firm.id }); await contactAt(w.fern, 'Fay Fern')
  w.stray = await newCo('Stray Co', { claimedAt: new Date() }); await contactAt(w.stray, 'Sid Stray')
})
afterEach(() => { unregisterAgent(KEY); sent.length = 0 })

describe('the preview', () => {
  it('the preview shows the drafted letter, who gets it and who is held and why, and writes nothing', async () => {
    const before = [await prisma.agentTask.count(), await prisma.outreachLetter.count(), await prisma.decisionItem.count(), await prisma.mailSend.count()]
    await prisma.companyAddress.create({ data: { companyId: w.firm.id, kind: 'LEGAL', street: '12 Mill Road', city: 'Leeds', state: null, postalCode: 'LS1 4AB', country: 'GB' } })
    const out = await preview(asked())
    expect(out.status).toBe(200)
    const d = out.body.data
    expect(d.to.map((t: any) => t.companyName).sort()).toEqual([`Birch Works ${tag}`, `Gum Supply ${tag}`, `Hazel Mills ${tag}`, `Orchid Foods ${tag}`])
    expect(d.to.find((t: any) => t.companyName.startsWith('Birch')).name).toBe('Bea Birch')
    expect(d.held.map((h: any) => [h.companyName, h.reason]).sort()).toEqual([[`Cedar Co ${tag}`, 'OPTED_OUT'], [`Dune Co ${tag}`, 'NO_CONTACT']])
    expect(d.letter).toContain(`Win Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
    expect(d.letter).not.toMatch(/outreach(-interest)?\/[\w-]+\.[\w-]+/)
    expect([await prisma.agentTask.count(), await prisma.outreachLetter.count(), await prisma.decisionItem.count(), await prisma.mailSend.count()]).toEqual(before)
  })
  it('a company marked Not classified and a contact at a company not on the firm’s register are never written to, and the broad list names the first', async () => {
    const all = (await preview(asked({ audience: 'ALL_CUSTOMERS' }))).body.data
    expect(all.to.map((t: any) => t.companyName).join()).not.toMatch(/Fern|Stray/)
    expect(all.held.map((h: any) => [h.companyName, h.reason])).toContainEqual([`Fern Co ${tag}`, 'NOT_CLASSIFIED'])
    expect(JSON.stringify(all)).not.toMatch(/Stray/)
  })
  it('an offer that carries a name or a rate is refused in a sentence and no letter is drafted', async () => {
    const bad = (await preview(asked({ offer: { lines: [{ skills: 'SQL', availability: 'now', name: 'Priya' }] }, subject: undefined, body: undefined }))).body.data
    expect(bad.draft).toBeNull(); expect(bad.offerSays).toMatch(/skills and availability only/)
  })
})

describe('raising the batch', () => {
  it('a firm with no postal address cannot raise a batch, and the refusal names the Settings page that fixes it', async () => {
    await prisma.companyAddress.deleteMany({ where: { companyId: w.firm.id } })
    const out = await create(asked())
    expect(out.status).toBe(422)
    expect(out.body.error.message).toMatch(/postal address/); expect(out.body.error.message).toMatch(/\/dashboard\/settings\/setup\/addresses/)
    await prisma.companyAddress.create({ data: { companyId: w.firm.id, kind: 'LEGAL', street: '12 Mill Road', city: 'Leeds', state: null, postalCode: 'LS1 4AB', country: 'GB' } })
  })
  it('a seat that does not read suppliers and customers is refused in a sentence', async () => {
    as(w.recruiter.primaryEmail)
    const out = await json(await batchesRoute.POST(req('POST', '/api/outreach/batches', asked())))
    expect(out.status).toBe(403); expect(out.body.error.message).toMatch(/Your seat does not/)
  })
  it('with the agent off, raising a batch is refused and says where the Owner switches it on', async () => {
    const out = await create(asked())
    expect(out.status).toBe(422); expect(out.body.error.message).toMatch(/Outreach batch is off.*Agent control/)
  })
  it('a letter with a web address pasted into it is refused naming the field', async () => {
    await setSwitch('DRAFT_ONLY')
    const out = await create(asked({ body: 'See https://example.com/list' }))
    expect(out.status).toBe(422); expect(out.body.error.field).toBe('body')
  })
  it('pressing Send for approval on the seeded world raises one card, and the batch page shows it waiting for a yes', async () => {
    await setSwitch('DRAFT_ONLY')
    const out = await create(asked())
    expect(out.status).toBe(201)
    expect(out.body.data).toMatchObject({ contacts: 4, held: 2 })
    w.task = await prisma.agentTask.findUniqueOrThrow({ where: { id: out.body.data.id } })
    expect([w.task.state, w.task.kind, w.task.agentKey]).toEqual(['PROPOSED', 'OUTREACH_BATCH', KEY])
    expect(await prisma.decisionItem.count({ where: { id: w.task.decisionId, state: 'OPEN' } })).toBe(1)
    const v = (await view(w.task.id)).body.data
    expect(v.state).toBe('PROPOSED'); expect(v.counts).toMatchObject({ contacts: 4, sent: 0, waiting: 4 })
    expect(v.held).toHaveLength(2)
  })
  it('a batch is written down whole: what the person chose and every letter exist the moment its card does', async () => {
    expect((w.task.payload as any)?.subject).toMatch(/people available for work/)
    expect(await prisma.outreachLetter.count({ where: { agentTaskId: w.task.id } })).toBe(4)
  })

  it('the dormant check-in counts a batch letter in its own wait, so a company just written to is not written to again', async () => {
    const { lastOutreachOn } = await import('@/lib/agents/dormant-outreach')
    const last = await lastOutreachOn(w.firm.id, w.orchid.id, 'CUSTOMER')
    expect(last).not.toBeNull()
    expect(Date.now() - last!.getTime()).toBeLessThan(86_400_000)
    expect(await lastOutreachOn(w.firm.id, w.orchid.id, 'SUPPLIER')).toBeNull()
  })

  it('the batch card says how many contacts it writes to and how many times each may be written again, and shows the letter with no token', async () => {
    const card = await prisma.decisionItem.findUniqueOrThrow({ where: { id: w.task.decisionId } })
    expect(card.question).toMatch(/^Outreach: send ".*" to 4 companies\?/)
    expect(card.proof).toMatch(/to each of 4 contacts, one letter each\. Each may be sent again up to 2 times, 5 working days apart/)
    expect(card.proof).toContain('Bea Birch <bea.birch.')
    expect(card.proof).toMatch(/Held, not written to \(2\)/)
    expect(card.proof).not.toMatch(/answer\/outreach/)
  })
  it('one company gets one letter per batch however many contacts it has', async () => {
    expect((await letters()).filter((l) => l.atCompanyId === w.birch.id)).toHaveLength(1)
    expect((await letterOf(w.bea)).email).toBe(w.bea.email)
  })
  it('a company written to by a batch is held with its date when the same list is drafted again', async () => {
    const again = (await preview(asked())).body.data
    expect(again.to).toEqual([])
    expect(again.held.filter((h: any) => h.reason === 'COOLING_OFF')).toHaveLength(4)
    expect(again.held.find((h: any) => h.reason === 'COOLING_OFF').says).toMatch(/written to on /)
    const second = await create(asked())
    expect(second.status).toBe(422); expect(second.body.error.message).toMatch(/Nobody is left to write to/)
  })
})

describe('the yes, and what is sent', () => {
  it('a batch that was not approved sends nothing', async () => {
    await setSwitch('ON')
    await run(new Date())
    expect(sent).toHaveLength(0); expect(await mail()).toHaveLength(0)
    expect((await mayAgentSend(w.task.id, { companyId: w.firm.id, agentKey: KEY, recordType: 'OutreachLetter', recordId: (await letters())[0].id, template: 'outreach-batch', attempt: 1 })).ok).toBe(false)
  })
  it('with the agent on Drafts only, an approved batch sends nothing and the batch page says so', async () => {
    await setSwitch('DRAFT_ONLY')
    expect((await say(w.task.decisionId, 'APPROVE')).status).toBe(200)
    await run(new Date())
    expect(sent).toHaveLength(0); expect(await mail()).toHaveLength(0)
    const v = (await view(w.task.id)).body.data
    expect(v.stopped).toMatch(/Drafts only, so nothing is sent/)
  })
  it('the daily cap sends what it allows today and leaves the rest ready for the next run, never dropped and never over the cap', async () => {
    const used = await actsToday(w.firm.id, KEY, new Date())
    await setSwitch('ON', used + 2)
    bounceOn = 'gus.gum'
    await run(new Date())
    expect((await mail()).length).toBe(2)
    expect((await letters()).filter((l) => l.state === 'READY')).toHaveLength(2)
    expect(await actsToday(w.firm.id, KEY, new Date())).toBe(used + 2)
    expect((await view(w.task.id)).body.data.counts.waiting).toBe(2)
  })

  it('the next run sends the rest, one email to each address even when two runs overlap, each naming the firm, its postal address, an unsubscribe link and its own interested link', async () => {
    await setSwitch('ON', null)
    w.runOne = new Date()
    await Promise.all([run(w.runOne), run(w.runOne)])
    const rows = await mail()
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.toAddresses.length === 1 && r.bccAddresses.length === 0)).toBe(true)
    expect(rows.every((r) => r.recordType === 'OutreachLetter' && r.agentTaskId === w.task.id && r.chase === false)).toBe(true)
    const to = (c: any) => texts.find((t) => t.to === c.email)!.text
    for (const c of [w.mina, w.bea, w.hal]) {
      const t = to(c)
      expect(t).toContain(`Win Firm ${tag}\n12 Mill Road, Leeds, LS1 4AB, GB`)
      expect(t).toMatch(/https:\/\/etyme\.example\/answer\/outreach\/\S+/)
      expect(t).toMatch(/https:\/\/etyme\.example\/answer\/outreach-interest\/\S+/)
      expect(t).toMatch(/Unsubscribe here, no sign-in needed/)
      expect(t).toContain('Two data engineers are free from December 8.')
    }
    expect(rows[0].subject).toBe(`Win Firm ${tag}: people available for work`)
    w.unsub = (c: any) => /answer\/outreach\/(\S+)/.exec(to(c))![1]
    w.interested = (c: any) => /answer\/outreach-interest\/(\S+)/.exec(to(c))![1]
    expect(w.unsub(w.mina)).not.toBe(w.unsub(w.bea))
    const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: w.task.id } })
    expect(task.state).toBe('RUNNING'); expect(task.sentCount).toBe(3)
  })

  it('a contact whose letter bounced is stopped with a bounce, and is counted as bounced from the mail sent', async () => {
    const l = await letterOf(w.gus)
    expect([l.state, l.stoppedReason]).toEqual(['STOPPED', 'BOUNCED'])
    const v = (await view(w.task.id)).body.data
    expect(v.counts).toMatchObject({ contacts: 4, sent: 3, bounced: 1, interested: 0, unsubscribed: 0 })
    expect(Object.keys(v.counts).join()).not.toMatch(/open/i)
    expect(v.rows.find((r: any) => r.name === 'Gus Gum').says).toMatch(/Bounced/)
  })

  it('an address whose letter bounced is held from a new batch until a new address is recorded', async () => {
    const out = (await preview(asked({ audience: 'ALL_CUSTOMERS' }))).body.data
    expect(out.held.some((h: any) => h.reason === 'COOLING_OFF' && h.companyName.startsWith('Gum'))).toBe(true)
  })
})

describe('the links in a letter', () => {
  it('opening the unsubscribe link changes nothing, and pressing the button ends outreach to that contact from that firm only', async () => {
    delete process.env.DEV_BYPASS_AUTH
    const t = w.unsub(w.mina)
    expect((await unsub.GET(req('GET', `/api/answer/outreach/${t}`), pt(t))).status).toBe(200)
    expect((await prisma.companyContact.findUniqueOrThrow({ where: { id: w.mina.id } })).outreachOptOutAt).toBeNull()
    expect((await unsub.POST(req('POST', `/api/answer/outreach/${t}`), pt(t))).status).toBe(200)
    expect((await prisma.companyContact.findUniqueOrThrow({ where: { id: w.mina.id } })).outreachOptOutAt).not.toBeNull()
    expect((await prisma.companyContact.findUniqueOrThrow({ where: { id: w.hal.id } })).outreachOptOutAt).toBeNull()
  })

  it('opening the interested link without pressing the button changes nothing, so a mail scanner opens no lead', async () => {
    delete process.env.DEV_BYPASS_AUTH
    const t = w.interested(w.bea)
    const out = await json(await interest.GET(req('GET', `/api/answer/outreach-interest/${t}`), pt(t)))
    expect(out.status).toBe(200); expect(out.body.data).toEqual({ firm: `Win Firm ${tag}`, already: false })
    expect(await prisma.lead.count({ where: { companyId: w.firm.id, source: 'OUTREACH' } })).toBe(0)
    expect((await letterOf(w.bea)).interestedAt).toBeNull()
  })

  it('an interested link that was cut short says so and opens no lead', async () => {
    delete process.env.DEV_BYPASS_AUTH
    const t = w.interested(w.bea).slice(0, -3)
    const out = await json(await interest.POST(req('POST', `/api/answer/outreach-interest/${t}`), pt(t)))
    expect(out.status).toBe(404); expect(out.body.error.message).toMatch(/not valid.*cut short/)
    expect(await prisma.lead.count({ where: { companyId: w.firm.id, source: 'OUTREACH' } })).toBe(0)
  })

  it('pressing I\u2019m interested opens one lead and one card for the Owner, and a firm with no page lands the contact on a plain thank-you', async () => {
    delete process.env.DEV_BYPASS_AUTH
    const t = w.interested(w.bea)
    const out = await json(await interest.POST(req('POST', `/api/answer/outreach-interest/${t}`), pt(t)))
    expect(out.status).toBe(200)
    expect(out.body.data.says).toBe(`Thanks. Win Firm ${tag} has been told and will reply to you by email.`)
    expect(out.body.data.landing).toBeNull()
    const leads = await prisma.lead.findMany({ where: { companyId: w.firm.id, source: 'OUTREACH' } })
    expect(leads).toHaveLength(1)
    expect([leads[0].postedByCompanyId, leads[0].contact]).toEqual([w.birch.id, w.bea.email])
    const cards = await prisma.decisionItem.findMany({ where: { companyId: w.firm.id, question: { contains: 'Bea Birch' } } })
    expect(cards).toHaveLength(1); expect(cards[0].ownerPersonId).toBe(w.owner.id); expect(cards[0].state).toBe('OPEN')
    const l = await letterOf(w.bea)
    expect([l.state, l.stoppedReason, l.leadId]).toEqual(['STOPPED', 'INTERESTED', leads[0].id])
  })

  it('using the interested link twice opens one lead', async () => {
    delete process.env.DEV_BYPASS_AUTH
    const t = w.interested(w.bea)
    expect((await interest.POST(req('POST', `/api/answer/outreach-interest/${t}`), pt(t))).status).toBe(200)
    expect(await prisma.lead.count({ where: { companyId: w.firm.id, source: 'OUTREACH' } })).toBe(1)
    expect(await prisma.decisionItem.count({ where: { companyId: w.firm.id, question: { contains: 'Bea Birch' } } })).toBe(1)
  })

  it('a firm with a public page lands the interested contact on it, where its Ask box is, and opens no second lead', async () => {
    delete process.env.DEV_BYPASS_AUTH
    await prisma.company.update({ where: { id: w.firm.id }, data: { siteLiveAt: new Date(), pluginsOn: ['OUTREACH', 'WEBSITE'] } }) // a public page renders only where Website and content is on (record 123)
    const t = w.interested(w.bea)
    const out = await json(await interest.POST(req('POST', `/api/answer/outreach-interest/${t}`), pt(t)))
    expect(out.body.data.landing).toBe(`/site/ob-win-firm-${tag}`)
    expect(await prisma.lead.count({ where: { companyId: w.firm.id, source: 'OUTREACH' } })).toBe(1)
    await prisma.company.update({ where: { id: w.firm.id }, data: { siteLiveAt: null, pluginsOn: ['OUTREACH'] } })
  })

  it('no unsubscribe or interested token is in the mail ledger, the record ledger, a card, a lead or a reply', async () => {
    const tokens = [w.unsub(w.mina), w.interested(w.bea), w.interested(w.hal)] as string[]
    const stuff = JSON.stringify([
      await prisma.mailSend.findMany({ where: { companyId: w.firm.id } }), await prisma.recordAction.findMany({ where: { companyId: w.firm.id } }),
      await prisma.decisionItem.findMany({ where: { companyId: w.firm.id } }), await prisma.lead.findMany({ where: { companyId: w.firm.id } }),
      await prisma.agentTask.findMany({ where: { companyId: w.firm.id } }), (await view(w.task.id)).body,
    ])
    for (const t of tokens) expect(stuff).not.toContain(t.split('.')[0])
  })
})

describe('the follow-ups', () => {
  const due = async (c: any) => (await letterOf(c)).nextDueAt!
  it('a follow-up is sent after five working days to a contact who has not answered, and to nobody who unsubscribed, said they are interested, or bounced', async () => {
    await setSwitch('ON', null)
    const first = await due(w.hal)
    expect(first).toEqual(addWorkingDays(w.runOne, 5, [0, 6], new Set()))
    await run(new Date(first.getTime() - 86_400_000)) // a day too early
    expect(await mail()).toHaveLength(4)
    await run(first)
    const rows = await mail()
    expect(rows).toHaveLength(5)
    expect(rows[4].toAddresses).toEqual([w.hal.email])
    expect((await letterOf(w.mina)).state).toBe('STOPPED'); expect((await letterOf(w.mina)).stoppedReason).toBe('UNSUBSCRIBED')
    expect((await letterOf(w.bea)).stoppedReason).toBe('INTERESTED')
    expect((await letterOf(w.gus)).stoppedReason).toBe('BOUNCED')
  })
  it('a second follow-up is sent after five more working days, and a third never is', async () => {
    const second = await due(w.hal)
    await run(second)
    expect(await mail()).toHaveLength(6)
    const l = await letterOf(w.hal)
    expect([l.state, l.attempt, l.nextDueAt]).toEqual(['SENT', 3, null])
    await run(new Date(second.getTime() + 60 * 86_400_000))
    expect(await mail()).toHaveLength(6)
    expect((await mayAgentSend(w.task.id, { companyId: w.firm.id, agentKey: KEY, recordType: 'OutreachLetter', recordId: l.id, template: 'outreach-batch', attempt: 4 })).ok).toBe(false)
    const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: w.task.id } })
    expect(task.state).toBe('DONE'); expect(task.sentCount).toBe(5)
  })
  it('each letter of the batch counted as sent, and the page shows interested and unsubscribed from the letters', async () => {
    const v = (await view(w.task.id)).body.data
    expect(v.counts).toMatchObject({ contacts: 4, sent: 3, interested: 1, unsubscribed: 1, bounced: 1, waiting: 0 })
  })
  it('a letter that is not part of the approved batch is refused by the task ledger even where the template and attempt match', async () => {
    const other = await mayAgentSend(w.task.id, { companyId: w.firm.id, agentKey: KEY, recordType: 'OutreachLetter', recordId: 'not-a-letter-of-this-batch', template: 'outreach-batch', attempt: 1 })
    expect(other.ok).toBe(false)
  })
})

describe('the batch routes', () => {
  it('the batch list and one batch are read only by this firm', async () => {
    as(w.owner.primaryEmail)
    const list = await json(await batchesRoute.GET(req('GET', '/api/outreach/batches')))
    expect(list.body.data.batches).toHaveLength(1)
    const other = await json(await batchRoute.GET(req('GET', '/api/outreach/batches/nope'), p('nope')))
    expect(other.status).toBe(404)
  })
})
