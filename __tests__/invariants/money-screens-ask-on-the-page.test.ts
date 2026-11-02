import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { domainOf } from '@/lib/domains'
import { afterSend, refusalFrom, SaidField } from '@/app/dashboard/invoices/said-field'
import { WriteOffForm, writeOffBody } from '@/app/dashboard/ar/write-off'

/**
 * A money screen asks on the page, and a refusal is said under what was
 * typed, which stays.
 *
 * The screen walk, 2026-11-02: "Ask the supplier" was a browser prompt,
 * and at an MSP seat the question was refused with nothing on screen and
 * the words lost. The same class lived on the bill's page (waive a check,
 * withdraw an exception, ask the supplier, the send's refusal in an
 * alert, withdraw a draft), on Accounts receivable (a write-off asked as
 * a code typed into a prompt) and on Rate history (reject, the note,
 * back pay). Each is a field on the page now.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(ROOT, p)).isDirectory() ? filesUnder(p) : /\.tsx?$/.test(n) ? [p] : []
  })
}

describe('a money screen asks on the page', () => {
  it('no screen money owns asks in a browser prompt, confirm or alert', () => {
    const mine = filesUnder('src/app/dashboard').filter((p) => domainOf(p)?.key === 'MONEY')
    expect(mine.length).toBeGreaterThan(10)
    const asking = mine.filter((p) => /window\.(prompt|confirm|alert)\(|[^.\w]alert\(|[^.\w]confirm\(/.test(read(p)))
    expect(asking.map((p) => relative(ROOT, join(ROOT, p)))).toEqual([])
  })

  it('a refusal is said under the field and keeps every word typed; a success clears and closes it', () => {
    const typed = { text: 'The client agreed the extra hours by email.', refused: null, open: true }
    expect(afterSend(typed, 'Only the AP Clerk records an exception.')).toEqual({ ...typed, refused: 'Only the AP Clerk records an exception.' })
    expect(afterSend(typed, null)).toEqual({ text: '', refused: null, open: false })
  })

  it('the route’s own sentence is the one said, and the page’s own only where the route sent none', () => {
    expect(refusalFrom({ error: { message: 'Isabel Ward is not yours to speak for.' } }, 'Not sent.')).toBe('Isabel Ward is not yours to speak for.')
    expect(refusalFrom(null, 'Not sent.')).toBe('Not sent.')
    expect(refusalFrom({ error: { message: '  ' } }, 'Not sent.')).toBe('Not sent.')
  })

  it('the field draws its label beside its box, and its button', () => {
    const html = renderToStaticMarkup(createElement(SaidField, {
      id: 'waive-HOURS', label: 'Why this is waived', submit: 'Record the exception',
      onSend: async () => null, onCancel: () => {},
    }))
    expect(html).toMatch(/<label[^>]*for="waive-HOURS"[^>]*>Why this is waived<\/label>/)
    expect(html).toMatch(/<textarea[^>]*id="waive-HOURS"/)
    expect(html).toContain('Record the exception')
  })
})

describe('the bill’s page, Accounts receivable and Rate history ask in fields', () => {
  it('the bill’s page takes a waiver’s reason, a question to the supplier and a draft’s withdrawal on the page, and asks before withdrawing an exception', () => {
    const page = read('src/app/dashboard/invoices/[id]/page.tsx')
    expect(page).toMatch(/<SaidField\s+id=\{`waive-\$\{c\.code\}`\}/)
    expect(page).toMatch(/<SaidYes\s+says="Withdraw this exception\? The invoice may stop matching\."/)
    expect(page).toMatch(/<SaidField\s+id="ask-supplier"/)
    expect(page).toMatch(/<SaidField\s+id="withdraw-draft"/)
  })

  it('a refused send is said beside the button with every check that failed', () => {
    const page = read('src/app/dashboard/invoices/[id]/page.tsx')
    expect(page).toMatch(/setSendRefused\(\{\s+says: refusalFrom\(j, 'The bill was not sent\.'\),/)
    expect(page).toMatch(/sendRefused\.checks\.map\(\(c\) => <li key=\{c\}>\{c\}<\/li>\)/)
  })

  it('a write-off picks its reason from the route’s own list in its words, never a code typed in', () => {
    const html = renderToStaticMarkup(createElement(WriteOffForm, {
      customerName: 'Talvern Medical',
      reasons: [{ code: 'CUSTOMER_INSOLVENT', label: 'The customer has gone under' }, { code: 'TIME_BARRED', label: 'Out of time to sue for it' }],
      onSend: async () => null, onCancel: () => {},
    }))
    expect(html).toContain('<option value="CUSTOMER_INSOLVENT">The customer has gone under</option>')
    expect(html).toContain('Why Talvern Medical’s overdue bills are written off')
    expect(html).not.toContain('One of:')
  })

  it('what the write-off posts is the code, the sentence or nothing, and the amount, which the route reads', () => {
    expect(writeOffBody({ reason: 'TIME_BARRED', note: '  ', amountCents: 412_500 })).toEqual({ reason: 'TIME_BARRED', note: null, amountCents: 412_500 })
    expect(writeOffBody({ reason: 'SETTLED_FOR_LESS', note: ' Settled at 80% on Oct 30. ', amountCents: 100 })).toEqual({ reason: 'SETTLED_FOR_LESS', note: 'Settled at 80% on Oct 30.', amountCents: 100 })
    const route = read('src/app/api/ar/collections/route.ts')
    for (const f of ['reason', 'note', 'amountCents']) expect(route).toContain(`body.${f}`)
  })

  it('Rate history asks why a change is rejected, takes an optional note on an approval, and asks before paying back pay', () => {
    const page = read('src/app/dashboard/rate-history/page.tsx')
    expect(page).toMatch(/label=\{deciding\.action === 'reject' \? 'Why this rate change is rejected' : 'A note for the record, if there is one'\}/)
    expect(page).toMatch(/optional=\{deciding\.action === 'approve'\}/)
    expect(page).toMatch(/<SaidYes\s+says=\{`Pay it now as/)
    expect(page).toMatch(/setDecided\(j\.data\.message \?\? null\)/)
  })
})
