/**
 * The Outreach switch (records 122, 123 answers 4 and 5), on the database:
 * only the letters that sell are held while it is off, an approved task
 * pauses visibly under its own yes and goes on under it when the Owner turns
 * Outreach on. Chases, drafting and approval are never held.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, type GoldenWorld } from './golden-world'
import { proposeTask, approvalOf, mayAgentSend, openTasks, outreachPausedSays, OUTREACH_PAUSED, OUTREACH_RESUMED, TASK_RECORD } from '@/lib/agents/tasks'
import { OUTREACH_PLAN, OUTREACH_RECORD, OUTREACH_TEMPLATE } from '@/lib/agents/dormant-outreach-rules'
import { sendMail } from '@/lib/notify/mail-door'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-outreach-gate'
const KEY = 'census-keeper'
let w: GoldenWorld
let sold: { id: string; contactId: string }
let chase: { id: string }
const handed: string[] = []
const deps = { env: { NOTIFY_FROM_EMAIL: 'hello@etyme.example', RESEND_API_KEY: 'k' }, isDemo: () => false, hand: async (e: any) => { handed.push(String(e.text)); return { provider: 'Resend' as const, messageId: 'm' } } }
const setOutreach = (on: boolean) => prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: on ? ['OUTREACH'] : [] } })
const yes = async (taskId: string) => {
  const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  await prisma.decisionItem.update({ where: { id: t.decisionId }, data: { state: 'APPROVED', decidedByPersonId: w.am.id, decidedAt: new Date() } })
  await approvalOf(taskId)
}
const rows = (taskId: string, action: string) => prisma.recordAction.count({ where: { recordType: TASK_RECORD, recordId: taskId, action } })
const stepFor = (taskId: string, template: string, contactId: string) => ({ companyId: w.firm.id, agentKey: KEY, recordType: OUTREACH_RECORD, recordId: contactId, template, attempt: 1 })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, KEY, 'ON')
  await setOutreach(false)
  const contact = await prisma.companyContact.findFirstOrThrow({ where: { companyId: w.firm.id } })
  const other = await prisma.companyContact.create({ data: { companyId: w.firm.id, atCompanyId: contact.atCompanyId, name: 'Second Contact', email: 'second.contact@example.invalid', kind: 'HIRING_MANAGER' } })
  // Drafting is open while Outreach is off: both tasks are proposed and asked for a yes.
  sold = { id: (await proposeTask({ companyId: w.firm.id, agentKey: KEY, kind: 'DORMANT_OUTREACH_CUSTOMER', recordType: OUTREACH_RECORD, recordId: contact.id, plan: OUTREACH_PLAN, ownerPersonId: w.am.id, question: 'Check in with customer Quiet Co?' })).id, contactId: contact.id }
  chase = await proposeTask({ companyId: w.firm.id, agentKey: KEY, kind: 'SUBMISSION_CHASE', recordType: OUTREACH_RECORD, recordId: other.id, plan: { messages: [{ template: 'submission-chase' }], retries: 0, daysApart: 1, closesWhen: 'the submission is answered' }, ownerPersonId: w.am.id, question: 'Chase the submission?' })
  await yes(sold.id); await yes(chase.id)
}, 600_000)

describe('the Outreach switch, on the database', () => {
  it('while Outreach is off an outreach task can still be drafted, previewed on its card and approved', async () => {
    const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: sold.id } })
    expect(t.state).toBe('APPROVED')
    expect(await prisma.decisionItem.findUnique({ where: { id: t.decisionId } })).toMatchObject({ state: 'APPROVED' })
  })

  it('while Outreach is off an approved check-in letter is refused in the paused sentence and the task stays approved', async () => {
    const got = await mayAgentSend(sold.id, stepFor(sold.id, OUTREACH_TEMPLATE, sold.contactId))
    expect(got).toEqual({ ok: false, says: outreachPausedSays('Golden Firm') })
    expect(outreachPausedSays('Golden Firm')).toBe('Paused: Outreach is off for Golden Firm. Nothing more is sent until the Owner turns it on. Letters already sent stand.')
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: sold.id } })).state).toBe('APPROVED')
  })

  it('the mail door refuses an agent’s selling letter while Outreach is off even if the walker forgot to ask', async () => {
    const r = await sendMail({ to: 'quinn.quiet@example.invalid', subject: 'Hello', text: 'Approved text', about: { companyId: w.firm.id, agentKey: KEY, agentTaskId: sold.id, agentAttempt: 1, recordType: OUTREACH_RECORD, recordId: sold.contactId, template: OUTREACH_TEMPLATE } }, deps as any)
    expect(r.outcome).toBe('REFUSED')
    expect(handed).toHaveLength(0)
  })

  it('a task paused by the switch writes one paused row on the ledger and not one per run', async () => {
    for (let i = 0; i < 3; i++) await mayAgentSend(sold.id, stepFor(sold.id, OUTREACH_TEMPLATE, sold.contactId))
    expect(await rows(sold.id, OUTREACH_PAUSED)).toBe(1)
    expect(await rows(sold.id, OUTREACH_RESUMED)).toBe(0)
  })

  it('the control list says a paused task is paused in a sentence and links the Owner to Settings', async () => {
    const t = (await openTasks(w.firm.id)).find((x) => x.id === sold.id)!
    expect(t.paused).toBe(outreachPausedSays('Golden Firm'))
    const route = (await import('node:fs')).readFileSync('src/app/api/decision-items/agents/route.ts', 'utf8')
    expect(route).toMatch(/pausedHref/)
  })

  it('the submission chase stays open and sends while Outreach is off', async () => {
    const other = (await prisma.agentTask.findUniqueOrThrow({ where: { id: chase.id } })).recordId
    expect((await mayAgentSend(chase.id, stepFor(chase.id, 'submission-chase', other))).ok).toBe(true)
    expect((await openTasks(w.firm.id)).find((x) => x.id === chase.id)!.paused).toBeNull()
    expect(await rows(chase.id, OUTREACH_PAUSED)).toBe(0)
  })

  it('an approved task paused by the switch sends the approved text under its own yes once the Owner turns Outreach on, with one resumed row', async () => {
    const before = await prisma.agentTask.findUniqueOrThrow({ where: { id: sold.id } })
    await setOutreach(true)
    expect(await mayAgentSend(sold.id, stepFor(sold.id, OUTREACH_TEMPLATE, sold.contactId))).toEqual({ ok: true })
    await mayAgentSend(sold.id, stepFor(sold.id, OUTREACH_TEMPLATE, sold.contactId))
    expect(await rows(sold.id, OUTREACH_RESUMED)).toBe(1)
    const after = await prisma.agentTask.findUniqueOrThrow({ where: { id: sold.id } })
    expect([after.decisionId, after.state, JSON.stringify(after.payload), JSON.stringify(after.plan)]).toEqual([before.decisionId, before.state, JSON.stringify(before.payload), JSON.stringify(before.plan)])
    expect((await openTasks(w.firm.id)).find((x) => x.id === sold.id)!.paused).toBeNull()
  })

  it('switching Outreach off again pauses the task once more with a second paused row', async () => {
    await setOutreach(false)
    expect((await mayAgentSend(sold.id, stepFor(sold.id, OUTREACH_TEMPLATE, sold.contactId))).ok).toBe(false)
    expect(await rows(sold.id, OUTREACH_PAUSED)).toBe(2)
  })
})
