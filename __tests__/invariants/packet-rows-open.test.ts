import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { itemStateSays, resendPlan, RESEND_OPEN_DAYS } from '@/lib/document-stages/packet-resend'

/**
 * Document requests, after the founder's tester, 2026-11-03: a row did
 * nothing when clicked, showed no link, and a request stuck at 0 of 3
 * could not be opened or sent again in the app.
 */

const ON = new Date('2026-11-03T12:00:00Z')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const stuck = {
  label: 'W-2 start papers',
  expiresAt: new Date('2026-10-20T00:00:00Z'),
  completedAt: null,
  cancelledAt: null,
  items: [
    { label: 'I-9 and E-Verify', required: true, state: 'PENDING' },
    { label: 'Background check', required: true, state: 'PENDING' },
    { label: 'Signed non-disclosure agreement', required: true, state: 'REJECTED' },
  ],
}

describe('a packet row', () => {
  it('a packet row opens its packet and shows its link', () => {
    const page = read('src/app/dashboard/packets/page.tsx')
    expect(page).toContain('aria-expanded={opened === p.id}')
    expect(page).toContain('itemStateSays(i.state, i.required)')
    expect(page).toContain('Their link:')
    const route = read('src/app/api/packets/route.ts')
    expect(route).toContain('link: showsLinks ? `/packet/${p.token}` : null')
    expect(itemStateSays('PENDING', true)).toBe('Not sent yet')
    expect(itemStateSays('RECEIVED', true)).toBe('Arrived, waiting for your look')
    expect(itemStateSays('REJECTED', true)).toBe('Sent back, asked for again')
  })

  it('a stuck packet can be sent again from the page', () => {
    const plan = resendPlan(stuck, ON)
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.expiresAt.getTime()).toBe(ON.getTime() + RESEND_OPEN_DAYS * 86_400_000)
      expect(plan.waitingOn).toBe('I-9 and E-Verify, Background check and Signed non-disclosure agreement')
    }
    expect(read('src/app/dashboard/packets/page.tsx')).toContain('/resend`, { method: \'POST\' }')
  })

  it('a link still open keeps its own last day when sent again', () => {
    const plan = resendPlan({ ...stuck, expiresAt: new Date('2026-11-20T00:00:00Z') }, ON)
    expect(plan.ok && plan.expiresAt.toISOString().slice(0, 10)).toBe('2026-11-20')
  })

  it('a request that is finished, called off, or has nothing still owed is not sent again, and says why', () => {
    const done = resendPlan({ ...stuck, completedAt: ON }, ON)
    expect(!done.ok && done.message).toMatch(/has arrived, so there is nothing to chase/)
    const off = resendPlan({ ...stuck, cancelledAt: ON }, ON)
    expect(!off.ok && off.message).toMatch(/called off/)
    const waiting = resendPlan({ ...stuck, items: stuck.items.map((i) => ({ ...i, state: 'RECEIVED' })) }, ON)
    expect(!waiting.ok && waiting.code).toBe('NOTHING_OWED')
  })
})
