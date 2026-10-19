import { describe, it, expect } from 'vitest'
import { topDown, signersOf, turnOf, signedBy, type LadderRung } from '@/app/api/timesheets/chain-turn'
import {
  LINK_LIFETIME_DAYS, linkExpiresAt, linkVerdict, checkSendBack, checkEvidence,
  mayActForTheClient, scopeFor, mayReadEvidence, evidenceReadLog, approvedByWords,
  letterToApprover, signaturesWritten, type LinkRow, type WeekNow,
} from '@/app/api/timesheets/approval-by-email'
import {
  billLetter, billNotice, billLine, builtFrom, billLinkToken, readBillLinkToken, billLinkExpiresAt,
  billLinkOpen, billPageView, billSentSays, lastFour, BILL_LINK_DAYS_AFTER_DUE,
  type BillFacts, type BillDelivery, type BillPageInput,
} from '@/lib/notify/bill-letter'
import { sign } from '@/lib/signed-link'

/**
 * A client may approve by email, and the proof travels down the chain.
 * Founder, 2026-09-30.
 *
 * Northbend Athletic ← Computer Systems ← Techpeple, Helena Marsh: the
 * chain `signed-week-travels-down` walks. Dana Whitfield is Northbend's
 * approver.
 */

const TECHPEPLE_RUNG: LadderRung = {
  sellContractId: 'techpeple-rung', companyId: 'techpeple', clientCompanyId: 'cs',
  endClientCompanyId: 'northbend', supplierSellContractId: null,
}
const CS_RUNG: LadderRung = {
  sellContractId: 'cs-rung', companyId: 'cs', clientCompanyId: 'northbend',
  endClientCompanyId: null, supplierSellContractId: 'techpeple-rung',
}
const LADDER = topDown([TECHPEPLE_RUNG, CS_RUNG])
const HELENA = { personId: 'helena', personName: 'Helena Marsh' }

const NOW = new Date('2026-10-02T15:00:00Z')
const SENT = new Date('2026-09-28T14:00:00Z')

function link(over: Partial<LinkRow> = {}): LinkRow {
  return { sentAt: SENT, expiresAt: linkExpiresAt(SENT), usedAt: null, outcome: null, approverName: 'Dana Whitfield', ...over }
}
function week(over: Partial<WeekNow> = {}): WeekNow {
  return { status: 'SUBMITTED', submittedAt: new Date('2026-09-28T09:00:00Z'), clientApprovedAt: null, personName: 'Helena Marsh', ...over }
}
const NAMES = { clientName: 'Northbend Athletic', senderFirm: 'Techpeple' }

