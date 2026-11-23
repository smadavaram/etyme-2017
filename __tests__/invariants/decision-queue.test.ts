import { describe, it, expect } from 'vitest'
import {
  mayOpenDecision, maySetHomePage, readOpenAsk, openBody, readDecideAsk, decideBody, agentRows, ageWords,
  ownPageOf, recordViewHref, readHomeAsk, FIRM_AGENTS, VERDICT_BUTTONS, PROOF_TYPES,
  QUEUE_EYEBROW_HREFS, ledgerBeganSays, readNeeds, isRecordType, cannotReadSays,
} from '@/lib/decision-queue'
import { queueCards } from '@/app/api/conversations/twin/ask'
import { execSync } from 'child_process'
import { sectionOfHref } from '@/lib/page-framing'
import { ledgerWhen } from '@/components/ui/ledger-rows'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sidebarPropsFrom, deskOf } from '@/components/shell/sidebar-props'

/** Record 107, Flow A: the decision queue's rules, without a database. */

const typed = { question: 'Approve the renewal?', ownerPersonId: 'p1', openedOn: '2025-10-05', actingEntityId: 'e1', proof: 'The letter.', proofLinks: [] }

describe('who opens a decision and who sets the first screen', () => {
  it('the Owner or an Admin may open a decision, and nobody else', () => {
    expect(mayOpenDecision('Owner')).toBeNull()
    expect(mayOpenDecision('Admin')).toBeNull()
    expect(mayOpenDecision('Account Manager')).toMatch(/Owner or an Admin/)
    expect(mayOpenDecision(null)).toMatch(/Owner or an Admin/)
  })

  it('only the Owner sets the first screen after sign-in', () => {
    expect(maySetHomePage('Owner')).toBeNull()
    expect(maySetHomePage('Admin')).toMatch(/Only the firm’s Owner/)
  })

  it('the first screen is the usual one or the decision queue, and a firm with entities names the one it changes it for', () => {
    expect(readHomeAsk({ homePage: 'DECISIONS' }, false)).toEqual({ ok: true, homePage: 'DECISIONS', actingEntityId: null })
    expect(readHomeAsk({ homePage: 'USUAL' }, false)).toEqual({ ok: true, homePage: null, actingEntityId: null })
    expect(readHomeAsk({ homePage: 'TODAY' }, false).ok).toBe(false)
    expect(readHomeAsk({ homePage: 'DECISIONS' }, true).ok).toBe(false)
  })
})

describe('opening a decision', () => {
  it('a decision without a question, an owner, a day it opened or its proof is refused in a sentence naming what is missing', () => {
    for (const [field, says] of [['question', /question/], ['ownerPersonId', /who owes/], ['openedOn', /day the decision opened/], ['proof', /what shows it is owed/]] as const) {
      const r = readOpenAsk({ ...openBody(typed), [field]: '' }, false)
      expect(r.ok).toBe(false)
      if (!r.ok) { expect(r.field).toBe(field); expect(r.says).toMatch(says) }
    }
  })

  it('the entity is never defaulted: a firm with entities must choose one', () => {
    const r = readOpenAsk(openBody({ ...typed, actingEntityId: '' }), true)
    expect(r.ok).toBe(false)
    expect(readOpenAsk(openBody(typed), true).ok).toBe(true)
  })

  it('a proof link names one of the five kinds of record, and a decision is not one of them', () => {
    expect(PROOF_TYPES.map((p) => p.label)).toEqual(['A company', 'A contract', 'A person on your list', 'An invoice receipt', 'A bill'])
    expect(readOpenAsk(openBody({ ...typed, proofLinks: [{ recordType: 'Invoice', recordId: 'i1' }] }), false).ok).toBe(true)
    expect(readOpenAsk(openBody({ ...typed, proofLinks: [{ recordType: 'DecisionItem', recordId: 'd1' }] }), false).ok).toBe(false)
    expect(readOpenAsk({ ...openBody(typed), proofLinks: [{ recordType: 'Timesheet', recordId: 't1' }] }, false).ok).toBe(false)
  })
})

