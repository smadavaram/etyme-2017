import { describe, it, expect } from 'vitest'
import { menuOf } from '@/app/api/conversations/twin/ask'
import { menuHrefs } from '@/app/dashboard/decisions/chips'
import { sectionOfHref } from '@/lib/page-framing'

/**
 * Every reader of the menu reads the plugins (record 120): Ask Etyme,
 * the filter chips and the eyebrow over a page all say Training for a firm
 * with Train to bench on, and none of them says it otherwise.
 */

const TRAINING = '/dashboard/training'
const hrefsOf = (m: ReturnType<typeof menuOf>) => (m as any as { items: { href: string }[] }[]).flatMap((s) => s.items).map((i) => i.href)

describe('the Training page on every menu a firm reads', () => {
  it('Ask Etyme offers Training to a firm with Train to bench on', () => {
    expect(hrefsOf(menuOf({ companyKind: 'VENDOR', permissions: null, plugins: ['TRAIN_TO_BENCH'] }))).toContain(TRAINING)
  })
  it('Ask Etyme offers no Training to a firm with the plugin off', () => {
    expect(hrefsOf(menuOf({ companyKind: 'VENDOR', permissions: null }))).not.toContain(TRAINING)
    expect(hrefsOf(menuOf({ companyKind: 'VENDOR', permissions: null, plugins: [] }))).not.toContain(TRAINING)
  })
  it('the decision chips read Training on the menu only while the plugin is on', () => {
    expect(menuHrefs({ kind: 'VENDOR', isConsultant: false, permissions: null, plugins: ['TRAIN_TO_BENCH'] }).has(TRAINING)).toBe(true)
    expect(menuHrefs({ kind: 'VENDOR', isConsultant: false, permissions: null }).has(TRAINING)).toBe(false)
  })
  it('the heading over the Training page is read from the same menu, so it names a section only while the plugin is on', () => {
    expect(sectionOfHref('VENDOR', TRAINING, null, { permissions: null, plugins: ['TRAIN_TO_BENCH'] })).not.toBeNull()
    expect(sectionOfHref('VENDOR', TRAINING, null, { permissions: null })).toBeNull()
  })
})