describe('the one-time link to the client’s approver', () => {
  it('a link to approve a week runs out after seven days, the widest window a company may give its approvers', () => {
    expect(LINK_LIFETIME_DAYS).toBe(7)
    expect(linkExpiresAt(SENT).toISOString()).toBe('2026-10-05T14:00:00.000Z')
  })

  it('an unused link on a week still waiting for approval is open', () => {
    expect(linkVerdict(link(), week(), NOW, NAMES)).toEqual({ open: true })
  })

  it('a link that approved the week is refused in a sentence naming who approved it and when', () => {
    const v = linkVerdict(link({ usedAt: new Date('2026-10-01T10:00:00Z'), outcome: 'APPROVED' }), week({ status: 'APPROVED' }), NOW, NAMES)
    expect(v).toEqual({ open: false, code: 'USED', says: 'Dana Whitfield approved this week on Oct 1. Nothing else is needed here.' })
  })

  it('a link that sent the week back is refused in a sentence, and a new filing brings a new link', () => {
    const v = linkVerdict(link({ usedAt: new Date('2026-10-01T10:00:00Z'), outcome: 'SENT_BACK' }), week({ status: 'OPEN' }), NOW, NAMES)
    expect(v.open).toBe(false)
    if (!v.open) {
      expect(v.code).toBe('SENT_BACK')
      expect(v.says).toBe('This week was sent back on Oct 1. If Helena Marsh files it again, a new link comes with it.')
    }
  })

  it('a link is refused once the client has approved the week some other way', () => {
    const v = linkVerdict(link(), week({ status: 'APPROVED', clientApprovedAt: new Date('2026-09-30T00:00:00Z') }), NOW, NAMES)
    expect(v.open).toBe(false)
    if (!v.open) expect(v.says).toBe('Northbend Athletic has already approved this week, so this link is no longer needed.')
  })

  it('a link made before the worker sent the week again is refused, because it may not show what she filed', () => {
    const v = linkVerdict(link(), week({ submittedAt: new Date('2026-09-30T08:00:00Z') }), NOW, NAMES)
    expect(v.open).toBe(false)
    if (!v.open) {
      expect(v.code).toBe('FILED_AGAIN')
      expect(v.says).toContain('Ask Techpeple for a new link.')
    }
  })

  it('a link on a week the worker has back to correct is refused', () => {
    const v = linkVerdict(link(), week({ status: 'OPEN', submittedAt: new Date('2026-09-27T08:00:00Z') }), NOW, NAMES)
    expect(v.open).toBe(false)
    if (!v.open) expect(v.code).toBe('NOT_WAITING')
  })

  it('an expired link is refused in a sentence saying the day it ran out and whom to ask', () => {
    const v = linkVerdict(link(), week(), new Date('2026-10-06T00:00:00Z'), NAMES)
    expect(v).toEqual({ open: false, code: 'EXPIRED', says: 'This link ran out on Oct 5. Ask Techpeple for a new one.' })
  })

  it('a used link says it was used, not that it expired, when both are true', () => {
    const v = linkVerdict(link({ usedAt: new Date('2026-10-01T10:00:00Z'), outcome: 'APPROVED' }), week({ status: 'APPROVED' }), new Date('2026-12-01T00:00:00Z'), NAMES)
    expect(v.open === false && v.code).toBe('USED')
  })
})

describe('sending a week back from the link', () => {
  it('sending a week back by email needs a reason from the list', () => {
    expect(checkSendBack({})).toEqual({ ok: false, says: 'Pick why you are sending it back, so the worker knows what to fix.' })
    expect(checkSendBack({ code: 'BECAUSE' }).ok).toBe(false)
    expect(checkSendBack({ code: 'HOURS_WRONG' })).toEqual({ ok: true, code: 'HOURS_WRONG', note: null, says: 'The hours are not right' })
  })

  it('"something else" needs a note, and the note rides beside the reason', () => {
    expect(checkSendBack({ code: 'OTHER', note: '  ' }).ok).toBe(false)
    expect(checkSendBack({ code: 'OTHER', note: 'Wrong project code' })).toEqual({
      ok: true, code: 'OTHER', note: 'Wrong project code', says: 'Something else: Wrong project code',
    })
  })
})

