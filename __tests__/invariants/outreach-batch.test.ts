import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  OUTREACH_BATCH_TEMPLATE, FOLLOW_UPS, DAYS_APART, batchPlan, batchBlock, buildLetter, readBatchAsk, settleLetter, letterDue, stopFor, sendsNow,
  batchCard, countsOf, letterWords, INTERESTED_PLACEHOLDER,
} from '@/lib/outreach/batch-rules'
import { getNavForKind } from '@/lib/nav-table'
import { sectionOfHref } from '@/lib/page-framing'
import { planWords, planRefusal, sendRefusal, type TaskPlan } from '@/lib/agents/tasks'
import { UNSUBSCRIBE_PLACEHOLDER } from '@/lib/agents/dormant-outreach-rules'

const d = (s: string) => new Date(`${s}T10:00:00Z`)
const letterIn = (o: Record<string, unknown> = {}) => ({
  firm: 'Win Firm', postal: '12 Mill Road, Leeds, LS1 4AB, GB', recipientName: 'Mina Cho', companyName: 'Orchid Foods',
  subject: 'Win Firm: people available for work', body: 'Two data engineers are free from December 8.\n\n- Spark, SQL: available now',
  unsubscribeUrl: 'https://etyme.example/answer/outreach/T.S', interestedUrl: 'https://etyme.example/answer/outreach-interest/T.S', storefrontUrl: 'https://etyme.example/site/win-firm', ...o,
}) as Parameters<typeof buildLetter>[0]

describe('the batch’s one yes', () => {
  it('a batch task approves one letter and two follow-ups per contact, five working days apart, and no more', () => {
    const plan = batchPlan(23)
    expect(plan).toMatchObject({ retries: 2, daysApart: 5, recipients: 23, letterRecordType: 'OutreachLetter' })
    expect(plan.messages).toEqual([{ template: OUTREACH_BATCH_TEMPLATE, label: 'Offer letter' }])
    expect([FOLLOW_UPS, DAYS_APART]).toEqual([2, 5])
    expect(planRefusal(plan)).toBeNull()
  })
  it('the batch card says how many contacts it writes to and how many times each may be written again', () => {
    expect(planWords(batchPlan(23))).toMatch(/to each of 23 contacts, one letter each\. Each may be sent again up to 2 times, 5 working days apart/)
  })
  it('a third follow-up is refused by the task ledger however the batch is set up', () => {
    const task = { state: 'APPROVED', sentCount: 0, plan: batchPlan(5), companyId: 'c', agentKey: 'outreach-batch', recordType: 'Company', recordId: 'c' } as any
    const ask = (attempt: number) => sendRefusal({ task, switchState: 'ON', step: { companyId: 'c', agentKey: 'outreach-batch', recordType: 'OutreachLetter', recordId: 'l1', template: OUTREACH_BATCH_TEMPLATE, attempt } } as any)
    expect(ask(3)).toBeNull()
    expect(ask(4)).toMatch(/beyond the retries/)
  })
  it('a batch that was not approved sends nothing', () => {
    const task = { state: 'PROPOSED', sentCount: 0, plan: batchPlan(5), companyId: 'c', agentKey: 'outreach-batch', recordType: 'Company', recordId: 'c' } as any
    expect(sendRefusal({ task, switchState: 'ON', step: { companyId: 'c', agentKey: 'outreach-batch', recordType: 'OutreachLetter', recordId: 'l1', template: OUTREACH_BATCH_TEMPLATE, attempt: 1 } } as any)).toMatch(/waiting for a yes/)
  })
})

