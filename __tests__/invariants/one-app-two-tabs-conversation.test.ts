import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readAsk, respond, type Readers, type QueueCard, type QueueRead } from '@/app/api/conversations/twin/ask'
import { pinnedFor, PINNED_BY_ROLE } from '@/app/api/conversations/twin/pinned'
import { askHref, askOf } from '@/app/dashboard/conversations/ask-href'
import { batchOf, batchLabel, batchSays, todayRows, OPEN_IN_ASK_ETYME } from '@/components/twin-conversation/today-decisions'

/**
 * "One app, two tabs", piece 2 (founder, 2026-11-08): Ask Etyme's left
 * column (New conversation and search, Pinned, the conversations), the
 * pinned questions answered by the rules, Profitability's cut asked in
 * the chat, and Today's decision rows with Yes, Not now and Yes to all.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-11-08T15:00:00Z')

/** A reader that answers only what a test gives it; anything else is a read nobody expected. */
function readers(given: Partial<Readers>): Readers {
  return new Proxy(given as Readers, {
    get(target, key: string) {
      if (key in target) return (target as any)[key]
      if (key === 'vocabulary') return async () => ({ people: [], firms: [] })
      if (key === 'then') return undefined
      return () => { throw new Error(`${key} was read and nobody expected it`) }
    },
  })
}

const SUPPLIER_OWNER = { party: 'FIRM' as const, role: 'Owner', permissions: ['*'], companyKind: 'VENDOR' }
const HIRING_MANAGER = { party: 'CLIENT' as const, role: 'Hiring Manager', permissions: ['requirements.read', 'requirements.write', 'timesheets.approve', 'timesheets.read', 'assignments.read'], companyKind: 'CLIENT' }
const AP_CLERK = { party: 'CLIENT' as const, role: 'AP Clerk', permissions: ['timesheets.read', 'invoices.read', 'payments.record', 'rates.read'], companyKind: 'CLIENT' }

describe('three pinned questions per role, each one this seat gets an answer to', () => {
  it('a supplier’s three pinned questions are the weeks to accept, the unpaid bills and who is coming free', () => {
    expect(pinnedFor(SUPPLIER_OWNER)).toEqual([...PINNED_BY_ROLE.SUPPLIER])
  })

  it('a client’s hiring manager is pinned who applied and who matches this job, and never spend she cannot read', () => {
    const pins = pinnedFor(HIRING_MANAGER)
    expect(pins.slice(0, 2)).toEqual(['Who applied?', 'Who matches this job?'])
    expect(pins).not.toContain('What am I paying across suppliers?')
    expect(pins).toHaveLength(3)
  })

  it('a hiring manager who reads the invoices is pinned what she pays across suppliers', () => {
    expect(pinnedFor({ ...HIRING_MANAGER, permissions: [...HIRING_MANAGER.permissions, 'invoices.read'] }))
      .toEqual([...PINNED_BY_ROLE.HIRING_MANAGER])
  })

  it('a client’s AP clerk is pinned the receipts she can pay and what is on hold, and a supplier’s question is replaced by her own', () => {
    const pins = pinnedFor(AP_CLERK)
    expect(pins.slice(0, 2)).toEqual(['Which invoice receipts can I pay?', 'What is on hold, and why?'])
    expect(pins).not.toContain('Which weeks are signed and not billed?')
    expect(pins).toHaveLength(3)
  })

  it('no two pinned questions ask the same thing in different words', () => {
    for (const seat of [SUPPLIER_OWNER, HIRING_MANAGER, AP_CLERK]) {
      const asked = pinnedFor(seat).map((q) => JSON.stringify(readAsk(q)))
      expect(new Set(asked).size, seat.role).toBe(asked.length)
    }
  })

  it('every pinned question is read by the rules and never left to the model', () => {
    for (const list of Object.values(PINNED_BY_ROLE)) {
      for (const q of list) expect(readAsk(q).kind, q).not.toBe('ASK')
    }
  })
})