describe('evidence of an approval given outside Etyme', () => {
  const W = { periodEnd: new Date('2026-09-26T00:00:00Z') }
  const good = {
    approverName: 'Dana Whitfield', approverEmail: 'Dana@Northbend.example', kind: 'EMAIL',
    approvedOn: new Date('2026-10-02T00:00:00Z'), file: { name: 'approval.eml', size: 4096 },
  }

  it('evidence without the approver’s name or email address is refused in a sentence', () => {
    const neither = checkEvidence({ ...good, approverName: '', approverEmail: '' }, W, NOW, 'Northbend Athletic')
    expect(neither).toEqual({
      ok: false, field: 'approverName',
      says: 'Name the person at Northbend Athletic who approved this week, and give their email address. An approval nobody can be traced to is not an approval.',
    })
    const noName = checkEvidence({ ...good, approverName: '  ' }, W, NOW, 'Northbend Athletic')
    expect(noName.ok === false && noName.field).toBe('approverName')
    const noEmail = checkEvidence({ ...good, approverEmail: undefined }, W, NOW, 'Northbend Athletic')
    expect(noEmail.ok === false && noEmail.says).toBe('Give Dana Whitfield’s email address, so anybody reading this can see who said yes.')
    const badEmail = checkEvidence({ ...good, approverEmail: 'dana@' }, W, NOW, 'Northbend Athletic')
    expect(badEmail.ok === false && badEmail.field).toBe('approverEmail')
  })

  it('evidence with a named approver and an address is accepted, the address kept in lower case', () => {
    const v = checkEvidence(good, W, NOW, 'Northbend Athletic')
    expect(v).toMatchObject({ ok: true, approverName: 'Dana Whitfield', approverEmail: 'dana@northbend.example', kind: 'EMAIL', says: 'saved email, 4KB.' })
  })

  it('evidence dated before the week ended, or in the future, is refused', () => {
    const early = checkEvidence({ ...good, approvedOn: new Date('2026-09-25T00:00:00Z') }, W, NOW, 'Northbend Athletic')
    expect(early.ok === false && early.says).toBe('That day is before the week ended. Nobody can approve hours before they are worked.')
    const later = checkEvidence({ ...good, approvedOn: new Date('2026-10-03T00:00:00Z') }, W, NOW, 'Northbend Athletic')
    expect(later.ok === false && later.field).toBe('approvedOn')
  })

  it('evidence is an email, a PDF, or an export from the client’s own system, and nothing else', () => {
    expect(checkEvidence({ ...good, kind: 'PDF', file: { name: 'approval.pdf', size: 120_000 } }, W, NOW, 'Northbend Athletic').ok).toBe(true)
    expect(checkEvidence({ ...good, kind: 'EXPORT', file: { name: 'hours.xlsx', size: 20_000 } }, W, NOW, 'Northbend Athletic').ok).toBe(true)
    expect(checkEvidence({ ...good, kind: 'EMAIL', file: null, pastedText: 'Approved — Dana' }, W, NOW, 'Northbend Athletic')).toMatchObject({ ok: true, says: 'pasted email text.' })
    const noKind = checkEvidence({ ...good, kind: 'SCREENSHOT' }, W, NOW, 'Northbend Athletic')
    expect(noKind.ok === false && noKind.field).toBe('kind')
    const nothing = checkEvidence({ ...good, file: null }, W, NOW, 'Northbend Athletic')
    expect(nothing.ok === false && nothing.field).toBe('file')
    const exe = checkEvidence({ ...good, file: { name: 'approve.exe', size: 10 } }, W, NOW, 'Northbend Athletic')
    expect(exe.ok).toBe(false)
    const huge = checkEvidence({ ...good, file: { name: 'scan.pdf', size: 11 * 1024 * 1024 } }, W, NOW, 'Northbend Athletic')
    expect(huge.ok === false && huge.says).toContain('ten megabytes is the limit')
  })
})

describe('who may send the link or attach the evidence', () => {
  const desk = (companyId: string, permissions: string[]) => ({ personId: `p-${companyId}`, companyId, permissions })

  it('the worker may attach evidence to her own week', () => {
    expect(mayActForTheClient({ personId: 'helena', companyId: 'techpeple', permissions: [] }, HELENA, LADDER, 'Northbend Athletic'))
      .toEqual({ ok: true, as: 'WORKER' })
  })

  it('the timesheet desk at any supplier on the chain may attach evidence', () => {
    expect(mayActForTheClient(desk('techpeple', ['timesheets.approve']), HELENA, LADDER, 'Northbend Athletic')).toEqual({ ok: true, as: 'SUPPLIER_DESK' })
    expect(mayActForTheClient(desk('cs', ['timesheets.approve']), HELENA, LADDER, 'Northbend Athletic')).toEqual({ ok: true, as: 'SUPPLIER_DESK' })
  })

  it('a stranger cannot attach, and is told who can', () => {
    const v = mayActForTheClient(desk('elsewhere', ['*']), HELENA, LADDER, 'Northbend Athletic')
    expect(v).toEqual({ ok: false, says: 'Only Helena Marsh, or whoever handles timesheets at a supplier on this placement, can attach the client’s approval.' })
  })

  it('the client’s own desk is told to approve in Etyme instead', () => {
    const v = mayActForTheClient(desk('northbend', ['timesheets.approve']), HELENA, LADDER, 'Northbend Athletic')
    expect(v).toEqual({ ok: false, says: 'Northbend Athletic approves this week in Etyme itself. Evidence is for an approval given outside it.' })
  })

  it('a supplier seat without the timesheet desk is refused, naming the desks that can', () => {
    const v = mayActForTheClient({ ...desk('techpeple', ['submissions.create']), companyKind: 'VENDOR', companyName: 'Techpeple' }, HELENA, LADDER, 'Northbend Athletic')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toMatch(/^Attaching a client’s approval is done by .* at Techpeple/)
  })
})

