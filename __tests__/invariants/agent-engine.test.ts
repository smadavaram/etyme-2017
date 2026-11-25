import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sendRefusal, planWords, planRefusal, type TaskPlan, type SendCheck } from '@/lib/agents/tasks'
import { mayChangeSwitch, readSwitchAsk, capWords, offSays, agentKeys } from '@/lib/agents/switch'
import { agentRows } from '@/lib/decision-queue'

const PLAN: TaskPlan = { messages: [{ template: 'timesheet-chase', label: 'Timesheet reminder' }], retries: 2, daysApart: 2, closesWhen: 'the timesheet arrives' }
const task = (o: Partial<SendCheck['task']> = {}): SendCheck['task'] => ({ companyId: 'c1', agentKey: 'chase-and-reconciliation', recordType: 'MoneyChain', recordId: 'm1', state: 'APPROVED', plan: PLAN, sentCount: 0, ...o })
const step = (o: Partial<SendCheck['step']> = {}): SendCheck['step'] => ({ companyId: 'c1', agentKey: 'chase-and-reconciliation', recordType: 'MoneyChain', recordId: 'm1', template: 'timesheet-chase', attempt: 1, ...o })
const check = (t = task(), sw: SendCheck['switchState'] = 'ON', s = step()) => sendRefusal({ task: t, switchState: sw, step: s })

describe('the agent switch', () => {
  it('only the Owner changes an agent’s switch, and an Admin cannot', () => {
    expect(mayChangeSwitch('Owner')).toBeNull()
    expect(mayChangeSwitch('Admin')).toMatch(/Only the firm’s Owner/)
    expect(mayChangeSwitch(null)).toMatch(/Only the firm’s Owner/)
  })
  it('the twelve agents are named, payroll draft among them', () => {
    expect(agentKeys()).toHaveLength(13)
    expect(agentKeys()).toContain('payroll-draft')
  })
  it('the switch asks for one of Off, Drafts only or On and a whole-number cap or none', () => {
    expect(readSwitchAsk('payroll-draft', { state: 'MAYBE' }, false)).toMatchObject({ ok: false, field: 'state' })
    expect(readSwitchAsk('payroll-draft', { state: 'ON', dailyCap: 0 }, false)).toMatchObject({ ok: false, field: 'dailyCap' })
    expect(readSwitchAsk('payroll-draft', { state: 'ON', dailyCap: 5 }, false)).toMatchObject({ ok: true, ask: { dailyCap: 5 } })
    expect(readSwitchAsk('payroll-draft', { state: 'ON', dailyCap: null }, false)).toMatchObject({ ok: true, ask: { dailyCap: null } })
    expect(readSwitchAsk('nobody', { state: 'ON' }, false)).toMatchObject({ ok: false, field: 'agentKey' })
  })
  it('a firm with legal entities must say which one a switch change is made for', () => {
    expect(readSwitchAsk('payroll-draft', { state: 'ON' }, true)).toMatchObject({ ok: false, field: 'actingEntityId' })
  })
  it('the digest scanner reads Not live yet on Agent control and cannot be switched On', () => {
    expect(agentRows([]).find((r) => r.key === 'digest-scanner')).toMatchObject({ state: 'Not live yet', live: false })
    expect(readSwitchAsk('digest-scanner', { state: 'ON' }, false)).toMatchObject({ ok: false, field: 'state', says: 'Digest scanner is not live yet, so it cannot be switched on.' })
    expect(readSwitchAsk('digest-scanner', { state: 'OFF' }, false)).toMatchObject({ ok: true })
  })
  it('the control view reads off for an agent never switched, and “3 of 10 today” against a cap', () => {
    const rows = agentRows([{ agentKey: 'census-keeper', count: 3 }], [{ agentKey: 'census-keeper', state: 'ON', dailyCap: 10 }])
    expect(rows.find((r) => r.key === 'payroll-draft')).toMatchObject({ state: 'Off', cap: '0 today · no cap' })
    expect(rows.find((r) => r.key === 'census-keeper')).toMatchObject({ state: 'On', cap: '3 of 10 today' })
    expect(capWords(3, null)).toBe('3 today · no cap')
    expect(offSays('payroll-draft')).toMatch(/Payroll draft is off, so it did nothing/)
  })
})

