import { describe, it, expect } from 'vitest'
import { getNavForKind } from '@/components/shell/sidebar'
import { pendingTermsHref } from '@/lib/your-terms'

/**
 * A person whose placement waits on their own terms can find the page
 * from the menu, not only from the notification that first named it.
 */

const HREF = '/dashboard/submissions/sub-1/terms'
const you = (sections: { label: string; items: { label: string; href: string }[] }[]) =>
  sections.find((s) => s.label === 'You')

describe('"Your terms" under You', () => {
  it('a consultant with a placement waiting on terms reads "Your terms" right after "Your work"', () => {
    const items = you(getNavForKind(null, true, { termsHref: HREF }))!.items
    expect(items[0].label).toBe('Your work')
    expect(items[1]).toMatchObject({ label: 'Your terms', href: HREF })
  })

  it('a firm’s own employee who is also the worker reads it in the You section after the firm’s menu', () => {
    const menu = getNavForKind('GSI', false, { worker: true, termsHref: HREF })
    expect(menu[menu.length - 1].label).toBe('You')
    expect(you(menu)!.items.map((i) => i.label)).toContain('Your terms')
  })

  it('nobody reads "Your terms" once nothing waits on them', () => {
    const items = you(getNavForKind(null, true, {}))!.items
    expect(items.map((i) => i.label)).not.toContain('Your terms')
  })

  it('a firm’s staff who are not the worker are never offered somebody’s terms', () => {
    const menu = getNavForKind('VENDOR', false, { worker: false, termsHref: HREF })
    expect(JSON.stringify(menu)).not.toContain('Your terms')
  })

  it('the You section stays at seven links or fewer with "Your terms" in it', () => {
    expect(you(getNavForKind(null, true, { termsHref: HREF }))!.items.length).toBeLessThanOrEqual(7)
  })
})

describe('which placement the link opens', () => {
  const subs = [
    { id: 'old', fromCompanyId: 'brightmoor', requirementId: 'r1' },
    { id: 'new', fromCompanyId: 'techpeple', requirementId: 'r2' },
  ]

  it('the link opens the first placement whose line has not started and whose terms are not on record', () => {
    const lines = [
      { id: 'L1', companyId: 'brightmoor', requirementId: 'r1', state: 'DRAFT' },
      { id: 'L2', companyId: 'techpeple', requirementId: 'r2', state: 'DRAFT' },
    ]
    expect(pendingTermsHref(subs, lines, (id) => id === 'L1')).toBe('/dashboard/submissions/new/terms')
  })

  it('a placement already on site is never offered as terms pending, whatever its paper says', () => {
    const lines = [{ id: 'L1', companyId: 'brightmoor', requirementId: 'r1', state: 'IN_PROGRESS' }]
    expect(pendingTermsHref(subs, lines, () => false)).toBeNull()
  })

  it('a placement whose terms nobody could read is not offered — no link is better than a wrong one', () => {
    const lines = [{ id: 'L1', companyId: 'brightmoor', requirementId: 'r1', state: 'DRAFT' }]
    expect(pendingTermsHref(subs, lines, () => undefined)).toBeNull()
  })
})