describe('the letter', () => {
  it('every letter names the sending firm, its postal address, an unsubscribe link and a subject that says what it offers', () => {
    const l = buildLetter(letterIn())
    expect(l.subject).toBe('Win Firm: people available for work')
    expect(l.text).toContain('Win Firm\n12 Mill Road, Leeds, LS1 4AB, GB')
    expect(l.text).toContain('https://etyme.example/answer/outreach/T.S')
    expect(l.text).toMatch(/Unsubscribe here, no sign-in needed/)
    expect(l.text).toMatch(/stops letters like this only\. Messages about work already agreed, such as timesheets and bills, still reach you/)
    expect(l.text).toMatch(/You are getting this because Win Firm has your name in its own records as a contact at Orchid Foods/)
  })
  it('every link in the letter goes to the interested page or the firm’s own page, and there is no tracking pixel and no html', () => {
    const l = buildLetter(letterIn())
    const links = l.text.match(/https?:\/\/\S+/g) ?? []
    expect(links.sort()).toEqual([
      'https://etyme.example/answer/outreach-interest/T.S', 'https://etyme.example/answer/outreach/T.S', 'https://etyme.example/site/win-firm',
    ])
    expect(l.text).not.toMatch(/<img|<a /i)
  })
  it('on the card the links read as placeholders so no token is ever shown', () => {
    const l = buildLetter(letterIn({ unsubscribeUrl: null, interestedUrl: null }))
    expect(l.text).toContain(UNSUBSCRIBE_PLACEHOLDER)
    expect(l.text).toContain(INTERESTED_PLACEHOLDER)
  })
  it('a firm with no public page leaves the page line out of the letter', () => {
    expect(buildLetter(letterIn({ storefrontUrl: null })).text).not.toMatch(/\/site\//)
  })
  it('a letter body with a web address in it, or a subject that pretends to be a reply, is refused', () => {
    const ask = { audience: 'DORMANT_CUSTOMERS', offerKind: 'HOT_LIST', offer: { lines: [{ skills: 'SQL', availability: 'now' }] }, subject: 'Win Firm: people', body: 'See https://example.com/x' }
    const a = readBatchAsk(ask)
    expect(a.ok).toBe(false)
    if (!a.ok) expect(a.field).toBe('body')
    const b = readBatchAsk({ ...ask, body: 'Fine.', subject: 'Re: your invoice' })
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.field).toBe('subject')
  })
  it('a firm with no postal address cannot send a batch, and the card names the Settings page that fixes it', () => {
    const b = batchBlock({ postal: null, base: 'https://etyme.example' })
    expect(b).toMatchObject({ block: 'NO_POSTAL' })
    expect(b!.says).toMatch(/\/dashboard\/settings\/setup\/addresses/)
  })
  it('a deployment with no public web address drafts no letters, and says why', () => {
    const b = batchBlock({ postal: '12 Mill Road', base: '' })
    expect(b).toMatchObject({ block: 'NO_LINK' })
    expect(b!.says).toMatch(/no public web address/)
    expect(batchBlock({ postal: '12 Mill Road', base: 'https://etyme.example' })).toBeNull()
  })
})

describe('the question the create route asks', () => {
  it('names the field that is missing in one sentence', () => {
    for (const [body, field] of [
      [{}, 'audience'], [{ audience: 'DORMANT_CUSTOMERS' }, 'offerKind'],
      [{ audience: 'DORMANT_CUSTOMERS', offerKind: 'HOT_LIST', offer: { lines: [{ skills: 'SQL', availability: 'now' }] } }, 'subject'],
      [{ audience: 'DORMANT_CUSTOMERS', offerKind: 'HOT_LIST', offer: { lines: [{ skills: 'SQL', availability: 'now' }] }, subject: 'Win Firm: people' }, 'body'],
    ] as const) {
      const r = readBatchAsk(body)
      expect(r.ok).toBe(false)
      if (!r.ok) { expect(r.field).toBe(field); expect(r.says).not.toMatch(/undefined|null/) }
    }
  })
})

