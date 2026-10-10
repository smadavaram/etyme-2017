import { describe, it, expect } from 'vitest'
import { topDown, signersOf, turnOf, signedBy, type LadderRung } from '@/app/api/timesheets/chain-turn'
import {
  LINK_LIFETIME_DAYS, linkExpiresAt, linkVerdict, checkSendBack, checkEvidence,
  mayActForTheClient, scopeFor, mayReadEvidence, evidenceReadLog, approvedByWords,
  letterToApprover, signaturesWritten, type LinkRow, type WeekNow,
} from '@/app/api/timesheets/approval-by-email'

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
    expect(v).toEqual({ ok: false, says: 'Only Helena Marsh, or the timesheet desk at a supplier on this placement, can attach the client’s approval.' })
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