describe('what a task’s one yes allows', () => {
  it('a task’s plan is said in plain words, and a plan with no letters or no closing is refused', () => {
    expect(planWords(PLAN)).toMatch(/sends “Timesheet reminder”.*up to 2 times, 2 working days apart.*closes the task when the timesheet arrives.*new task and asks you again/)
    expect(planRefusal({ ...PLAN, messages: [] })).toMatch(/names the letters/)
    expect(planRefusal({ ...PLAN, closesWhen: ' ' })).toMatch(/what closes it/)
    expect(planRefusal(PLAN)).toBeNull()
  })
  it('one yes releases the whole task: the first send, each permitted retry and nothing asked again', () => {
    for (const attempt of [1, 2, 3]) expect(check(task({ sentCount: attempt - 1, state: attempt === 1 ? 'APPROVED' : 'RUNNING' }), 'ON', step({ attempt }))).toBeNull()
  })
  it('a retry beyond the approved plan is refused and needs a new task', () => {
    expect(check(task(), 'ON', step({ attempt: 4 }))).toMatch(/beyond the retries.*new task and a new yes/)
  })
  it('a letter that is not in the approved plan is refused and needs a new task', () => {
    expect(check(task(), 'ON', step({ template: 'final-notice' }))).toMatch(/not in the approved plan/)
  })
  it('a task that has sent all it was approved for sends no more', () => {
    expect(check(task({ sentCount: 3, state: 'RUNNING' }), 'ON', step({ attempt: 3 }))).toMatch(/sent everything/)
  })
  it('a task still waiting for its yes, or refused, sends nothing', () => {
    expect(check(task({ state: 'PROPOSED' }))).toMatch(/waiting for a yes/)
    expect(check(task({ state: 'REFUSED' }))).toMatch(/refused/)
  })
  it('a closed task never sends again', () => {
    for (const state of ['DONE', 'CLOSED_BY_ARRIVAL', 'STOPPED']) expect(check(task({ state }))).toMatch(/closed/)
  })
  it('approval of one task never lets the agent send about another record, for another agent or another firm', () => {
    expect(check(task(), 'ON', step({ recordId: 'm2' }))).toMatch(/another record/)
    expect(check(task(), 'ON', step({ agentKey: 'digest-scanner' }))).toMatch(/another agent or firm/)
    expect(check(task(), 'ON', step({ companyId: 'c2' }))).toMatch(/another agent or firm/)
  })
  it('an agent that is off sends nothing even inside an approved task', () => {
    expect(check(task({ state: 'RUNNING' }), 'OFF')).toMatch(/is off/)
  })
  it('an agent on drafts only sends nothing even after a yes', () => {
    expect(check(task(), 'DRAFT_ONLY')).toMatch(/drafts only.*sends nothing, even after a yes/)
  })
})

describe('the doors that carry it', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it('the mail door refuses an agent’s send that names no approved task, in a sentence, on the mail ledger', () => {
    const door = read('src/lib/notify/mail-door.ts')
    expect(door).toContain('agentGateFromTasks')
    expect(door).toContain('agentTaskId')
    expect(door).toMatch(/An agent sends only inside a task a person approved/)
  })
  it('the daily cron runs the agents job', () => {
    expect(read('src/app/api/cron/daily/route.ts')).toContain("path: 'agents'")
  })
})

describe('one yes for a batch of letters (record 117)', () => {
  const BATCH: TaskPlan = { messages: [{ template: 'outreach-batch', label: 'Offer letter' }], retries: 2, daysApart: 5, closesWhen: 'every contact has had the letter and its follow-ups, or answered', recipients: 3, letterRecordType: 'OutreachLetter' }
  const bt = (o: Partial<SendCheck['task']> = {}) => task({ recordType: 'AgentTask', recordId: 't1', plan: BATCH, ...o })
  const bs = (o: Partial<SendCheck['step']> = {}) => step({ recordType: 'OutreachLetter', recordId: 'l1', template: 'outreach-batch', ...o })
  it('a batch approves one letter and two follow-ups for each contact, and no more', () => {
    expect(check(bt({ sentCount: 8 }), 'ON', bs({ attempt: 3 }))).toBeNull()
    expect(check(bt({ sentCount: 9 }), 'ON', bs())).toMatch(/sent everything it was approved for/)
    expect(check(bt(), 'ON', bs({ attempt: 4 }))).toMatch(/beyond the retries/)
  })
  it('a batch letter must be a letter, never a send about some other record', () => {
    expect(check(bt(), 'ON', bs({ recordType: 'Invoice' }))).toMatch(/approved for another record/)
  })
  it('a batch says how many it writes to and what each letter is about, and its card says so', () => {
    expect(planRefusal({ ...BATCH, recipients: 0 })).toMatch(/how many people/)
    expect(planRefusal({ ...BATCH, letterRecordType: undefined })).toMatch(/what record each of its letters/)
    expect(planWords(BATCH)).toMatch(/to each of 3 contacts, one letter each/)
  })
  it('a task that is no batch is unchanged: one record, its own letters', () => {
    expect(check(task(), 'ON', step({ recordId: 'other' }))).toMatch(/approved for another record/)
    expect(check(task({ sentCount: 3 }))).toMatch(/sent everything/)
  })
})
