import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reasonAsked, answersFor, unanswered } from '@/lib/award/reason-asked'
import { approvalAmountSays } from '@/app/dashboard/program/approval-words'
import { notSignableSays } from '@/app/api/timesheets/not-signable'
import { checkStatedTerms, listingTerms } from '@/lib/award/hire-terms'
import { listingTermsFrom } from '@/lib/bench-filter'
import { sendOnActor, sendOnDoor, messageDoor, type DoorRow } from '@/app/api/submissions/row-doors'
import { whyNotSendOn } from '@/lib/forwarding'
import { whoMayOpen } from '@/lib/threads'
import { sendOnRefusalSays } from '@/app/dashboard/submissions/send-on-words'

/**
 * The screen walk of 2026-11-02 (every form of every party, Save pressed
 * on the seeded world), demand's rows of it:
 *
 *   1. Today → Approvals: an over-hours week had no box for its reason,
 *      the refused week dropped off the list, and 45 hours read "$45.00".
 *   2. Roll off was drawn for a client's program manager, whom the route
 *      always refuses.
 *   3. Pressing Approve on a week already signed answered "Timesheet is
 *      APPROVED, can only approve from SUBMITTED".
 *   4. "Techpeple employs Dana Walker at $85/hr" was said on a bench ask,
 *      before she had said yes to anything.
 *   5. "Send on →" and "Message <supplier>" were drawn on every row for an
 *      MSP seated in a client's program, and refused on every press.
 *
 * Each is held here by the rule the screen now reads, and by the line of
 * the screen that reads it.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PROGRAM_PAGE = src('src/app/dashboard/program/page.tsx')
const APPROVE_ROUTE = src('src/app/api/timesheets/[id]/approve/route.ts')
const ROLLOFF_ROUTE = src('src/app/api/contracts/[id]/rolloff/route.ts')
const TERMS_ROUTE = src('src/app/api/submissions/[id]/terms/route.ts')
const SUBS_PAGE = src('src/app/dashboard/submissions/page.tsx')
const SUBS_ROUTE = src('src/app/api/submissions/route.ts')
const FORWARD_ROUTE = src('src/app/api/submissions/[id]/forward/route.ts')
const THREAD = src('src/components/thread.tsx')

/** The body of one function in a source file, from its name to the next top-level function. */
function bodyOf(file: string, name: string): string {
  const at = file.indexOf(name)
  expect(at, `${name} is in the file`).toBeGreaterThan(-1)
  const next = file.indexOf('\n  async function ', at + name.length)
  return file.slice(at, next === -1 ? undefined : next)
}

// ── 1. An over-hours week on the Approvals tab ────────────────────────