describe('follow-ups', () => {
  const ready = { state: 'READY', attempt: 0, nextDueAt: null }
  it('a letter that has not gone is due now, and a sent letter is due again after five working days, twice at most', () => {
    expect(letterDue(ready, d('2026-11-25'))).toBe('LETTER')
    const first = settleLetter(ready, 'SENT', d('2026-11-25'))
    expect(first).toMatchObject({ state: 'SENT', attempt: 1 })
    expect(first.nextDueAt).toEqual(new Date('2026-12-02T00:00:00Z')) // Wed Nov 25 + 5 working days
    expect(letterDue(first, d('2026-12-01'))).toBeNull()
    expect(letterDue(first, d('2026-12-02'))).toBe('FOLLOW_UP')
    const second = settleLetter(first, 'SENT', d('2026-12-02'))
    expect(second).toMatchObject({ attempt: 2 })
    const third = settleLetter(second, 'SENT', d('2026-12-09'))
    expect(third).toMatchObject({ state: 'SENT', attempt: 3, nextDueAt: null })
    expect(letterDue(third, d('2027-03-01'))).toBeNull()
  })
  it('a follow-up falls on a working day: five working days from a Friday is the next Friday', () => {
    expect(settleLetter(ready, 'SENT', d('2026-11-27')).nextDueAt).toEqual(new Date('2026-12-04T00:00:00Z'))
  })
  it('a contact who unsubscribes after the first letter gets no follow-up', () => {
    const sent = settleLetter(ready, 'SENT', d('2026-11-25'))
    expect(stopFor(sent, { optedOut: true, interested: false, bounced: false, reachable: true })).toBe('UNSUBSCRIBED')
  })
  it('a contact who presses I’m interested gets no follow-up', () => {
    const sent = settleLetter(ready, 'SENT', d('2026-11-25'))
    expect(stopFor(sent, { optedOut: false, interested: true, bounced: false, reachable: true })).toBe('INTERESTED')
  })
  it('a contact whose letter bounced gets no follow-up, and a bounce on the send itself stops the letter', () => {
    const sent = settleLetter(ready, 'SENT', d('2026-11-25'))
    expect(stopFor(sent, { optedOut: false, interested: false, bounced: true, reachable: true })).toBe('BOUNCED')
    expect(settleLetter(ready, 'FAILED_DELIVERY', d('2026-11-25'))).toMatchObject({ state: 'STOPPED', stoppedReason: 'BOUNCED', nextDueAt: null })
  })
  it('a contact nobody can reach any more is stopped with a reason that is not a bounce', () => {
    expect(stopFor(ready, { optedOut: false, interested: false, bounced: false, reachable: false })).toBe('NOT_SENT')
    expect(stopFor(ready, { optedOut: false, interested: false, bounced: false, reachable: true })).toBeNull()
  })
  it('a reserved demo address is stopped, never sent and never called a bounce', () => {
    expect(settleLetter(ready, 'DEMO_SKIPPED', d('2026-11-25'))).toMatchObject({ state: 'STOPPED', stoppedReason: 'NOT_SENT' })
  })
})

describe('the daily cap', () => {
  it('sends what the cap allows today and leaves the rest ready for the next run, never dropped and never over the cap', () => {
    expect(sendsNow(10, 4)).toEqual({ now: 4, later: 6 })
    expect(sendsNow(3, 4)).toEqual({ now: 3, later: 0 })
    expect(sendsNow(10, null)).toEqual({ now: 10, later: 0 })
    expect(sendsNow(5, 0)).toEqual({ now: 0, later: 5 })
  })
})

describe('what the batch page counts', () => {
  it('counts sent and bounced from the mail sent, and interested and unsubscribed from the letters, with no open rate', () => {
    const c = countsOf({
      letters: [
        { id: 'a', state: 'SENT', interestedAt: null, optedOut: false },
        { id: 'b', state: 'STOPPED', interestedAt: d('2026-11-26'), optedOut: false },
        { id: 'c', state: 'STOPPED', interestedAt: null, optedOut: true },
        { id: 'd', state: 'STOPPED', interestedAt: null, optedOut: false },
        { id: 'e', state: 'READY', interestedAt: null, optedOut: false },
      ],
      sends: [
        { recordId: 'a', outcome: 'SENT' }, { recordId: 'a', outcome: 'SENT' }, { recordId: 'b', outcome: 'SENT' },
        { recordId: 'c', outcome: 'SENT' }, { recordId: 'd', outcome: 'FAILED_DELIVERY' },
      ],
    })
    expect(c).toEqual({ contacts: 5, sent: 3, interested: 1, unsubscribed: 1, bounced: 1, waiting: 1 })
    expect(Object.keys(c).join()).not.toMatch(/open|click|read/i)
  })
})

