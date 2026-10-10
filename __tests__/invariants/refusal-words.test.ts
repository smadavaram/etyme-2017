import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { refusalSentence, namesAPermission } from '@/lib/refusal-words'

/**
 * A refusal names the desk the page is for, never a permission code.
 * The demo testers read "You need consultants.read permission" on
 * 2026-10-03; some routes still answer "Requires invoices.issue
 * permission". The shared shell pieces say it as a sentence instead.
 */
const CODE = /\b[a-z]+\.(read|write|manage|issue|run|approve|cost|create|record)\b/

describe('a refusal names the desk the page is for, never a permission code', () => {
  it('a refusal names the desk the page is for, never a permission code', () => {
    const said = refusalSentence('You need consultants.read permission', { kind: 'GSI', company: 'Teleworld Solutions' })
    expect(said).not.toMatch(CODE)
    expect(said).toMatch(/^This page is for the .+ desk at Teleworld Solutions\. Ask your company’s owner if you need it\.$/)
  })

  it('a route that refuses with "Requires invoices.issue permission" is read as the desk that bills', () => {
    const said = refusalSentence('Requires invoices.issue permission', { kind: 'VENDOR', what: 'This' })
    expect(said).not.toMatch(CODE)
    expect(said).toMatch(/^This is for the .*Accounts Receivable.* desk\./)
  })

  it('a refusal that is already a sentence is shown in the route’s own words, untouched', () => {
    const s = 'The bench at Teleworld Solutions is read by the desks that work with consultants. Ask whoever manages roles there.'
    expect(refusalSentence(s, { kind: 'GSI' })).toBe(s)
  })

  it('without the reader’s kind of company no desk is named, and the sentence still carries no code', () => {
    const said = refusalSentence('payroll.read permission required')
    expect(said).toBe('This page is not part of your seat. Ask your company’s owner if you need it.')
  })

  it('a word that only looks like a key is not mistaken for one', () => {
    expect(namesAPermission('Paid on invoices.reading day')).toBe(false)
    expect(namesAPermission('Seeing the carry needs payroll.run')).toBe(true)
  })

  it('the shared form saver, the dashboard and the placement page pass a route’s message through it before showing it', () => {
    for (const f of ['src/lib/form-save.ts', 'src/app/dashboard/page.tsx', 'src/app/dashboard/placements/[id]/page.tsx', 'src/app/dashboard/companies/page.tsx']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).toContain('refusalSentence(')
    }
  })
})