describe('Today → Approvals, a week over the line', () => {
  const FLAGGED = {
    code: 'FLAG_NEEDS_REASON',
    message: 'Omar Haddad’s week is 45 hours, over the job’s 40. Say why before you sign it.',
    field: 'note',
  }

  it('an over-hours week asks its reason in the route’s own sentence, answered in the field the route reads', () => {
    const q = reasonAsked(FLAGGED)
    expect(q).toEqual({ says: FLAGGED.message, field: 'note' })
    expect(answersFor({ note: q! }, { note: '  Release weekend, agreed with Marcus.  ' })).toEqual({ note: 'Release weekend, agreed with Marcus.' })
    // Nothing typed, nothing sent, and the button waits.
    expect(answersFor({ note: q! }, { note: '   ' })).toEqual({})
    expect(unanswered({ note: q! }, { note: '' })).toBe(true)
    // The other reason the same route asks for, and its own field.
    expect(reasonAsked({ code: 'NEEDS_REASON', message: 'Say why you accept fewer hours.', field: 'reason' })).toEqual({ says: 'Say why you accept fewer hours.', field: 'reason' })
  })

  it('a reason asked in a field of the route’s own naming never carries what another route’s code sends beside it', () => {
    // A paper sent back names `reason`; it is not an award's "work under way".
    expect(reasonAsked({ code: 'NO_REASON', message: 'Say what is wrong with the I-9.', field: 'reason' })).toEqual({ says: 'Say what is wrong with the I-9.', field: 'reason' })
    // The award's own NO_REASON, which names no field, is answered as before.
    expect(reasonAsked({ code: 'NO_REASON', message: 'Say why the work began before the award.' })).toEqual({
      says: 'Say why the work began before the award.', field: 'underWayReason', with: { workUnderWay: true },
    })
  })

  it('the Approvals row draws the box under the route’s sentence and sends the answer only once it was asked', () => {
    expect(PROGRAM_PAGE).toContain('<Field label={asked[item.id].says}>')
    expect(PROGRAM_PAGE).toContain("{asked[item.id] ? 'Approve with this reason' : 'Approve'}")
    expect(PROGRAM_PAGE).toContain('answersFor({ [q.field]: q }, { [q.field]: typed[item.id] ?? \'\' })')
    // The press hands back the route's question for the row to draw.
    expect(PROGRAM_PAGE).toContain('if (question && inline) return { ok: false, asked: question }')
  })

  it('a week the route refused stays on the Approvals list until it is signed', () => {
    const handler = bodyOf(PROGRAM_PAGE, 'async function handleApproveItem')
    // The row is no longer dropped before the answer comes back.
    expect(handler).not.toContain('approvalQueue.filter')
    expect(handler).toContain('return approve(')
    // It leaves the list on the one path that signed it.
    const approve = bodyOf(PROGRAM_PAGE, 'async function approve(')
    expect(approve.indexOf('approvalQueue.filter((a) => a.id !== d.entityId)')).toBeLessThan(approve.indexOf('return { ok: true }'))
  })

  it('a week’s figure on the Approvals row reads as hours, never as money', () => {
    expect(approvalAmountSays({ kind: 'timesheet', amount: 45 })).toBe(' · 45 hours')
    expect(approvalAmountSays({ kind: 'timesheet', amount: 1 })).toBe(' · 1 hour')
    expect(approvalAmountSays({ kind: 'timesheet', amount: 37.5 })).toBe(' · 37.50 hours')
    expect(approvalAmountSays({ kind: 'timesheet', amount: 45 })).not.toContain('$')
    expect(approvalAmountSays({ kind: 'expense', amount: 149.98, currency: 'USD' })).toBe(' · $149.98')
    expect(approvalAmountSays({ kind: 'timesheet', amount: null })).toBe('')
    expect(PROGRAM_PAGE).toContain('{approvalAmountSays(item)}')
    expect(PROGRAM_PAGE).not.toContain('{item.amount != null && ` · $${item.amount.toFixed(2)}`}')
  })

  it('one thing needs you, and two things need you', () => {
    expect(PROGRAM_PAGE).toContain("{items.length} thing{items.length !== 1 ? 's need' : ' needs'} you.")
  })
})

// ── 2. Roll off ───────────────────────────────────────────────────────

describe('Roll off on Today', () => {
  it('Roll off is never drawn for a seat the route will refuse', () => {
    // The route ends a placement only for a seat that may end one…
    expect(ROLLOFF_ROUTE).toContain("hasPermission(caller.permissions, 'assignments.terminate')")
    // …and the page asks the same permission before it draws the button.
    expect(PROGRAM_PAGE).toContain("const mayRollOff = hasPermission(useSession().permissions, 'assignments.terminate')")
    expect(PROGRAM_PAGE).toContain('{mayRollOff && <button onClick={() => onRolloff(c.contractId)}')
  })

  it('a client’s program manager, who may extend a placement and not end one, is not offered Roll off', async () => {
    const { defaultRoles } = (await import('@/lib/company-defaults')) as unknown as {
      defaultRoles?: (kind: string) => { name: string; permissions: string[] }[]
    }
    if (typeof defaultRoles !== 'function') {
      // The roles are read by name below where the export differs.
      const file = src('src/lib/company-defaults.ts')
      const pm = file.slice(file.indexOf("name: 'Program Manager'"), file.indexOf("name: 'Hiring Manager'"))
      expect(pm).toContain("['assignments.write']")
      expect(pm).not.toContain('assignments.terminate')
      return
    }
    const pm = defaultRoles('CLIENT').find((r) => r.name === 'Program Manager')!
    expect(pm.permissions).toContain('assignments.write')
    expect(pm.permissions).not.toContain('assignments.terminate')
  })
})

// ── 3. A week already signed ──────────────────────────────────────────