describe('a pinned question sends the question', () => {
  it('a pinned question opens Ask Etyme carrying the question on its address', () => {
    expect(askHref('What is on hold, and why?')).toBe('/dashboard/conversations/etyme?ask=What%20is%20on%20hold%2C%20and%20why%3F')
    expect(askOf(new URLSearchParams(askHref('What is on hold, and why?').split('?')[1]).get('ask'))).toBe('What is on hold, and why?')
    expect(askOf('   ')).toBeNull()
  })

  it('the column’s pinned button opens that address, and Ask Etyme sends the carried question once and takes it off the address', () => {
    const page = read('src/app/dashboard/conversations/page.tsx')
    expect(page).toContain('onClick={() => router.push(askHref(question, showAsk ? askThread : null) as Route)}')
    const chat = read('src/app/dashboard/conversations/ask-etyme.tsx')
    expect(chat).toContain("const carried = askOf(searchParams.get('ask'))")
    expect(chat).toContain('sentFromLink.current = carried')
    expect(chat).toMatch(/router\.replace\(named\(pathname[^)]*\) as Route, \{ scroll: false \}\)\s*\n\s*void ask\(carried\)/)
  })

  it('a link to Conversations with a question, as Profitability’s “Ask about this table” is, opens Ask Etyme with it', () => {
    const page = read('src/app/dashboard/conversations/page.tsx')
    expect(page).toContain('if (askParam && !askOpen) router.replace(askHref(askParam) as Route, { scroll: false })')
  })
})

describe('Ask Etyme’s column holds New conversation, search, Pinned and the conversations, and the page draws no list of its own', () => {
  const page = read('src/app/dashboard/conversations/page.tsx')

  it('the page fills the three places in the column', () => {
    expect(page).toContain('<RailSlot name="top">')
    expect(page).toContain('<RailSlot name="pinned">')
    expect(page).toContain('<RailSlot name="conversations">')
    expect(page).toContain('+ New conversation')
    expect(page).toContain('placeholder="Search conversations"')
  })

  it('the conversations are listed newest first and searched by title, firm and last message', () => {
    expect(page).toContain('.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))')
    expect(page).toContain("[c.title, c.otherCompany?.name ?? '', c.lastMessage?.body ?? '']")
  })

  it('the page’s own list column and its Ask Etyme row are gone, because the switch is Ask Etyme', () => {
    expect(page).not.toContain('md:w-[340px]')
    expect(page).not.toContain('Always here')
  })

  it('the pinned questions are read with nothing marked seen', () => {
    expect(page).toContain("fetch('/api/conversations/twin?only=pinned')")
    const route = read('src/app/api/conversations/twin/route.ts')
    expect(route).toContain("if (request.nextUrl.searchParams.get('only') === 'pinned') return pinnedOnly(caller, request)")
    const only = route.slice(route.indexOf('async function pinnedOnly'), route.indexOf('async function pinnedOnly') + 2000)
    expect(only).not.toContain('markNoticesSeen')
  })
})