describe('which contracts the approval applies to', () => {
  it('the approval applies to every contract on the chain unless the sender picks fewer', () => {
    expect(scopeFor(undefined, LADDER, 'Northbend Athletic')).toEqual({ ok: true, contracts: ['cs-rung', 'techpeple-rung'] })
    expect(scopeFor(['cs-rung'], LADDER, 'Northbend Athletic')).toEqual({ ok: true, contracts: ['cs-rung'] })
  })

  it('the client’s own contract is always among them, because that is where its signature is given', () => {
    expect(scopeFor(['techpeple-rung'], LADDER, 'Northbend Athletic')).toEqual({
      ok: false, says: 'The approval is given on Northbend Athletic’s own contract, so that one has to be included.',
    })
  })

  it('a contract not on the week’s chain, or none at all, is refused', () => {
    expect(scopeFor(['cs-rung', 'somebody-else'], LADDER, 'Northbend Athletic').ok).toBe(false)
    expect(scopeFor([], LADDER, 'Northbend Athletic').ok).toBe(false)
  })
})

describe('who reads the evidence', () => {
  const ALL = ['cs-rung', 'techpeple-rung']

  it('every rung the approval applies to may read the evidence', () => {
    expect(mayReadEvidence({ personId: 'x', companyId: 'cs' }, HELENA, ALL, LADDER)).toEqual({ ok: true, contracts: ['cs-rung', 'techpeple-rung'] })
    expect(mayReadEvidence({ personId: 'x', companyId: 'techpeple' }, HELENA, ALL, LADDER)).toEqual({ ok: true, contracts: ['techpeple-rung'] })
    expect(mayReadEvidence({ personId: 'helena', companyId: 'techpeple' }, HELENA, ALL, LADDER)).toEqual({ ok: true, contracts: ALL })
  })

  it('the client reads only its own contract in the scope, never a sub-vendor’s', () => {
    expect(mayReadEvidence({ personId: 'dana', companyId: 'northbend' }, HELENA, ALL, LADDER)).toEqual({ ok: true, contracts: ['cs-rung'] })
  })

  it('a rung left out of the scope cannot read it, and a stranger cannot either', () => {
    expect(mayReadEvidence({ personId: 'x', companyId: 'techpeple' }, HELENA, ['cs-rung'], LADDER)).toEqual({
      ok: false, says: 'This approval was not attached to a contract your company is on.',
    })
    expect(mayReadEvidence({ personId: 'x', companyId: 'elsewhere' }, HELENA, ALL, LADDER).ok).toBe(false)
  })

  it('every read of the evidence writes an access log row about the worker, refusals included', () => {
    const reader = { personId: 'x', companyId: 'elsewhere' }
    const v = mayReadEvidence(reader, HELENA, ALL, LADDER)
    expect(evidenceReadLog(reader, HELENA, v)).toEqual({
      subjectId: 'helena', actorPersonId: 'x', actorCompanyId: 'elsewhere',
      action: 'APPROVAL_EVIDENCE_VIEW', allowed: false,
      reason: 'This approval was not attached to a contract your company is on.',
    })
    const ok = mayReadEvidence({ personId: 'y', companyId: 'cs' }, HELENA, ALL, LADDER)
    expect(evidenceReadLog({ personId: 'y', companyId: 'cs' }, HELENA, ok)).toMatchObject({ allowed: true, reason: null })
  })
})