describe('pressing Approve on a week that cannot be signed now', () => {
  const OMAR = { personName: 'Omar Haddad', periodEnd: new Date('2026-10-24T00:00:00Z') }

  it('a week already signed says who signed it and when, never its status', () => {
    expect(notSignableSays({ ...OMAR, status: 'APPROVED', signedAt: new Date('2026-10-30T15:00:00Z'), signerName: 'Marcus Oyelaran' }))
      .toBe('This week was signed on Oct 30 by Marcus Oyelaran; nothing is left to sign.')
  })

  it('a week approved because nobody answered says so, and a week sent back or not sent says what is still to happen', () => {
    expect(notSignableSays({ ...OMAR, status: 'APPROVED', signedAt: new Date('2026-10-30T15:00:00Z'), signerName: null, bySilence: true }))
      .toBe('This week was approved on Oct 30 because nobody answered in time; nothing is left to sign.')
    expect(notSignableSays({ ...OMAR, status: 'REJECTED', signedAt: null, signerName: null }))
      .toBe('Omar Haddad’s week ending Oct 24, 2026 was sent back. It can be signed once Omar Haddad sends it again.')
    expect(notSignableSays({ ...OMAR, status: 'OPEN', signedAt: null, signerName: null }))
      .toBe('Omar Haddad’s week ending Oct 24, 2026 has not been sent yet. It can be signed once Omar Haddad sends it.')
  })

  it('the approve route says it through that sentence, with the client’s signature first and an approval by email by its approver', () => {
    expect(APPROVE_ROUTE).not.toContain('can only approve from SUBMITTED')
    expect(APPROVE_ROUTE).toContain('message: notSignableSays({')
    expect(APPROVE_ROUTE).toContain('timesheet.clientApprovedById ?? timesheet.approvedById')
    expect(APPROVE_ROUTE).toContain("prisma.weekApproval.findFirst({")
    for (const s of ['APPROVED', 'REJECTED', 'OPEN', 'SUBMITTED']) {
      expect(notSignableSays({ ...OMAR, status: s, signedAt: null, signerName: null })).not.toMatch(/\b[A-Z]{4,}\b/)
    }
  })
})

// ── 4. Terms before the yes ───────────────────────────────────────────

describe('a firm’s terms, before and after the person’s yes', () => {
  const who = { personName: 'Dana Walker', firmName: 'Techpeple', ownCompany: null, statedById: 'p-owner', now: new Date('2026-11-02T12:00:00Z') }

  it('a bench ask states the terms as offered, never as employment', () => {
    const r = listingTermsFrom({ engagementType: 'W2', payRateCents: 8_500 }, who)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.says).toBe('Techpeple offers Dana Walker $85/hr as its employee. Dana Walker sees these terms when they are asked, and agrees them only by saying yes.')
    expect(r.says).not.toContain('employs')
  })

  it('once she agreed them, the same terms read as employment', () => {
    const l = listingTerms({
      engagementType: 'W2', payRateCents: 8_500, statedAt: new Date('2026-10-01'), statedById: 'p-owner', agreedAt: new Date('2026-10-02'),
      personName: 'Dana Walker', firmName: 'Techpeple', ownCompany: null,
    })
    expect(l.state === 'AGREED' && l.says).toBe('Techpeple employs Dana Walker at $85/hr. Dana Walker agreed these terms on Techpeple’s bench listing.')
    const v = checkStatedTerms({ engagementType: 'W2', payRateCents: 8_500, personName: 'Dana Walker', firmName: 'Techpeple', ownCompany: null })
    expect(v.ok && v.agreedSays).toBe('Techpeple employs Dana Walker at $85/hr.')
  })

  it('the terms page says employment only to somebody the firm already employs, and offers terms to everybody else', () => {
    expect(TERMS_ROUTE).toContain('? `${stated.agreedSays} You are their employee, so nothing is waiting on you.`')
    expect(TERMS_ROUTE).toContain(': `${stated.says} Nothing starts until you agree. Open your terms to say yes.`')
  })
})

// ── 5. Send on and Message on the Candidates page ─────────────────────

const ROW: DoorRow = { id: 's1', fromCompanyId: 'techpeple', toCompanyId: 'cavanaugh', status: 'SUBMITTED', rate: 9_000, forwardedAt: null }

