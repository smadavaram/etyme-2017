/**
 * An ask about a company's Owners waits on one person's yes. It was on Ask
 * Etyme and on Settings → Owners and not on Today, so the number on the
 * mark and Today's list disagreed by one while it waited. GET
 * /api/decisions now carries it as a row of the one queue, and Ask Etyme
 * adds no row the queue already carries. One sentence each.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ownerAskRow, OWNER_ASK } from '@/app/api/decisions/owner-ask'
import { ownerAskItems, withOwnerAsks, type OwnerAsk } from '@/app/api/conversations/twin/owner-asks'
import { queueFrom, queueCards, namedNeedsSays } from '@/app/api/conversations/twin/ask'
import { todayRows } from '@/components/twin-conversation/today-decisions'
import { owedFrom } from '@/lib/owed-count'
import { deskHeadline } from '@/app/dashboard/program/needs-you'
import type { AddressedAsk } from '@/lib/owner-asks'
import type { Seat } from '@/lib/owner-rules'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-11-12T15:00:00Z')
const LATER = '2026-11-19T15:00:00.000Z'
const CO = 'Tapin'

const pass: AddressedAsk = {
  id: 'ask-pass', kind: 'PASS', companyId: 'co-tapin', companyName: CO, askedBy: 'Camille Ostrander',
  subject: 'Dev Patel', youAreSubject: true, reason: 'Dev runs the business day to day',
  becomes: 'Owner', canThen: '', says: '', waitsUntil: 'Nov 19, 2026', expiresAt: LATER,
  answerUrl: '/api/settings/owners/ask-pass', href: '/dashboard/settings/owners',
}
const passFacts = { askedById: 'p-camille', askerAfter: 'OWNER' as const, subjectContextId: 'c-dev', toRoleName: null }

// The same ask as Ask Etyme reads it, from its own reader.
const seats: Seat[] = [
  { contextId: 'c-camille', personId: 'p-camille', name: 'Camille Ostrander', roleName: 'Owner', live: true },
  { contextId: 'c-dev', personId: 'p-dev', name: 'Dev Patel', roleName: 'Admin', live: true },
]
const asConversation: OwnerAsk = {
  id: 'ask-pass', kind: 'PASS', askedById: 'p-camille', askerName: 'Camille Ostrander', askerAfter: 'OWNER',
  subjectContextId: 'c-dev', toRoleName: null, reason: 'Dev runs the business day to day', expiresAt: new Date(LATER),
}

const week = {
  type: 'TIMESHEET_APPROVAL', title: 'Approve timesheet — Helena Marsh', entityType: 'Timesheet', entityId: 't1',
  urgency: 'MEDIUM', named: { whose: 'Helena Marsh', what: 'week', whats: 'weeks' },
}

/** GET /api/decisions' body with the Owner ask in it, as the route writes it. */
function body() {
  const decisions = [ownerAskRow(pass, passFacts, 'p-dev', NOW), week]
  return { data: { decisions, total: decisions.length, says: deskHeadline(decisions as any).says } }
}

describe('an Owner ask is a row of the decision queue', () => {
  it('the person an Owner ask waits on finds it on the decision queue, counted in the total', () => {
    const b = body()
    expect(b.data.total).toBe(2)
    const row = b.data.decisions[0] as ReturnType<typeof ownerAskRow>
    expect(row.type).toBe(OWNER_ASK)
    expect(row.entityType).toBe('OwnershipRequest')
    expect(row.entityId).toBe('ask-pass')
    expect(row.actionUrl).toBe('/dashboard/settings/owners')
    expect(row.dueDate).toBe(LATER)
  })

  it('the row says who asks and what the yes does, in the words Ask Etyme’s card says', () => {
    const row = ownerAskRow(pass, passFacts, 'p-dev', NOW)
    const [card] = ownerAskItems([asConversation], seats, 'p-dev', CO)
    expect(row.title).toBe('Camille Ostrander asks you to take over as Owner of Tapin')
    expect(row.title).toBe(card.title)
    expect(row.subtitle).toBe(card.subtitle)
    expect(row.reason).toBe(card.reason)
  })

  it('the headline on Today names whose Owner ask it is', () => {
    expect(body().data.says).toMatch(/Camille Ostrander’s Owner ask/)
  })

  it('an Owner ask two days or less from lapsing is urgent', () => {
    expect(ownerAskRow(pass, passFacts, 'p-dev', new Date('2026-11-18T15:00:00Z')).urgency).toBe('HIGH')
    expect(ownerAskRow(pass, passFacts, 'p-dev', NOW).urgency).toBe('MEDIUM')
  })

  it('the route reads the asks through the one reader the Owners route reads', () => {
    const route = src('src/app/api/decisions/route.ts')
    expect(route).toContain('await asksAddressedTo(caller.person.id, companyId)')
    expect(route).toContain('decisions.push(ownerAskRow(a,')
  })
})

