import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { todayReads, SEND_BILL_PERMISSION } from '@/lib/today-page'
import { rolesFor } from '@/lib/company-defaults'

/**
 * Today's Send on a drafted bill reads the send route's own permission.
 *
 * Found by the second production walk (2026-10-26): Brightmoor's Owner saw
 * Send on Today and it sent, while Ask Etyme said the bill was not theirs
 * to send. The route is the authority: it asks for `invoices.issue`, the
 * Owner holds it, so the Owner may send. The screen now reads that answer
 * from `/api/today`, computed from the caller's seat, and this file fails
 * if the route ever asks for something else.
 */

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/invoices/[id]/submit/route.ts'), 'utf8')
const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8')
const role = (name: string) => rolesFor('VENDOR').find((r) => r.name === name)!.permissions

describe('Send on Today', () => {
  it('Today offers Send on a bill only to a seat the send route would let send it', () => {
    // The route's gate, read off its source: the one permission it refuses on.
    const gates = [...ROUTE.matchAll(/hasPermission\(caller\.permissions, '([a-z.]+)'\)/g)].map((m) => m[1])
    expect(gates).toEqual([SEND_BILL_PERMISSION])

    // Every supplier desk: Send is drawn exactly where the route's gate lets it through.
    for (const r of rolesFor('VENDOR')) {
      expect({ role: r.name, send: todayReads(r.permissions, 'VENDOR').send })
        .toEqual({ role: r.name, send: r.permissions.includes(SEND_BILL_PERMISSION) })
    }
    expect(todayReads(role('Owner'), 'VENDOR').send).toBe(true)
    expect(todayReads(role('Accounts Receivable'), 'VENDOR').send).toBe(true)
    expect(todayReads(role('Account Manager'), 'VENDOR').send).toBe(false)
    expect(todayReads(role('AP & Payroll'), 'VENDOR').send).toBe(false)
    expect(todayReads(null).send).toBe(false)

    // The page draws Send from the route's answer, not from its own session.
    expect(PAGE).toContain('t.reads.send')
    expect(PAGE).not.toMatch(/hasPermission\([^)]*'invoices\.issue'\)/)
  })
})