describe('the pinned questions are answered from the record', () => {
  it('“Who is coming free?” is answered as who rolls off', () => {
    expect(readAsk('Who is coming free?')).toEqual({ kind: 'ROLLOFF' })
  })

  it('“What am I paying across suppliers?” is answered as spend by supplier', () => {
    expect(readAsk('What am I paying across suppliers?')).toEqual({ kind: 'SPEND' })
  })

  it('“Who matches this job?” opens Jobs, where each job’s matches are with their reasons', async () => {
    const a = await respond('Who matches this job?', readers({}), { env: {}, now: NOW, companyKind: 'CLIENT', party: 'CLIENT', permissions: HIRING_MANAGER.permissions })
    expect(a).toEqual({
      kind: 'TEXT',
      says: 'Who matches a job is on that job’s own page, each match with its reasons. Open Jobs and pick the job.',
      links: [{ label: 'Open Jobs', href: '/dashboard/requisitions' }],
    })
  })

  it('“What is on hold, and why?” names each held start with its paper and each held invoice receipt with what to do', async () => {
    const queue: QueueRead = {
      total: 1,
      items: [{ type: 'START_HELD', title: 'Ingrid Sørensen — through Teleworld', whose: 'Ingrid Sørensen', subtitle: 'Ingrid Sørensen cannot start without an I-9 (Form I-9).', entityId: 'c1', dueDate: '2026-11-10', actionUrl: '/dashboard/placements/c1' }],
    }
    const a = await respond('What is on hold, and why?', readers({
      told: async () => ({ told: [{ invoiceId: 'inv-442', number: 'PR-2026-0442', supplier: 'Pinnacle Resourcing', hoursBilled: 41.5, hoursAccepted: 40 }], stale: [] }),
    }), { env: {}, now: NOW, companyKind: 'CLIENT', party: 'CLIENT', permissions: AP_CLERK.permissions, needs: async () => queue })
    expect(a.kind).toBe('LIST')
    expect(a.says).toContain('One start is on hold: Ingrid Sørensen cannot start on Nov 10 without an I-9.')
    expect(a.says).toContain('PR-2026-0442 bills 41.5 hours against 40 approved. Ask Pinnacle Resourcing to correct it, or record an exception with a reason on its page.')
    expect(a.says).toMatch(/Checked just now\.$/)
  })

  it('nothing on hold is said as nothing, in one sentence', async () => {
    const a = await respond('What is on hold, and why?', readers({ told: async () => ({ told: [], stale: [] }) }),
      { env: {}, now: NOW, companyKind: 'CLIENT', party: 'CLIENT', permissions: AP_CLERK.permissions, needs: async () => ({ total: 0, items: [] }) })
    expect(a.says).toBe('Nothing is on hold. Checked just now.')
  })
})

describe('what the firm made, by client, office or consultant, is Profitability’s own cut', () => {
  const CUT = {
    periodSays: 'October to December 2026',
    lines: [
      { label: 'Northbend Athletic', placements: 3, currency: 'USD', billedCents: 4_100_000, marginCents: 940_000, marginPct: 22.9, blankedBecause: null },
      { label: 'Cavanaugh Glassworks', placements: 1, currency: 'USD', billedCents: 1_000_000, marginCents: 150_000, marginPct: 15, blankedBecause: null },
    ],
    total: { label: 'Your firm', placements: 4, currency: 'USD', billedCents: 5_100_000, marginCents: 1_090_000, marginPct: 21.4, blankedBecause: null },
    says: '$10,900.00 on $51,000.00 billed, 21.4%.',
  }

  it('“Which client made us the most this quarter?” reads Profitability’s cut by client for the quarter and adds nothing up', async () => {
    const marginCut = vi.fn(async () => ({ ok: true as const, ...CUT }))
    const a = await respond('Which client made us the most this quarter?', readers({ marginCut }),
      { env: {}, now: NOW, companyKind: 'VENDOR', party: 'FIRM', permissions: ['*'] })
    expect(marginCut).toHaveBeenCalledWith('client', 'quarter')
    expect(a.kind).toBe('LIST')
    expect(a.says).toBe('Northbend Athletic made you the most in October to December 2026: $9,400.00 on $41,000.00 billed, 22.9%. Your firm: $10,900.00 on $51,000.00 billed, 21.4%. Before admin cost and commission. Checked just now.')
  })

  it('a margin by office this month asks for the office cut and the month', async () => {
    const marginCut = vi.fn(async () => ({ ok: true as const, ...CUT, lines: [] }))
    await respond('Margin by office this month', readers({ marginCut }), { env: {}, now: NOW, companyKind: 'VENDOR', party: 'FIRM', permissions: ['*'] })
    expect(marginCut).toHaveBeenCalledWith('office', 'month')
  })

  it('a cut by recruiter is refused in one sentence, without reading anything', async () => {
    const a = await respond('Which recruiter made us the most this month?', readers({}), { env: {}, now: NOW, companyKind: 'VENDOR', party: 'FIRM', permissions: ['*'] })
    expect(a.kind).toBe('TEXT')
    expect(a.says).toBe('No placement records who recruited it, so Etyme cannot say what each recruiter made; Profitability cuts by consultant, office or client.')
    expect(a.says.split(/(?<=\.)\s/)).toHaveLength(1)
  })

  it('a client asking which client made the most is refused, because a margin is a supplier’s own figure', async () => {
    const a = await respond('Which client made us the most this quarter?', readers({}), { env: {}, now: NOW, companyKind: 'CLIENT', party: 'CLIENT', permissions: ['*'] })
    expect(a.says).toMatch(/^Etyme never shows a firm’s margin to anybody else/)
  })

  it('the chat reads the cut through Profitability’s own route, never a sum of its own', () => {
    const r = read('src/app/api/conversations/twin/read.ts')
    expect(r).toContain('url.search = `?by=cut&cut=${cut}&period=${period}`')
    expect(r).toContain('await profitabilityRoute(new NextRequest(url, { headers: request.headers }))')
  })
})

