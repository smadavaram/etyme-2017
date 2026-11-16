/**
 * Layer 9, slice 1: the screen and the route it calls agree.
 * "Download for your system" is drawn only where the route will answer,
 * and the screen sends every question the route asks.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/ap/page.tsx')
const screen = read('src/app/dashboard/ap/payment-run-file.tsx')
const route = read('src/app/api/ap/receipts-file/route.ts')

describe('the Download for your system act on the payables page', () => {
  it('is drawn only on an approved run, inside the block drawn for a seat that releases payment runs', () => {
    const at = page.indexOf('<DownloadReceiptLines')
    expect(at).toBeGreaterThan(0)
    const block = page.lastIndexOf('desk.mayRun', at)
    expect(block).toBeGreaterThan(0)
    expect(page.slice(at - 60, at)).toContain("r.status === 'APPROVED'")
  })

  it('the route asks for the same permission the page draws it for', () => {
    expect(route).toContain("'payments.record'")
    expect(read('src/lib/money/pay-desk.ts')).toContain("hasPermission(input.permissions, 'payments.record')")
  })

  it('the screen sends the run and the chosen columns, the two questions the route asks', () => {
    expect(screen).toContain('/api/ap/receipts-file?run=')
    expect(screen).toContain('&columns=')
    expect(route).toContain("searchParams.get('run')")
    expect(route).toContain("searchParams.get('columns')")
  })

  it('the screen says no bank details and names no product on its label', () => {
    expect(screen).toContain('No bank details.')
    expect(screen).toContain('Download for your system')
  })

  it('the screen never imports a server-only file for its columns', () => {
    const imports = screen.match(/from '@\/lib\/money\/receipt-file'/g) ?? []
    expect(imports).toHaveLength(1)
    expect(read('src/lib/money/receipt-file.ts')).not.toMatch(/@\/lib\/db|prisma/)
  })
})

describe('the line states and the answer from your system, drawn only where their routes will act', () => {
  const answerRoute = read('src/app/api/ap/receipts-file/answer/route.ts')
  it('the line states are drawn on an approved run, and the answer box only where the company is not waiting for a verified Owner', () => {
    const states = page.indexOf('<ReceiptLineStates')
    expect(page.slice(states - 60, states)).toContain("r.status === 'APPROVED'")
    const answer = page.indexOf('<AnswerFromYourSystem')
    expect(page.slice(answer - 90, answer)).toContain("r.status === 'APPROVED' && !data?.payWaits")
    expect(page.lastIndexOf('desk.mayRun', answer)).toBeGreaterThan(0)
  })
  it('send again is drawn only on a line the route says may be sent again', () => {
    expect(screen).toMatch(/l\.canSendAgain && \(\s*<button[^>]*onClick=\{\(\) => sendAgain/)
    expect(screen).toContain('&again=1')
    expect(route).toContain("searchParams.get('again')")
    expect(route).toContain("searchParams.get('line')")
  })
  it('the answer form sends every question its route asks, and the route needs the release permission', () => {
    expect(screen).toContain('/api/ap/receipts-file/answer')
    for (const q of ['runId', 'csv', 'receipt', 'paidOn', 'reference']) {
      expect(answerRoute).toContain(`body.${q}`)
      expect(screen).toContain(q)
    }
    expect(answerRoute).toContain("'payments.record'")
  })
  it('saving the columns calls the route that writes only the saved columns', () => {
    expect(screen).toContain("method: 'PUT'")
    const columns = read('src/app/api/ap/receipts-file/columns/route.ts')
    expect(columns).toContain('fileColumns')
    expect(columns).not.toContain('companyCode')
  })
  it('payments are written only by the one confirmation, never by the answer reader', () => {
    const reader = read('src/lib/money/feed-answer-read.ts')
    expect(reader).toContain('confirmRunPayments')
    expect(reader).not.toMatch(/recordKeyedPayment|prisma\.payment\.|vendorBill\.update/)
  })
})

describe('what the file screen says after each act', () => {
  const companies = read('src/app/dashboard/companies/page.tsx')
  const settings = read('src/app/dashboard/settings/page.tsx')
  it('saving the column choice says the columns are used for the next file, beside the button', () => {
    expect(screen).toContain('Saved. These columns are used for your next file.')
    const at = screen.indexOf('Save these columns for every file')
    expect(screen.indexOf('{savedSays &&', at)).toBeLessThan(screen.indexOf('</div>', at) + 1)
  })
  it('each line already sent is listed with its own sentence under the count', () => {
    expect(screen).toContain('alreadySent')
    expect(screen).toContain('sentBefore.map')
  })
  it('a resend is named as its own file, not the first file’s name', () => {
    const lib = read('src/lib/money/receipt-file-read.ts')
    expect(lib).toContain('-again-')
  })
  it('a cost center’s profit center is changed through the route that already accepts it', () => {
    expect(settings).toContain("'/api/settings/cost-centers', 'PATCH', { id: cc.id, profitCenter")
    expect(read('src/app/api/settings/cost-centers/route.ts')).toContain("'profitCenter' in body")
  })
  it('the vendor number label is tied to its box', () => {
    expect(companies).toContain('id={`vendor-number-${supplierId}`}')
    expect(companies).toMatch(/label="Your vendor number for them" id=\{`vendor-number-\$\{supplierId\}`\}/)
  })
})