describe('Send on, on the Candidates page', () => {
  const holds = sendOnActor({ companyId: 'cavanaugh', companyName: 'Cavanaugh Glassworks', permissions: ['submissions.read', 'submissions.create'], kind: 'CLIENT' })
  const lacks = sendOnActor({ companyId: 'cavanaugh', companyName: 'Cavanaugh Glassworks', permissions: ['submissions.read'], kind: 'CLIENT' })

  it('Send on is never drawn for a seat the route will refuse', () => {
    // A seat in Cavanaugh's program whose role does not send candidates on.
    const refused = sendOnDoor(lacks, ROW)
    expect(refused.open).toBe(false)
    expect(refused.says).toMatch(/^Sending a candidate on is done by .+ at Cavanaugh Glassworks\./)
    expect(refused.says).not.toContain('submissions.create')
    // Somebody else's candidate, one already answered, one already sent on.
    expect(sendOnDoor(holds, { ...ROW, toCompanyId: 'brightmoor' }).open).toBe(false)
    expect(sendOnDoor(holds, { ...ROW, status: 'NOT_SELECTED' }).open).toBe(false)
    expect(sendOnDoor(holds, { ...ROW, forwardedAt: new Date() }).open).toBe(false)
    expect(sendOnDoor(holds, ROW)).toEqual({ open: true, says: null })
  })

  it('the list offers Send on exactly where the forward route’s own first checks let it through', () => {
    for (const actor of [holds, lacks]) {
      for (const row of [ROW, { ...ROW, toCompanyId: 'brightmoor' }, { ...ROW, status: 'PLACED' }, { ...ROW, forwardedAt: new Date() }]) {
        const not = whyNotSendOn(actor, { ...row, rateCents: row.rate ?? 0 })
        expect(sendOnDoor(actor, row)).toEqual(not ? { open: false, says: not.message } : { open: true, says: null })
      }
    }
    // One actor, built one way, in both routes.
    expect(FORWARD_ROUTE).toContain('mayForward(\n    sendOnActor({')
    expect(SUBS_ROUTE).toContain('sendOn: sendOnDoor(sendOnBy, s),')
    expect(SUBS_ROUTE).toContain('permissions: desk?.permissions ?? caller.permissions,')
    // And the page draws it only on the route's yes.
    expect(SUBS_PAGE).toContain("direction === 'received' && row.sendOn?.open === true && (")
  })

  it('a refused send-on shows the route’s sentence in the dialog', () => {
    expect(sendOnRefusalSays({ error: { code: 'NO_PERMISSION', message: 'Sending a candidate on is done by the Owner at Cavanaugh Glassworks.' } }))
      .toBe('Sending a candidate on is done by the Owner at Cavanaugh Glassworks.')
    expect(sendOnRefusalSays({ error: 'Not at a company.' })).toBe('Not at a company.')
    expect(sendOnRefusalSays({ error: { code: 'X' } })).toBeNull()
    expect(sendOnRefusalSays(null)).toBeNull()
    // The dialog throws the route's sentence and draws it.
    expect(SUBS_PAGE).toContain('const says = sendOnRefusalSays(body)')
    expect(SUBS_PAGE).toContain('{error && <p className="mt-3 text-[12px] text-etyme-attention" role="alert">{error}</p>}')
    // The list of companies it could go to is never refused in silence.
    expect(SUBS_PAGE).toContain('.catch((e: Error) => setCompaniesSay(e.message))')
    expect(SUBS_PAGE).toContain('No other company on Etyme to send this to yet. Send it by email instead.')
  })
})