describe('the batch card', () => {
  it('shows the drafted letter, who gets it and who is held and why, with no token on it', () => {
    const card = batchCard({
      firm: 'Win Firm', audienceLabel: 'Dormant customers', subject: 'Win Firm: people available for work', letter: buildLetter(letterIn({ unsubscribeUrl: null, interestedUrl: null })).text,
      to: [{ name: 'Mina Cho', email: 'mina@orchid.example', companyName: 'Orchid Foods' }],
      held: [{ companyName: 'Busy Co', says: 'Busy Co asked for no more outreach.' }],
    })
    expect(card.question).toMatch(/^Outreach: .*1 company/)
    expect(card.detail).toContain('Mina Cho <mina@orchid.example> at Orchid Foods')
    expect(card.detail).toContain('Held, not written to')
    expect(card.detail).toContain('Busy Co asked for no more outreach.')
    expect(card.detail).not.toMatch(/answer\/outreach/)
    expect(card.detail).toMatch(/proposals/)
  })
})

describe('the Outreach screen and its routes', () => {
  const screen = () => readFileSync('src/app/dashboard/companies/outreach/page.tsx', 'utf8')
  const route = () => readFileSync('src/app/api/outreach/batches/route.ts', 'utf8')
  it('every question the create route asks, the Outreach screen has a field for', () => {
    const asked = ['audience', 'offerKind', 'offer', 'subject', 'body']
    expect(route()).toMatch(/readBatchAsk\(/)
    const rules = readFileSync('src/lib/outreach/batch-rules.ts', 'utf8') + readFileSync('src/lib/outreach/offer-rules.ts', 'utf8')
    for (const f of asked) expect(rules).toMatch(new RegExp(`field: '${f}'`))
    for (const f of asked) expect(screen(), `the screen posts ${f}`).toMatch(new RegExp(`\\b${f}\\b`))
  })
  it('the Outreach page is a firm’s page whose route asks for the permission its menu link names', () => {
    expect(route()).toMatch(/hasPermission\(seat\.caller\.permissions, 'vendors\.read'\)/)
  })
})

describe('the Outreach tab', () => {
  const hrefsOf = (kind: string) => JSON.stringify(getNavForKind(kind as any, false))
  it('the Outreach tab appears under Companies for a supplier, an integrator and an MSP, and not for a client', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP']) expect(hrefsOf(kind), kind).toContain('/dashboard/companies/outreach')
    expect(hrefsOf('CLIENT')).not.toContain('/dashboard/companies/outreach')
  })
  it('the CLAUDE.md nav table lists Outreach under Companies for the same parties', () => {
    const md = readFileSync('CLAUDE.md', 'utf8')
    const row = (party: string) => md.split('\n').find((l) => l.startsWith(`| ${party} |`))!
    expect(row('Supplier')).toMatch(/Suppliers, Customers, Contacts, Outreach → Companies/)
    expect(row('MSP')).toMatch(/Customers, Contacts, Outreach → Companies/)
    expect(row('Client')).not.toMatch(/Outreach/)
  })
  it('the Outreach page\u2019s eyebrow reads the same as the Companies page beside it, for every party that has it', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP']) {
      const companies = sectionOfHref(kind as any, '/dashboard/companies')
      expect(companies, kind).toBeTruthy()
      expect(sectionOfHref(kind as any, '/dashboard/companies/outreach'), kind).toBe(companies)
    }
    expect(sectionOfHref('CLIENT' as any, '/dashboard/companies/outreach')).toBeNull()
  })
})

describe('a contact\u2019s line on the batch page', () => {
  const l = { state: 'SENT', attempt: 1, nextDueAt: new Date('2026-12-02T00:00:00Z'), stoppedReason: null, interestedAt: null, optedOut: false, bounced: false }
  it('says in plain words whether each letter is waiting, sent, answered, unsubscribed or bounced', () => {
    expect(letterWords({ ...l, state: 'READY', attempt: 0, nextDueAt: null })).toMatch(/Waiting to go/)
    expect(letterWords(l)).toMatch(/Sent once\. The next goes on or after 2026-12-02 unless they answer/)
    expect(letterWords({ ...l, interestedAt: new Date() })).toMatch(/Interested/)
    expect(letterWords({ ...l, optedOut: true })).toMatch(/Unsubscribed/)
    expect(letterWords({ ...l, bounced: true })).toMatch(/Bounced.*new address/)
    expect(letterWords({ ...l, attempt: 3, nextDueAt: null })).toMatch(/Sent 3 times\. No more follow-ups/)
  })
})