describe('what the screens and the letter say', () => {
  it('a week approved with evidence says "Approved by email", with the approver, the day and the evidence', () => {
    expect(approvedByWords({ approverName: 'Dana Whitfield', on: new Date('2026-10-02T12:00:00Z'), how: 'EVIDENCE', now: NOW }))
      .toBe('Approved by email: Dana Whitfield, Oct 2 — evidence attached')
  })

  it('a week approved from the link says "Approved by email", never that the client signed in Etyme', () => {
    const words = approvedByWords({ approverName: 'Dana Whitfield', on: new Date('2026-10-02T12:00:00Z'), how: 'LINK', now: NOW })
    expect(words).toBe('Approved by email: Dana Whitfield, Oct 2')
    expect(words).not.toMatch(/signed in|in Etyme/i)
  })

  it('a day in another year says the year', () => {
    expect(approvedByWords({ approverName: 'Dana Whitfield', on: new Date('2025-12-30T12:00:00Z'), how: 'LINK', now: NOW }))
      .toBe('Approved by email: Dana Whitfield, Dec 30, 2025')
  })

  it('the letter to the approver says whose hours, how many, and when the link runs out, and never a rate', () => {
    const l = letterToApprover({
      approverName: 'Dana Whitfield', personName: 'Helena Marsh', clientName: 'Northbend Athletic',
      senderName: 'Priya Raman', senderFirm: 'Techpeple', period: 'Sep 20 – Sep 26', hours: 40,
      url: 'https://etyme.example/approve-week/abc', expiresAt: linkExpiresAt(SENT), now: NOW,
    })
    expect(l.subject).toBe('Helena Marsh’s hours for Sep 20 – Sep 26: approve or send back')
    expect(l.body).toContain('Helena Marsh worked 40 hours for Northbend Athletic')
    expect(l.body).toContain('You do not need an account')
    expect(l.body).toContain('runs out on Oct 5')
    expect(l.body).not.toMatch(/\$|rate/i)
  })
})

describe('the chain below the approval', () => {
  const signers = signersOf(LADDER)

  it('an approval by email is the client’s signature only', () => {
    expect(signaturesWritten(signers).map((s) => `${s.companyId}:${s.role}`)).toEqual(['northbend:CLIENT_APPROVAL'])
  })

  it('once the client’s approval stands, the next rung accepts in its turn and the employer still waits', () => {
    const live = signaturesWritten(signers).map((s) => ({ companyId: s.companyId, role: s.role }))
    const w = { clientApprovedAt: new Date('2026-10-02T12:00:00Z'), employerAcceptedAt: null }
    const signed = (s: (typeof signers)[number]) => signedBy(s, w, live)
    const cs = turnOf(signers, 'cs', signed, (id) => id)
    expect(cs.ok && cs.signer.role).toBe('PASS_THROUGH')
    const techpeple = turnOf(signers, 'techpeple', signed, (id) => id)
    expect(techpeple).toEqual({ ok: false, code: 'NOT_YOUR_TURN', says: 'cs has not accepted this week yet. It comes to you once they have.' })
  })
})

// ── The bill, reaching the firm that pays it (etyme-conversation, 2026-10-19) ──
//
// Tapin's first day: a supplier whose client is not on Etyme sent a bill,
// and nothing reached the client. The same link pattern as the week:
// one signed link, no account, every open logged.

const BILL: BillFacts = {
  supplierName: 'Tapin', clientName: 'Northbend Athletic', number: 'IN-1042',
  people: ['Helena Marsh', 'Helena Marsh'],
  periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-31T00:00:00Z'),
  hours: 80, total: 11600, currency: 'USD', dueAt: new Date('2026-12-15T00:00:00Z'),
  weeks: 2, signedBy: 'Northbend Athletic', allSigned: true, expenses: 0, milestones: 0,
}
const BILL_URL = 'https://etyme.example/answer/bill/abc.def'

function delivery(over: Partial<BillDelivery> = {}): BillDelivery {
  return {
    invoiceId: 'inv', number: 'IN-1042', clientName: 'Larkspur Freight', onEtyme: false, resend: false,
    at: '2026-10-19T15:00:00.000Z', byPersonId: 'ana', why: null,
    to: [{ address: 'dana@acme.test', via: 'EMAIL', state: 'SENT', note: 'No Teams channel set up, so email instead' }],
    ...over,
  }
}