describe('Message <supplier>, on the Candidates page', () => {
  const cavanaugh = { id: 'cavanaugh', name: 'Cavanaugh Glassworks' }
  const aptiva = { id: 'aptiva', name: 'Aptiva Workforce' }
  const techpeple = { id: 'techpeple', name: 'Techpeple' }
  const facts = {
    kind: 'SUBMISSION' as const, id: 's1', roleTitle: 'Batch process engineer', candidateName: 'Uchenna Lindgren',
    toCompanyId: 'cavanaugh', fromCompanyId: 'techpeple', fromCompanyName: 'Techpeple',
  }

  it('Message is never drawn for a seat the route will refuse', () => {
    // Aptiva, with no seat in Cavanaugh's program: the candidate went to Cavanaugh.
    expect(messageDoor({ companyId: 'aptiva', consultantSeat: false }, { ...ROW, kind: 'NETWORK' }).open).toBe(false)
    // A consultant's own seat never speaks for a firm.
    expect(messageDoor({ companyId: 'cavanaugh', consultantSeat: true }, { ...ROW, kind: 'NETWORK' }).open).toBe(false)
    // An internal move has nobody else to write to.
    expect(messageDoor({ companyId: 'cavanaugh', consultantSeat: false }, { ...ROW, kind: 'INTERNAL' }).open).toBe(false)
    // Cavanaugh itself, which received the candidate, writes.
    expect(messageDoor({ companyId: 'cavanaugh', consultantSeat: false }, { ...ROW, kind: 'NETWORK' })).toEqual({ open: true, says: null })
  })

  it('the list offers Message exactly where the conversations route would open the thread', () => {
    for (const me of [cavanaugh, aptiva, techpeple]) {
      const offered = messageDoor({ companyId: me.id, consultantSeat: false }, { ...ROW, kind: 'NETWORK' }).open
      expect(offered).toBe(whoMayOpen(facts, me, techpeple).ok)
    }
    expect(SUBS_ROUTE).toContain('message: messageDoor(messageBy, s),')
    expect(SUBS_PAGE).toContain("(direction === 'received' ? row.message?.open === true : true) && (")
  })

  it('“Message <supplier>” is drawn on the Candidates page for a seat in the client’s program that writes for it, and not for a seat whose role does not write', () => {
    const writes = { clientCompanyId: 'cavanaugh', permissions: ['requirements.write', 'requirements.read'] }
    const readsOnly = { clientCompanyId: 'cavanaugh', permissions: ['invoices.read'] }
    expect(messageDoor({ companyId: 'aptiva', consultantSeat: false, seat: writes }, { ...ROW, kind: 'NETWORK' })).toEqual({ open: true, says: null })
    expect(messageDoor({ companyId: 'aptiva', consultantSeat: false, seat: readsOnly }, { ...ROW, kind: 'NETWORK' })).toEqual({ open: false, says: null })
    // A seat at another client writes nothing for Cavanaugh's candidates.
    expect(messageDoor({ companyId: 'aptiva', consultantSeat: false, seat: { ...writes, clientCompanyId: 'northbend' } }, { ...ROW, kind: 'NETWORK' }).open).toBe(false)
    // The button agrees with the route: a writing seat opens the client's thread.
    expect(whoMayOpen(facts, aptiva, techpeple, { seatedAt: cavanaugh, seatWrites: true }).ok).toBe(true)
    // The route hands the seat it read once for the request, never one per row.
    expect(SUBS_ROUTE).toContain('seat: desk?.seat ? { clientCompanyId: desk.seat.clientCompany.id, permissions: desk.seat.role.permissions } : null,')
  })

  it('a firm with no seat in the program is offered no button and told nothing', () => {
    expect(messageDoor({ companyId: 'aptiva', consultantSeat: false, seat: null }, { ...ROW, kind: 'NETWORK' })).toEqual({ open: false, says: null })
    expect(messageDoor({ companyId: 'aptiva', consultantSeat: false }, { ...ROW, kind: 'NETWORK' })).toEqual({ open: false, says: null })
  })

  it('a refused message shows the route’s sentence in the dialog', () => {
    // The thread's first message opens it, through the conversations
    // route, read for its own words and drawn under the box.
    expect(THREAD).toContain("const res = await fetch('/api/conversations', {")
    expect(THREAD).toContain('await readJson(res)')
    expect(THREAD).toContain('setErr(e.message)')
    expect(THREAD).toContain('error={err ?? undefined}')
  })
})

// ── Money's two handoffs, on demand's routes ──────────────────────────

