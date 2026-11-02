import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { listTotals, rateColumnLabel, totalsRowOf, type TotalsRow } from '@/app/dashboard/timesheets/totals'
import { rateWordFor } from '@/lib/money/rate-words'
import { OVERDUE_BILL_STATUSES } from '@/app/api/decisions/overdue-bills'
import { isSent, BILL_NOT_SENT } from '@/lib/money/bill-state'
import { says, askedSays } from '@/lib/contractor-invite'
import { askFormSays } from '@/app/dashboard/people/ask-words'
import { NO_MAIL_HERE } from '@/lib/notify/mail-leaves'

/**
 * What money's and conversation's reports found in demand's files after
 * the second Tapin walk: a rate said from the wrong end, a bill nobody
 * was sent counted as overdue, an email promised where none can leave,
 * and a rate turned into cents by hand.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

// ── A rate is said from the reader's end ─────────────────────────────

describe('a week’s rate is said from the reader’s own end of the line', () => {
  const tapinToBrightmoor = { sellerId: 'tapin', sellerName: 'Tapin', buyerId: 'brightmoor', buyerName: 'Brightmoor Staffing' }

  it('a prime reads “What you pay” over a week it buys from its sub-vendor, and the sub-vendor reads “Bill rate” over the same week', () => {
    expect(rateWordFor(tapinToBrightmoor, 'brightmoor').label).toBe('What you pay')
    expect(rateWordFor(tapinToBrightmoor, 'tapin').label).toBe('Bill rate')
  })

  it('the timesheets list labels every row through the one reader, never a fixed “Bill rate”', () => {
    const route = code('src/app/api/timesheets/route.ts')
    const priceFor = route.slice(route.indexOf('async function priceFor('), route.indexOf('function overtimeOf('))
    expect(priceFor).toContain('label: rateWordFor(ratedLine(r.sellContract), reader).label')
    expect(priceFor).toContain('label: word.label')
    expect(priceFor).not.toContain("label: 'Bill rate'")
    // The seller's name rides on every row, so the word can name both ends.
    expect(route).toMatch(/company: \{ select: \{ id: true, name: true \} \},\s*clientCompany: \{ select: \{ id: true, name: true \} \}/)
  })

  it('a list holding weeks a firm bills beside weeks it pays is headed “Rate”, and each row says its own word', () => {
    expect(rateColumnLabel(['Bill rate', 'Bill rate'])).toEqual({ label: 'Bill rate', perRow: false })
    expect(rateColumnLabel(['What you pay'])).toEqual({ label: 'What you pay', perRow: false })
    expect(rateColumnLabel(['Bill rate', 'What you pay'])).toEqual({ label: 'Rate', perRow: true })
    expect(rateColumnLabel([])).toEqual({ label: 'Bill rate', perRow: false })
    expect(code('src/app/dashboard/timesheets/page.tsx')).toContain('{ratePerRow && <span className="block text-[10px] text-etyme-faint">{row.rate.label}</span>}')
  })

  const week = (over: Partial<TotalsRow> = {}): TotalsRow => ({
    periodStart: '2026-10-18T00:00:00.000Z', totalHours: 40, status: 'APPROVED', flag: null,
    waitingOnYou: false, valueCents: 400_000, ...over,
  })

  it('the approved value never adds what a firm bills to what it pays: the weeks it pays for are counted out of the figure', () => {
    const t = listTotals([week(), week({ buys: true, valueCents: 180_000 })], { onServer: 2, payBasis: false })
    expect(t.approvedValueCents).toBe(400_000)
    expect(t.approvedSays).toBe('billable, from 1 week approved since Oct 18, 2026; 1 week you pay for is not in this figure')
    const two = listTotals([week(), week({ buys: true }), week({ buys: true })], { onServer: 3, payBasis: false })
    expect(two.approvedSays).toMatch(/; 2 weeks you pay for are not in this figure$/)
  })

  it('a list of weeks a firm only pays for says what it pays, never “billable”', () => {
    const t = listTotals([week({ buys: true }), week({ buys: true, valueCents: 200_000 })], { onServer: 2, payBasis: false })
    expect(t.approvedValueCents).toBe(600_000)
    expect(t.approvedSays).toBe('what you pay for 2 weeks approved since Oct 18, 2026')
  })

  it('a row the server says the reader buys is counted as bought, and every other row as billed, as before', () => {
    const base = { periodStart: '2026-10-18', totalHours: 40, status: 'APPROVED', flag: null }
    expect(totalsRowOf({ ...base, rate: { cents: 4_500, buys: true } }).buys).toBe(true)
    expect(totalsRowOf({ ...base, rate: { cents: 4_500 } }).buys).toBe(false)
  })
})

// ── Overdue is a bill somebody was sent ──────────────────────────────

describe('a bill is overdue only once the firm that pays it was sent it', () => {
  it('a bill raised and never sent is never overdue: the queue counts only bills the payer was sent', () => {
    for (const s of BILL_NOT_SENT) expect(OVERDUE_BILL_STATUSES).not.toContain(s)
    for (const s of OVERDUE_BILL_STATUSES) expect(isSent(s), s).toBe(true)
  })

  it('a bill sent and not paid at all is counted once its day has passed, and so is one part paid', () => {
    expect(OVERDUE_BILL_STATUSES).toEqual(['SUBMITTED', 'PARTIALLY_PAID'])
  })

  it('the queue’s overdue row reads the one list and never names ISSUED', () => {
    const route = code('src/app/api/decisions/route.ts')
    expect(route).toContain('status: { in: [...OVERDUE_BILL_STATUSES] },')
    expect(route).not.toContain("status: { in: ['ISSUED', 'PARTIALLY_PAID'] }")
  })
})

// ── An email is promised only where one can leave ────────────────────

describe('an ask promises an email only where one can leave', () => {
  const lucia = { first: 'Lucía', companyName: 'Northbend Athletic' }

  it('an ask whose email went says they will hear from you by email', () => {
    expect(askedSays({ ...lucia, sent: true, mail: true })).toMatch(/^Lucía has been asked, and will hear from you by email\./)
  })

  it('an ask made where no email can leave says it shows in Etyme and that the person has not been told', () => {
    const said = askedSays({ ...lucia, sent: false, mail: false })
    expect(said).toMatch(/^The ask for Lucía is saved and shows in Etyme\. No email can be sent from here yet, so Lucía has not been told\./)
    expect(said).not.toMatch(/will hear from you by email/)
  })

  it('an ask whose email could have gone and did not says so, and why', () => {
    expect(askedSays({ ...lucia, sent: false, mail: true, note: 'The address bounced.' }))
      .toMatch(/^The ask for Lucía is saved and shows in Etyme, but the email did not go: The address bounced\./)
  })

  it('the row of an ask waiting on an answer says a link was sent only where an email can leave', () => {
    const row = { state: 'ASKED' as const, name: 'Lucía Fernández', answer: null, supplierName: null }
    expect(says(row, { mail: true }).now).toBe('Lucía has been sent a link and has not answered yet.')
    expect(says(row, { mail: false }).now).toBe(`The ask for Lucía shows in Etyme. ${NO_MAIL_HERE}, so Lucía has not been sent the link.`)
  })

  it('the ask form promises an email only where one can leave, and nothing until the route has said', () => {
    expect(askFormSays(true)).toMatch(/They hear from you by email\.$/)
    expect(askFormSays(false)).toMatch(/The ask shows in Etyme\. No email can be sent from here yet, so they are not told yet\.$/)
    expect(askFormSays(null)).toBe('Somebody you have worked with, or been referred.')
  })

  it('every reader of the ask’s sentence asks whether an email can leave, through the one answer', () => {
    for (const f of ['src/app/api/contractor-invites/route.ts', 'src/app/api/contractor-invites/[id]/route.ts', 'src/app/api/people/route.ts']) {
      const src = code(f)
      expect(src, f).toContain("from '@/lib/notify/mail-leaves'")
      expect(src, f).toMatch(/[sS]ays\(\{[^)]*\}, \{ mail(: mailLeaves\(\))? \}\)/)
    }
    expect(code('src/app/api/contractor-invites/route.ts')).toContain("sent: mailLeaves() && delivery.state === 'SENT'")
    expect(code('src/app/api/people/route.ts')).toContain('capMonths, mail }')
    expect(code('src/app/dashboard/people/page.tsx')).toContain('{askFormSays(mail)}')
  })
})

// ── A rate typed in dollars reaches the route in cents through one reader ──

describe('every rate typed on the Submissions page reaches the route through the one reader', () => {
  it('the Send on dialog reads the onward rate through the one reader and says nothing about a margin on an empty box', () => {
    const page = code('src/app/dashboard/submissions/page.tsx')
    expect(page).toContain('const onwardCents = centsTyped(rate)')
    expect(page).toContain('useState(() => typedFromCents(submission.rate))')
    expect(page).toContain("'Type the rate you send it on at, in dollars an hour.'")
    expect(page).toContain('const ready = rated && (')
  })

  it('the submit form reads its rate and the pay rate through the same reader, never dollars times a hundred by hand', () => {
    const page = code('src/app/dashboard/submissions/page.tsx')
    expect(page).toContain('const rateCents = centsTyped(form.rate)')
    expect(page).toContain('const payCents = centsTyped(form.payRate)')
    expect(page).not.toMatch(/\*\s*100\b/)
  })
})
