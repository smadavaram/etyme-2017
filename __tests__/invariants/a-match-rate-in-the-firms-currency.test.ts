import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { submitFields } from '@/lib/bench-filter'
import { currencySign, typedFromMinor } from '@/app/dashboard/requirements/[id]/match-rate'

const page = readFileSync(join(process.cwd(), 'src/app/dashboard/requirements/[id]/matches.tsx'), 'utf8')
const names = { person: 'Linh Tran', firm: 'Saigon Talent' }
const action = { rate: null, payRate: null, offeredBy: null }

describe('a rate typed on a match is read in the putting-forward firm’s own currency', () => {
  it('a rate typed on a match at a dong firm is stored as whole dong', () => {
    expect(submitFields(action, { bill: '170000' }, names, 'VND')).toEqual({ ok: true, rate: 170_000, payRate: null })
  })

  it('a rate typed on a match at a dollar firm is stored in cents, as before', () => {
    expect(submitFields(action, { bill: '90' }, names, 'USD')).toEqual({ ok: true, rate: 9_000, payRate: null })
  })

  it('the match passes the seat’s own firm’s currency, read from /api/me', () => {
    expect(page).toContain('const firmCurrency = useFirmCurrency()')
    expect(page).toContain("{ person: m.consultant.name ?? 'this person', firm: m.firm.name }, firmCurrency)")
  })

  it('the box shows the firm’s own sign and opens on whole units, never cents over a hundred', () => {
    expect(currencySign('VND')).toBe('₫')
    expect(currencySign('USD')).toBe('$')
    expect(typedFromMinor(170_000, 'VND')).toBe('170000')
    expect(typedFromMinor(9_000, 'USD')).toBe('90')
    expect(typedFromMinor(null, 'USD')).toBe('')
    expect(page).not.toContain('/ 100))')
    expect(page).not.toContain("'You bill $'")
  })
})