describe('the three acts', () => {
  it('an item offers exactly three buttons: Approve, Send back and Reject', () => {
    expect(VERDICT_BUTTONS.map((b) => b.label)).toEqual(['Approve', 'Send back', 'Reject'])
  })

  it('approve needs no reason; send back and reject each need one line', () => {
    expect(readDecideAsk(decideBody('APPROVE', '', ''), false).ok).toBe(true)
    const back = readDecideAsk(decideBody('SEND_BACK', '  ', ''), false)
    expect(back.ok === false && back.says).toBe('Say in one line why it is sent back.')
    const no = readDecideAsk(decideBody('REJECT', '', ''), false)
    expect(no.ok === false && no.says).toBe('Say in one line why it is rejected.')
    expect(readDecideAsk(decideBody('REJECT', 'Too costly.', ''), false).ok).toBe(true)
  })

  it('a decider at a firm with entities chooses which one she decides for', () => {
    expect(readDecideAsk(decideBody('APPROVE', '', ''), true).ok).toBe(false)
    expect(readDecideAsk(decideBody('APPROVE', '', 'e1'), true).ok).toBe(true)
  })

  it('an age reads in whole days, “412 days”', () => {
    expect(ageWords(412)).toBe('412 days')
    expect(ageWords(1)).toBe('1 day')
    expect(ageWords(0)).toBe('Today')
  })
})

describe('agent control', () => {
  it('the seven agents each read off, a count of actions as the meter, and no cap until the Owner sets one', () => {
    const rows = agentRows([{ agentKey: 'digest-scanner', count: 2 }, { agentKey: null, count: 9 }])
    expect(rows.map((r) => r.name)).toEqual(FIRM_AGENTS.map((a) => a.name))
    expect(rows).toHaveLength(7)
    expect(rows.every((r) => r.state === 'Off' && r.cap.endsWith('today · no cap'))).toBe(true)
    expect(rows.find((r) => r.key === 'digest-scanner')).toMatchObject({ actionsToday: 2, meter: '2 actions' })
    expect(rows.find((r) => r.key === 'census-keeper')).toMatchObject({ actionsToday: 0, meter: '0 actions' })
  })
})

describe('the record view', () => {
  it('every kind of record links to its own existing page', () => {
    expect(ownPageOf('SellContract', 'c1').href).toBe('/dashboard/placements/c1')
    expect(ownPageOf('Person', 'p1').href).toBe('/dashboard/people/p1')
    expect(ownPageOf('Invoice', 'i1').href).toBe('/dashboard/invoices/i1')
    expect(ownPageOf('DecisionItem', 'd1').href).toBe('/dashboard/decisions/d1')
    expect(recordViewHref('Company', 'x1')).toBe('/dashboard/records/Company/x1')
  })
})

describe('the session carries the firm’s home setting to the menu', () => {
  const base = { loading: false, contextType: 'EMPLOYEE' as const, isWorker: false, permissions: ['*'] }
  it('a seat at a firm whose home is the decision queue carries it to the sidebar and the header', () => {
    const session = { ...base, company: { id: 'c', name: 'Queue Firm', slug: 'q', kind: 'VENDOR' as const, homePage: 'DECISIONS' as const } }
    expect(sidebarPropsFrom(session as any).homePage).toBe('DECISIONS')
    expect(deskOf(session as any).homePage).toBe('DECISIONS')
  })

  it('a seat in a client’s program does not carry its own firm’s home setting there', () => {
    const session = { ...base, company: { id: 'c', name: 'MSP', slug: 'm', kind: 'MSP' as const, homePage: 'DECISIONS' as const }, seat: { clientId: 'k', clientName: 'Client', roleName: null, permissions: ['*'] } }
    expect(sidebarPropsFrom(session as any).homePage).toBeNull()
    expect(deskOf(session as any).homePage).toBeNull()
  })
})