describe('the approve press to the books, and the convert route’s dates', () => {
  it('one press posts every signature it wrote from one read, and one that cannot post is reported the way a thrown one was', () => {
    expect(APPROVE_ROUTE).toContain('const posted = await postAssertions(writtenIds, person.id)')
    expect(APPROVE_ROUTE).toContain('for (const f of posted.failed) postingFailed(f.error)')
    expect(APPROVE_ROUTE).not.toMatch(/await postAssertion\(/)
    // The approval stands and the response says so in one sentence.
    expect(APPROVE_ROUTE).toContain('notPosted = POSTING_FAILED_SAYS')
  })

  it('converting a placement refuses a last day on or before the start in a sentence with both days in it', async () => {
    const CONVERT = src('src/app/api/submissions/[id]/convert/route.ts')
    expect(CONVERT).toContain('const dates = lineDates(startDate, endDate)')
    expect(CONVERT).not.toContain('endDate must be after startDate')
    expect(CONVERT).not.toContain("'Invalid startDate'")
    // The bill rate is asked for in words too, never the column's name and unit.
    expect(CONVERT).not.toContain('billRate must be a positive number (cents/hr)')
    expect(CONVERT).toContain("'Give the rate the client is billed for this person, in dollars an hour, above nothing.'")
    const { lineDates } = await import('@/lib/money/line-dates')
    const v = lineDates('2026-11-09', '2026-11-02')
    expect(v.ok).toBe(false)
    expect(!v.ok && v.says).toBe('The last day, Nov 2, 2026, is before the start, Nov 9, 2026. Give a last day after the start, or leave it empty where it is not known.')
  })
})

// ── One word for acting on a week, on the Timesheets page ─────────────

describe('the Timesheets page’s words for acting on a week', () => {
  const TIMESHEETS_PAGE = src('src/app/dashboard/timesheets/page.tsx')
  const TIMESHEETS_ROUTE = src('src/app/api/timesheets/route.ts')

  it('the client’s act on a week is “Approve timesheet”, and a firm below it accepts, in the words Ask Etyme reads', async () => {
    const { weekButton, anywayTitle, withReasonButton } = await import('@/app/dashboard/timesheets/act-words')
    const { WEEK_WORDS } = await import('@/lib/notify/week-words')
    expect(weekButton({ act: 'APPROVE', flag: null })).toBe('Approve timesheet')
    expect(weekButton({ act: 'APPROVE', flag: 'Over the job’s 40 hours.' })).toBe('Approve anyway…')
    expect(weekButton({ act: 'ACCEPT', flag: null })).toBe(WEEK_WORDS.ACCEPT.button)
    expect(weekButton({ act: 'ACCEPT', flag: 'Over the job’s 40 hours.' })).toBe(WEEK_WORDS.ACCEPT.flagged)
    expect(anywayTitle('APPROVE', 'Omar Haddad')).toBe('Approve Omar Haddad’s timesheet anyway?')
    expect(anywayTitle('ACCEPT', 'Omar Haddad')).toBe('Accept Omar Haddad’s timesheet anyway?')
    expect(withReasonButton('APPROVE')).toBe('Approve with this reason')
    expect(withReasonButton('ACCEPT')).toBe('Accept with this reason')
  })

  it('the list route says which act a row asks of this reader, the same way Ask Etyme decides it', () => {
    expect(TIMESHEETS_ROUTE).toContain('act: weekActOf({ signedAbove: !isClientSide }),')
  })

  it('no button on the Timesheets page says “Sign” for the act; sentences about the record may', () => {
    for (const old of ["'Sign anyway…'", "'Sign this week'", 'Sign with this reason', '&rsquo;s week anyway?', 'Sign ${flaggedLeft']) {
      expect(TIMESHEETS_PAGE).not.toContain(old)
    }
    expect(TIMESHEETS_PAGE).toContain('{weekButton(row)}')
    expect(TIMESHEETS_PAGE).toContain('{anywayTitle(reasonFor.row.act, reasonFor.row.person.name)}')
    expect(TIMESHEETS_PAGE).toContain('{withReasonButton(reasonFor.row.act)}')
    // The tick on a row says its act to a screen reader and on hover.
    expect(TIMESHEETS_PAGE).toContain('aria-label={weekButton(row)}')
  })

  it('Send on is drawn by the one reader of the forward route’s first checks, never a copy of the rule', () => {
    const DOORS = src('src/app/api/submissions/row-doors.ts')
    expect(DOORS).toContain('if (maySendOn(actor, sub)) return { open: true, says: null }')
    expect(DOORS).toContain('return mayMessageSupplier(s, caller.companyId, caller.seat ?? null)')
    // The forward route passes the book's kind and name, so its refusal names who may.
    expect(FORWARD_ROUTE).toContain("kind: desk?.seat ? desk.seat.clientCompany.kind : caller.company?.kind ?? null,")
    expect(FORWARD_ROUTE).toContain('companyName: desk?.companyName ?? caller.company?.name ?? null,')
  })
})

// ── 6. Ask Etyme's "Open who applied" opened an empty list ────────────
//
// The second screen walk (2026-11-03): a hiring manager's card opened
// `/dashboard/submissions?requirementId=<job>` and the page read "No
// submissions yet" for a job with three candidates, because the route
// read one job's rows as the ones the client had sent.

describe('Candidates, opened on one job', () => {
  const ASK = src('src/app/api/conversations/twin/ask.ts')
  const job = (id: string, location: string | null, start: string) =>
    ({ id, companyId: 'northbend', title: 'HCM integration lead', location, startDate: new Date(start), postedAt: new Date('2026-10-01') })

  it('the Candidates page opened from a card shows that job’s candidates and names the job', async () => {
    const { whoAppliedSays, jobNamed, EVERY_JOB_SAYS } = await import('@/app/api/submissions/job-heading')
    // The card and the page read one query name.
    expect(ASK).toContain('/dashboard/submissions?requirementId=')
    expect(SUBS_PAGE).toContain("searchParams.get('requirementId')")
    // The route reads the job's rows whichever way they faced where no
    // direction was asked, so a client's own job is not read as "sent".
    expect(SUBS_ROUTE).toMatch(/filterRequirementId && !askedDirection/)
    // The job named, told apart only where another shares its title.
    expect(whoAppliedSays(jobNamed(job('a', 'Dayton, Ohio', '2026-11-10'), []))).toBe('Who applied for HCM integration lead')
    expect(whoAppliedSays(jobNamed(job('a', 'Dayton, Ohio', '2026-11-10'), [job('b', 'Toledo, Ohio', '2026-11-10')])))
      .toBe('Who applied for HCM integration lead in Dayton, Ohio')
    expect(whoAppliedSays(jobNamed(job('a', 'Dayton, Ohio', '2026-11-10'), [job('b', 'Dayton, Ohio', '2026-12-01')])))
      .toBe('Who applied for HCM integration lead starting Nov 10')
    // The page draws the heading and the way back to every job.
    expect(SUBS_PAGE).toContain('whoAppliedSays(job?.named')
    expect(SUBS_PAGE).toContain('href="/dashboard/submissions"')
    expect(EVERY_JOB_SAYS).toBe('See candidates for every job')
    // Never the job's key in the words.
    expect(whoAppliedSays(null)).toBe('Who applied for this job')
  })

  it('a link to a job’s candidates draws nothing the seat may not open', async () => {
    const { mayNameJob } = await import('@/app/api/submissions/job-heading')
    // Named for its own firm, or where the seat already reads rows on it.
    expect(mayNameJob({ companyId: 'northbend' }, 'northbend', 0)).toBe(true)
    expect(mayNameJob({ companyId: 'northbend' }, 'brightmoor', 2)).toBe(true)
    // A stranger's job typed into the address: no rows, no title.
    expect(mayNameJob({ companyId: 'northbend' }, 'stranger', 0)).toBe(false)
    expect(mayNameJob(null, 'northbend', 0)).toBe(false)
    // The rows go through the same scope and row doors as the full list:
    // the job filter is added to the scoped WHERE, never in place of it.
    const get = SUBS_ROUTE.slice(SUBS_ROUTE.indexOf('export async function GET'))
    expect(get.indexOf('const where: any = { ...scope }')).toBeGreaterThan(-1)
    expect(get.indexOf('const where: any = { ...scope }')).toBeLessThan(get.indexOf('where.requirementId = filterRequirementId'))
    expect(get).toContain('sendOn: sendOnDoor(sendOnBy, s)')
    expect(get).toContain('message: messageDoor(messageBy, s)')
    expect(get).toContain('mayNameJob(asked, deskId, total)')
  })
})