describe('Today’s decision rows: Yes, Not now, and Yes to all where every row is one press', () => {
  const card = (key: string, act: boolean): QueueCard => ({
    key, type: 'TIMESHEET_APPROVAL', title: `${key}.`, fact: '', href: '/dashboard/timesheets',
    act: act ? { label: 'Approve timesheet', url: `/api/timesheets/${key}/approve`, body: {}, done: 'Approved.' } : null,
  })

  it('Yes to all is offered over two or more rows that are each one press with nothing to type', () => {
    expect(batchOf([card('a', true), card('b', true)])?.map((c) => c.key)).toEqual(['a', 'b'])
    expect(batchLabel(2)).toBe('Yes to all 2')
  })

  it('Yes to all is not offered where a row needs a reference, a reason or a page of its own', () => {
    expect(batchOf([card('a', true), card('b', false)])).toBeNull()
  })

  it('Yes to all is not offered over a single row', () => {
    expect(batchOf([card('a', true)])).toBeNull()
    expect(batchOf([card('a', true), card('b', true)], new Set(['b']))).toBeNull()
  })

  it('a receipt to pay and a week flagged over its hours each stay a single row that opens its page', () => {
    const { rows } = todayRows({
      data: {
        total: 2,
        decisions: [
          { type: 'INVOICE_RECEIPT_TO_PAY', title: 'Pay invoice receipt — Pinnacle Resourcing', subtitle: 'Invoice PR-2026-0441 · $4,000.00', entityId: 'inv-441', actionUrl: '/dashboard/invoices/inv-441' },
          { type: 'TIMESHEET_APPROVAL', title: 'Approve timesheet — Omar Haddad', subtitle: 'Oct 25–31 · 45h', entityId: 'ts-1', flag: 'Over the role’s 40 hours.' },
        ],
      },
    })
    expect(rows.map((r) => r.act)).toEqual([null, null])
    expect(batchOf(rows)).toBeNull()
  })

  it('a question from Ask Etyme on Today opens the chat, where its card asks for any field it needs', () => {
    const { rows } = todayRows({
      data: { total: 1, decisions: [{ type: 'TWIN_QUESTION', title: 'Send this bill', subtitle: 'INV-1042 · asked today', entityId: 'q1', actionUrl: '/dashboard/conversations/etyme' }] },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ act: null, href: '/dashboard/conversations/etyme', open: OPEN_IN_ASK_ETYME })
  })

  it('the rows read the one decisions list the number on Ask Etyme counts, and each Yes goes through its own route', () => {
    const rows = read('src/components/twin-conversation/decision-rows.tsx')
    expect(rows).toContain("fetch('/api/decisions')")
    // The press takes the card's own act (its Yes) unless a No is chosen, and posts it to that act's route.
    expect(rows).toContain('chosen: QueueAct | null = card.act')
    expect(rows).toContain('fetch(act.url, { method: \'POST\'')
  })

  it('what a batch did is said as how many were done and the first that was not', () => {
    expect(batchSays([{ ok: true, says: 'Approved.' }, { ok: true, says: 'Approved.' }])).toBe('2 of 2 done, each recorded under your name.')
    expect(batchSays([{ ok: true, says: 'Approved.' }, { ok: false, says: 'That week was already approved.' }]))
      .toBe('1 of 2 done, each recorded under your name. That week was already approved.')
  })
})