describe('how the queue’s pages are framed and drawn (the walk of Flow A)', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  const pages = ['src/app/dashboard/decisions/page.tsx', 'src/app/dashboard/decisions/[id]/page.tsx', 'src/app/dashboard/decisions/agents/page.tsx', 'src/app/dashboard/records/[type]/[id]/page.tsx']

  it('the queue, an item, agent control and the record view are headed Today, the page they are reached from', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP'] as const) {
      expect(QUEUE_EYEBROW_HREFS.map((h) => sectionOfHref(kind, h)).find(Boolean), kind).toBe('Today')
    }
    for (const f of pages) expect(src(f), f).toMatch(/useFirstPageSection\(QUEUE_EYEBROW_HREFS\)/)
  })

  it('at phone width a ledger row stacks as lines, so no column is cut off', () => {
    const rows = src('src/components/ui/ledger-rows.tsx')
    expect(rows).toMatch(/hidden sm:table/)
    expect(rows).toMatch(/<ul className="sm:hidden/)
    for (const f of [pages[2], pages[3]]) expect(src(f), f).toMatch(/<LedgerRows /)
  })

  it('an item’s history says the time of each act, not only the day', () => {
    expect(ledgerWhen('2026-11-21T15:04:00Z')).toMatch(/\d{1,2}:\d{2}\s?[AP]M/)
    expect(src(pages[1])).toMatch(/\{when\(r\.at\)\}/)
  })

  it('a record with no ledger rows says when the firm’s ledger began, or that it starts with the next act', () => {
    expect(ledgerBeganSays(null)).toBe('The ledger starts with the next act on this record.')
    expect(ledgerBeganSays(new Date('2026-11-21T10:00:00Z'))).toMatch(/^Your firm’s ledger began on November 21, 2026/)
  })

  it('a record view asks for the permission its own list asks for', () => {
    expect([readNeeds('SellContract'), readNeeds('Person'), readNeeds('Invoice'), readNeeds('Company')]).toEqual(['assignments.read', 'consultants.read', 'invoices.read', null])
  })

  it('a consultant’s month is a kind of record the record view opens, for a seat that reads payroll', () => {
    expect(isRecordType('MoneyChain')).toBe(true)
    expect(readNeeds('MoneyChain')).toBe('payroll.read')
    expect(cannotReadSays('MoneyChain')).toBe('Your seat cannot read payroll records.')
    // It is never picked as proof by hand: only a disputed month's own decision links to it.
    expect(PROOF_TYPES.some((p) => (p.type as string) === 'MoneyChain')).toBe(false)
    expect(readOpenAsk({ ...typed, proofLinks: [{ recordType: 'MoneyChain', recordId: 'm1' }] }, true).ok).toBe(false)
    const route = src('src/app/api/records/[type]/[id]/route.ts')
    expect(route).toContain('monthPageOf(id)')
    const lookup = src('src/app/api/records/lookup.ts')
    for (const fact of ['Consultant', 'Client', 'Month', 'State', 'Stated on the timesheet', 'Invoiced', 'Paid']) expect(lookup, fact).toContain(`f('${fact}'`)
  })

  it('every kind of record a ledger row is written on is a kind the record view opens, so no ledger line is a dead link', () => {
    // Every file that writes to the ledger, and the record type each names.
    const files = execSync("grep -rl 'writeRecordAction(' src", { encoding: 'utf8' }).trim().split('\n').filter((f) => !f.endsWith('lib/record-ledger.ts'))
    const named = new Set<string>()
    const consts: Record<string, string> = { CHAIN_RECORD: 'MoneyChain', DECISION_RECORD: 'DecisionItem', SWITCH_RECORD: 'AgentSwitch', TASK_RECORD: 'AgentTask' }
    for (const f of files) {
      const text = src(f)
      for (const m of text.matchAll(/writeRecordAction\([\s\S]*?recordType: ('([A-Za-z]+)'|([A-Z_]+))/g)) named.add(m[2] ?? consts[m[3]] ?? m[3])
    }
    expect(named.size).toBeGreaterThanOrEqual(3)
    for (const t of named) expect(isRecordType(t), t).toBe(true)
  })

  it('a seat the queue refuses reads the refusal once: no heading, no tabs, no chips and no second refusal under it', () => {
    const page = src('src/app/dashboard/decisions/page.tsx')
    expect(page).toContain("if (typeof door === 'object') return <RefusedState says={door.refused} />")
    // The heading, the tabs and the cards under the queue are drawn only once the door has opened.
    expect(page).toMatch(/\{door === 'OPEN' && \(\s*<>\s*<PageHead[^\n]*title="Decisions"/)
    expect(page).toContain("{door === 'OPEN' && <NeedsAttention />}")
    const queue = src('src/app/dashboard/decisions/queue.tsx')
    expect(queue).toContain('if (isRefusal(e) && onAnswered) { setRefused(true); onAnswered(e.message); return }')
    expect(queue).toContain('if (refused) return null')
    const agents = src('src/app/dashboard/decisions/agents/page.tsx')
    expect(agents.indexOf('if (refused) return <RefusedState says={refused} />')).toBeGreaterThan(0)
    expect(agents.indexOf('if (refused) return <RefusedState says={refused} />')).toBeLessThan(agents.indexOf('<PageHead'))
  })

  it('a decision’s card keeps its question mark and gains no period after it', () => {
    const card = (title: string) => queueCards({ total: 1, items: [{ type: 'DECISION_ITEM', title, subtitle: 'Open 438 days · Brightmoor Staffing LLC', entityId: 'd1', actionUrl: '/dashboard/decisions/d1' } as any] })[0]
    expect(card('Write off the unpaid balance on the 2025 bill, rather than chase it further?').title).toBe('Write off the unpaid balance on the 2025 bill, rather than chase it further?')
    expect(card('Renew the supplier agreement').title).toBe('Renew the supplier agreement.')
  })

  it('agent control tells a seat that does not read payroll how many acts on payroll records it is not shown', () => {
    expect(src('src/app/dashboard/decisions/agents/page.tsx')).toContain('{data.ledger.payrollHidden && <p')
    expect(src('src/app/api/decision-items/agents/route.ts')).toContain('payrollHidden: payrollRowsHiddenSays(ledger.hidden)')
  })
})
