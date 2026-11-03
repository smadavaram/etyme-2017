import { describe, it, expect } from 'vitest'
import { today, type Readers, type OtherWaiting } from '@/app/api/conversations/twin/ask'
import { setupLineFor } from '@/app/api/conversations/twin/first-act'

/**
 * Release walk three, 2026-11-03: Brightmoor's checklist read "9 done · 0
 * skipped · 2 to do" and the walker found no setup line in the Owner's
 * greeting. It was there, after who else is asked and what is billing,
 * below the first screen. It now comes first under the headline.
 */
const REMINDER = { says: 'Finish setting up: your domain, integrations.', href: '/dashboard/settings/setup', link: 'Complete setup', owed: ['DOMAIN', 'INTEGRATIONS'] }
const marisa: OtherWaiting = { title: 'Jonas Whitaker for HCM integration lead', noun: 'question', desks: ['Recruiter'], own: true, href: '/dashboard/twin', people: ['Marisa Delacroix'] }
function readers(): Readers {
  return {
    waiting: async () => [], othersWaiting: async () => [marisa, { ...marisa, title: 'Delphine Delacroix for Cybersecurity analyst' }],
    limits: async () => ({ ok: true as const, entries: [] }), told: async () => ({ told: [], stale: [] }),
    spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
  } as unknown as Readers
}

describe('the Owner’s greeting names the unfinished setup items first', () => {
  it('the setup line names the two items still owed and Complete setup, as the first line under the headline', async () => {
    const g = await today(readers(), { greeting: true, party: 'FIRM', setup: setupLineFor(REMINDER), model: 'OFF' })
    if (g.kind !== 'NEEDS') throw new Error('expected a greeting')
    expect(g.more?.[0]).toEqual({ says: 'Finish setting up: your domain, integrations. Complete setup.', links: [{ text: 'Complete setup', href: '/dashboard/settings/setup' }] })
    // Who else is asked still follows it.
    expect(g.more?.[1]?.says).toMatch(/^Marisa Delacroix, recruiter, has two questions/)
  })

  it('the setup line is said once, and never in the headline', async () => {
    const g = await today(readers(), { greeting: true, party: 'FIRM', setup: setupLineFor(REMINDER), needs: async () => 0, model: 'OFF' })
    if (g.kind !== 'NEEDS') throw new Error('expected a greeting')
    expect((g.more ?? []).filter((l) => l.says.startsWith('Finish setting up:'))).toHaveLength(1)
    expect(g.says).not.toContain('Finish setting up')
  })
})