describe('the number on the Ask Etyme mark, the greeting and Today agree', () => {
  it('the mark, the greeting and Today’s rows all count the Owner ask once', () => {
    const b = body()
    const mark = owedFrom(b)
    // The greeting reads the queue, then adds Ask Etyme's own Owner asks, and adds nothing the queue carries.
    const greeting = withOwnerAsks(queueFrom(b), ownerAskItems([asConversation], seats, 'p-dev', CO))!
    const rows = todayRows(b).rows
    expect(mark).toBe(2)
    expect(greeting.total).toBe(2)
    expect(rows).toHaveLength(2)
    expect(namedNeedsSays(greeting, [])!.says).toMatch(/^Two things need you/)
  })

  it('Today’s row for an Owner ask says yes through POST /api/settings/owners/:id', () => {
    const [row] = queueCards(queueFrom(body())!)
    expect(row.type).toBe(OWNER_ASK)
    expect(row.act?.url).toBe('/api/settings/owners/ask-pass')
    expect(row.act?.body).toEqual({ decision: 'yes' })
  })
})

describe('a seat with no role reads the Owner ask waiting on it', () => {
  it('a seat with no role at all may read the decision queue, which answers it only what names it', async () => {
    const { desklessDoor } = await import('@/lib/deskless-door')
    const door = desklessDoor({ path: '/api/decisions', method: 'GET', contextType: 'EMPLOYEE', permissions: [], companyName: CO, companyKind: 'VENDOR' })
    expect(door.open).toBe(true)
    // Only a read opens: nothing the queue's writes do is a seat with no role's.
    expect(desklessDoor({ path: '/api/decisions', method: 'POST', contextType: 'EMPLOYEE', permissions: [], companyName: CO, companyKind: 'VENDOR' }).open).toBe(false)
  })

  it('the Owner ask is read for the caller by name, behind no permission, so a seat with no role is not told nothing needs it', () => {
    const route = src('src/app/api/decisions/route.ts')
    const at = route.indexOf('await asksAddressedTo(caller.person.id, companyId)')
    expect(at).toBeGreaterThan(0)
    // The block the ask is read in asks no permission of the caller.
    const block = route.slice(route.lastIndexOf('// ── 10.', at), at)
    expect(block).not.toMatch(/hasPermission|hasAnyPermission/)
  })
})

describe('Today’s row for an Owner ask has its own No, and is never part of Yes to all', () => {
  const fx = { ...week, entityId: 't2', named: { whose: 'Omar Haddad', what: 'week', whats: 'weeks' } }
  const many = () => {
    const decisions = [ownerAskRow(pass, passFacts, 'p-dev', NOW), week, fx]
    return { data: { decisions, total: decisions.length } }
  }

  it('Today’s row for an Owner ask has a No beside its Yes, through the same POST /api/settings/owners/:id', () => {
    const [row] = queueCards(queueFrom(body())!)
    expect(row.no?.label).toBe('No')
    expect(row.no?.url).toBe('/api/settings/owners/ask-pass')
    expect(row.no?.body).toEqual({ decision: 'no' })
  })

  it('Today draws the No beside the Yes and shows the route’s own sentence after the press', () => {
    const rows = src('src/components/twin-conversation/decision-rows.tsx')
    expect(rows).toContain('onClick={() => void one(card, card.no ?? null)}')
    expect(rows).toContain('body?.data?.message')
  })

  it('a batch with an Owner ask among its rows leaves the ask out and says so', async () => {
    const { batchOf, batchLeavesOut } = await import('@/components/twin-conversation/today-decisions')
    const rows = todayRows(many()).rows
    expect(rows).toHaveLength(3)
    const batch = batchOf(rows)
    expect(batch).not.toBeNull()
    expect(batch!.map((r) => r.type)).not.toContain(OWNER_ASK)
    expect(batch).toHaveLength(2)
    expect(batchLeavesOut(rows)).toBe('Yes to all leaves out the ask about your company’s Owners. Answer it on its own row.')
  })

  it('Yes to all is never offered where the only other row is an Owner ask, so a batch can never take over, remove or move an Owner', async () => {
    const { batchOf, batchLeavesOut } = await import('@/components/twin-conversation/today-decisions')
    const rows = todayRows(body()).rows
    expect(rows).toHaveLength(2)
    expect(batchOf(rows)).toBeNull()
    expect(batchLeavesOut(rows)).toBeNull()
  })
})