describe('a bill, sent to the firm that pays it', () => {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length

  it('the bill letter opens on the bill itself: whose, which, for whom, which month, how many hours, how much and when it is due', () => {
    expect(billLine(BILL)).toBe('Tapin’s bill IN-1042 for Helena Marsh, October 2026: 80 hours, $11,600.00, due Dec 15, 2026')
    const l = billLetter({ facts: BILL, contactName: 'Dana Whitfield', url: BILL_URL, expiresAt: billLinkExpiresAt(BILL.dueAt), sender: { name: 'Ana Ruiz', email: 'ana@tapin.test' } })
    expect(l.subject).toBe(billLine(BILL))
    expect(l.body.split('\n\n')[0]).toBe('Dana,')
    expect(l.body.split('\n\n')[1]).toBe(`${billLine(BILL)}.`)
  })

  it('the bill letter says the weeks it is built from and who signed them, gives one link, says why it arrived, and stays between 60 and 120 words with no pitch', () => {
    const l = billLetter({ facts: BILL, contactName: 'Dana Whitfield', url: BILL_URL, expiresAt: billLinkExpiresAt(BILL.dueAt), sender: { name: 'Ana Ruiz', email: 'ana@tapin.test' } })
    expect(l.body).toContain('It is built from 2 weeks Northbend Athletic signed.')
    expect(l.body.match(/https?:\/\//g)).toHaveLength(1)
    expect(l.body).toContain('You do not need an account. The link works until Mar 15, 2027.')
    expect(l.body).toContain('Tapin recorded you as the person at Northbend Athletic who receives its bills. If that is wrong, tell Ana Ruiz at Tapin (ana@tapin.test).')
    expect(words(l.body)).toBeGreaterThanOrEqual(60)
    expect(words(l.body)).toBeLessThanOrEqual(120)
    expect(l.body).not.toMatch(/\bAI\b|platform|powerful|seamless|sorry|apolog/i)
  })

  it('a week nobody signed is never called signed, and expenses and milestones are counted as what they are', () => {
    expect(builtFrom({ weeks: 2, signedBy: 'Northbend Athletic', allSigned: false, expenses: 0, milestones: 0 })).toBe('It is built from 2 weeks of hours.')
    expect(builtFrom({ weeks: 1, signedBy: null, allSigned: true, expenses: 1, milestones: 0 })).toBe('It is built from 1 signed week and 1 approved expense.')
    expect(builtFrom({ weeks: 0, signedBy: null, expenses: 0, milestones: 2 })).toBe('It is built from 2 accepted milestones.')
  })

  it('the notice to a client on Etyme opens the bill inside Etyme and carries no link a stranger could open', () => {
    const n = billNotice(BILL)
    expect(n.title).toBe('Tapin’s bill IN-1042: $11,600.00, due Dec 15, 2026')
    expect(n.body).toContain('It is built from 2 weeks Northbend Athletic signed.')
    expect(n.body).not.toMatch(/https?:\/\//)
  })

  it('the bill link names one bill and one address, and cannot be replayed as any other link', () => {
    process.env.NEXTAUTH_SECRET = 'test-secret-for-bill-links'
    const t = billLinkToken('inv_1', 'Dana@Acme.test')
    expect(readBillLinkToken(t)).toEqual({ invoiceId: 'inv_1', to: 'dana@acme.test' })
    expect(readBillLinkToken(sign('bench-invite', ['inv_1', 'dana@acme.test']))).toBeNull()
    expect(readBillLinkToken(t.slice(0, -2) + 'xx')).toBeNull()
    expect(() => billLinkToken('inv_1', 'odd:address@acme.test')).toThrow()
  })

  it('the bill link dies 90 days after the due date', () => {
    expect(BILL_LINK_DAYS_AFTER_DUE).toBe(90)
    const due = new Date('2026-12-15T00:00:00Z')
    expect(billLinkExpiresAt(due).toISOString()).toBe('2027-03-15T00:00:00.000Z')
    expect(billLinkOpen(due, new Date('2027-03-14T23:59:00Z'))).toBe(true)
    expect(billLinkOpen(due, new Date('2027-03-15T00:00:00Z'))).toBe(false)
  })

  it('the bill page shows the rate on this bill on each line and nothing of any rung below, and where to pay with the last four digits only', () => {
    const input: BillPageInput & Record<string, unknown> = {
      supplierName: 'Tapin', clientName: 'Larkspur Freight', clientOnEtyme: false, invoiceId: 'inv', number: 'IN-1042',
      status: 'SUBMITTED', total: 5800, paid: 0, currency: 'USD',
      periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-31T00:00:00Z'), dueAt: new Date('2026-12-15T00:00:00Z'),
      lines: [{ hours: 40, rateCents: 14500, amountCents: 580000, description: null, personName: 'Helena Marsh', week: { start: new Date('2026-10-04T00:00:00Z'), end: new Date('2026-10-10T00:00:00Z') }, expense: false, milestone: false, payRateCents: 9100, subVendor: 'Hidden Sub LLC' } as any],
      weeks: [{ person: 'Helena Marsh', start: new Date('2026-10-04T00:00:00Z'), end: new Date('2026-10-10T00:00:00Z'), hours: 40, signedAt: new Date('2026-10-12T00:00:00Z'), signer: 'Dana Whitfield', byEmail: true }],
      signedBy: 'Larkspur Freight',
      remit: { legalName: 'Tapin LLC', paymentMethod: 'ACH', bankName: 'First Harbor Bank', accountLast4: '000123454421' },
      buyRateCents: 9100,
    }
    const v = billPageView(input, NOW)
    expect(v.lines).toEqual([{ kind: 'HOURS', person: 'Helena Marsh', what: 'Oct 4 – Oct 10, 2026', hours: 40, rate: '$145/hr', amount: '$5,800.00' }])
    expect(v.weeks[0].signed).toBe('Approved by email: Dana Whitfield, Oct 12, 2026')
    expect(v.remit).toEqual({ payTo: 'Tapin LLC', method: 'ACH bank transfer', bank: 'First Harbor Bank', account: 'ending 4421' })
    const shown = JSON.stringify(v)
    expect(shown).not.toContain('91')
    expect(shown).not.toContain('Hidden Sub')
    expect(shown).not.toContain('000123')
    expect(v.recordOnEtyme).toBeNull()
    expect(lastFour('12-34-5678')).toBe('5678')
  })

  it('a payer on Etyme is offered "Record on Etyme" on the bill page, opening the bill inside Etyme', () => {
    const v = billPageView({
      supplierName: 'Brightmoor', clientName: 'Northbend Athletic', clientOnEtyme: true, invoiceId: 'inv_9', number: 'IN-9',
      status: 'PARTIALLY_PAID', total: 1000, paid: 400, currency: 'USD',
      periodStart: new Date('2026-10-04T00:00:00Z'), periodEnd: new Date('2026-10-17T00:00:00Z'), dueAt: new Date('2026-11-15T00:00:00Z'),
      lines: [], weeks: [], signedBy: null, remit: null,
    }, NOW)
    expect(v.recordOnEtyme).toBe('/dashboard/invoices/inv_9')
    expect(v.status).toBe('Part paid: $400.00 of $1,000.00')
    expect(v.period).toBe('Oct 4 – Oct 17, 2026')
  })

  it('the Bills page reads who a bill was sent to and when, and never says sent where the email did not leave', () => {
    const now = new Date('2026-10-20T12:00:00Z')
    expect(billSentSays([delivery()], now)).toBe('Sent to dana@acme.test on Oct 19')
    expect(billSentSays([delivery({ onEtyme: true, clientName: 'Northbend Athletic', to: [{ address: 'ap@nb.test', via: 'ETYME', state: 'SENT', note: 'Shown in the app', role: 'AP Clerk' }] })], now))
      .toBe('Sent on Etyme to Northbend Athletic’s AP Clerk on Oct 19')
    expect(billSentSays([delivery({ to: [{ address: 'dana@acme.example', via: 'EMAIL', state: 'DEMO_SKIPPED', note: 'demo address, nothing sent' }] })], now))
      .toBe('Not emailed to dana@acme.example: it is a demo address, so nothing left')
    expect(billSentSays([delivery({ to: [], why: 'Larkspur Freight is not on Etyme and no address is recorded for it. Record the person there who receives bills, then send it again.' })], now))
      .toBe('Not sent: Larkspur Freight is not on Etyme and no address is recorded for it. Record the person there who receives bills, then send it again.')
    expect(billSentSays([delivery(), delivery({ resend: true, at: '2026-10-21T09:00:00.000Z' })], new Date('2026-10-22T00:00:00Z')))
      .toBe('Sent again to dana@acme.test on Oct 21; first sent Oct 19')
    expect(billSentSays([], now)).toBeNull()
  })
})
