import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { journalWords, NOT_CONNECTED, JOURNAL_FILE, type JournalRead } from '@/app/api/integrations/export/words'
import { MATRIX } from '@/lib/matrix'

/**
 * The fix list of 2026-11-14, E6: Integrations showed an accounting
 * product as picked, seven products "(nothing mapped yet)" and a greyed
 * Export. It now says only what is true today.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/integrations/page.tsx')
const route = read('src/app/api/integrations/export/route.ts')
const PRODUCTS = /QuickBooks|QUICKBOOKS|NetSuite|NETSUITE|Xero|XERO|Workday|WORKDAY|Oracle|ORACLE|\bSAP\b/

const r = (o: Partial<JournalRead>): JournalRead => ({ pending: 0, sent: 0, mappedAccounts: 0, mayExport: true, whoExports: 'Ask Accounts Receivable.', ...o })

describe('Integrations says only what is true', () => {
  it('the page does not read as if an accounting product were chosen when nothing is connected', () => {
    expect(journalWords(r({})).says[0]).toBe('Etyme is not connected to any accounting system. It makes a file you load into your own system yourself.')
    expect(page).not.toMatch(PRODUCTS)
    expect(page).not.toContain('nothing mapped yet')
    expect(page).not.toContain('<Select')
    expect(route).not.toMatch(PRODUCTS)
  })

  it('with nothing waiting, it says so in words and draws no Export', () => {
    const w = journalWords(r({ pending: 0, sent: 3 }))
    expect(w.says).toEqual([NOT_CONNECTED, 'Nothing is waiting to go to your own system. 3 entries already went.'])
    expect(w.showExport).toBe(false)
  })

  it('with entries waiting and no account codes set, it says how many wait and why they cannot go, and draws no Export', () => {
    const w = journalWords(r({ pending: 4 }))
    expect(w.says[1]).toBe('4 entries are waiting. They cannot go until each Etyme account has your own account code. Account codes cannot be set here yet.')
    expect(w.showExport).toBe(false)
    expect(journalWords(r({ pending: 1 })).says[1]).toMatch(/^1 entry is waiting\./)
  })

  it('where the firm’s own codes exist, Export is drawn for a seat whose route takes it, and any other seat reads who exports', () => {
    expect(journalWords(r({ pending: 2, mappedAccounts: 5 }))).toEqual({ says: [NOT_CONNECTED, '2 entries are waiting.'], showExport: true })
    const reader = journalWords(r({ pending: 2, mappedAccounts: 5, mayExport: false }))
    expect(reader.showExport).toBe(false)
    expect(reader.says).toContain('Ask Accounts Receivable.')
    expect(route).toContain("const mayExport = hasPermission(caller.permissions, 'invoices.issue')")
    expect(route).toMatch(/if \(!hasPermission\(caller\.permissions, 'invoices\.issue'\)\)/)
    expect(page).toContain('{data.showExport && (')
  })

  it('the accounting export is one file and does not change by the name of a product', () => {
    expect(JOURNAL_FILE).toBe('CSV')
    expect(route).toContain('const system = JOURNAL_FILE')
    expect(route).not.toContain('body?.system')
  })

  it('the matrix does not say account mapping is built while nothing writes an account map, and names no product', () => {
    const row = MATRIX.flatMap((l1) => l1.groups.flatMap((l2) => l2.processes)).find((p) => p.code === 'L3.6.3.1')!
    expect(row.status).toBe('PARTIAL')
    expect(row.tasks.join(' ')).toContain('NOT BUILT: a place where a firm gives each Etyme account its own account code')
    expect(row.tasks.join(' ')).not.toMatch(PRODUCTS)
  })
})

describe('The header’s + menu', () => {
  it('the entry that makes a bill reads "Raise a bill", the one name the Bills page and its dialog use', async () => {
    const { RAISE_A_BILL } = await import('@/lib/money/nothing-to-bill')
    expect(RAISE_A_BILL).toBe('Raise a bill')
    const header = read('src/components/shell/header.tsx')
    expect(header).toContain('label: RAISE_A_BILL,')
    expect(header).not.toContain("'Generate bill'")
  })
})
