/**
 * The screen walk on df3074094 said do not ship: a person asked to take
 * over a company's ownership, or a second Owner asked to agree to removing
 * or moving an Owner, had no Yes anywhere. Ask Etyme now names the ask
 * first, by name, as a card whose Yes is the Owners route's own; the Owner
 * who asked reads that it waits on somebody else; and an Admin whose two
 * proofs stand is told where Become Owner is. One sentence each.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  askedOfMe, askedByMe, ownerAskItems, ownerAskLead, withOwnerAsks, waitingOnOthersSays, becomeOwnerSays, ownerAsksHeadline,
  OWNER_ASK, type OwnerAsk,
} from '@/app/api/conversations/twin/owner-asks'
import { queueCards, namedNeedsSays, today, type Readers, type QueueRead } from '@/app/api/conversations/twin/ask'
import { proofStanding } from '@/lib/owner-proof'
import type { Seat } from '@/lib/owner-rules'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-11-12T15:00:00Z')
const LATER = new Date('2026-11-19T15:00:00Z')
const CO = 'Northbend Athletic'

const camille: Seat = { contextId: 'c-camille', personId: 'p-camille', name: 'Camille Ostrander', roleName: 'Owner', live: true }
const dev: Seat = { contextId: 'c-dev', personId: 'p-dev', name: 'Dev Patel', roleName: 'Admin', live: true }
const ana: Seat = { contextId: 'c-ana', personId: 'p-ana', name: 'Ana Ruiz', roleName: 'Owner', live: true }
const ben: Seat = { contextId: 'c-ben', personId: 'p-ben', name: 'Ben Ho', roleName: 'Owner', live: true }
const seats = [camille, dev, ana, ben]

const pass = (after: OwnerAsk['askerAfter'] = 'OWNER'): OwnerAsk => ({
  id: 'ask-pass', kind: 'PASS', askedById: 'p-camille', askerName: 'Camille Ostrander', askerAfter: after,
  subjectContextId: 'c-dev', toRoleName: null, reason: 'Dev runs the business day to day', expiresAt: LATER,
})
const removeBen: OwnerAsk = {
  id: 'ask-remove', kind: 'REMOVE', askedById: 'p-camille', askerName: 'Camille Ostrander', askerAfter: null,
  subjectContextId: 'c-ben', toRoleName: null, reason: 'Ben left the company', expiresAt: LATER,
}
const demoteAna: OwnerAsk = { ...removeBen, id: 'ask-demote', kind: 'DEMOTE', subjectContextId: 'c-ana', toRoleName: 'Admin', reason: 'Ana runs people and settings now' }

const emptyRead = (): Readers => ({
  waiting: vi.fn(async () => []), othersWaiting: vi.fn(async () => []), told: vi.fn(async () => ({ told: [], stale: [] })),
  limits: vi.fn(async () => ({ ok: true as const, entries: [] })),
  spendIn: vi.fn(async () => ({ ok: true as const, receipts: [], undated: 0 })),
}) as unknown as Readers

describe('who an Owner ask is addressed to', () => {
  it('a pass is addressed to the person taking over and to nobody else', () => {
    expect(askedOfMe([pass()], seats, 'p-dev', NOW).map((a) => a.id)).toEqual(['ask-pass'])
    expect(askedOfMe([pass()], seats, 'p-ana', NOW)).toEqual([])
    expect(askedOfMe([pass()], seats, 'p-camille', NOW)).toEqual([])
  })

  it('removing an Owner is addressed to every Owner who did not ask, the Owner being removed included', () => {
    expect(askedOfMe([removeBen], seats, 'p-ana', NOW)).toHaveLength(1)
    expect(askedOfMe([removeBen], seats, 'p-ben', NOW)).toHaveLength(1)
    expect(askedOfMe([removeBen], seats, 'p-camille', NOW)).toEqual([])
    expect(askedOfMe([removeBen], seats, 'p-dev', NOW)).toEqual([])
  })

  it('an ask past its seven days is addressed to nobody and waits on nobody', () => {
    const old = { ...pass(), expiresAt: new Date('2026-11-01T00:00:00Z') }
    expect(askedOfMe([old], seats, 'p-dev', NOW)).toEqual([])
    expect(askedByMe([old], 'p-camille', NOW)).toEqual([])
  })
})

describe('the person asked reads the ask first, by name, in the trade’s words', () => {
  it('Dev Patel reads “Camille Ostrander asks you to take over as Owner of Northbend Athletic. After your yes you are an Owner and Camille Ostrander stays an Owner.”', () => {
    const lead = ownerAskLead(ownerAskItems([pass('OWNER')], seats, 'p-dev', CO))
    expect(lead?.says).toBe('Camille Ostrander asks you to take over as Owner of Northbend Athletic. After your yes you are an Owner and Camille Ostrander stays an Owner. Answer below, or on Owners.')
  })

  it('what the asker becomes is read from the ask’s own fields: an Admin, or leaving', () => {
    expect(ownerAskItems([pass('ADMIN')], seats, 'p-dev', CO)[0].subtitle).toBe('After your yes you are an Owner and Camille Ostrander becomes an Admin.')
    expect(ownerAskItems([pass('LEAVE')], seats, 'p-dev', CO)[0].subtitle).toBe('After your yes you are an Owner and Camille Ostrander leaves Northbend Athletic.')
  })

  it('an Owner being removed reads the ask about themselves in the second person', () => {
    const [row] = ownerAskItems([removeBen], seats, 'p-ben', CO)
    expect(row.title).toBe('Camille Ostrander asks to remove you as an Owner of Northbend Athletic')
    expect(row.subtitle).toBe('After your yes your seat at Northbend Athletic ends. Everything you did stays under your name.')
  })

  it('a second Owner reads a move by the name of the Owner moved and the role they move to', () => {
    const [row] = ownerAskItems([demoteAna], seats, 'p-ben', CO)
    expect(row.title).toBe('Camille Ostrander asks to move Ana Ruiz from Owner to Admin at Northbend Athletic')
    expect(row.subtitle).toBe('After your yes Ana Ruiz is an Admin and no longer an Owner.')
  })

  it('the headline names the Owner ask before every other decision', () => {
    const q: QueueRead = { total: 1, items: [{ type: 'TIMESHEET_APPROVAL', entityId: 't1', title: 'Approve timesheet — Helena Marsh' }] }
    const merged = withOwnerAsks(q, ownerAskItems([pass()], seats, 'p-dev', CO))!
    expect(merged.total).toBe(2)
    expect(merged.items[0].type).toBe(OWNER_ASK)
    expect(namedNeedsSays(merged, [])!.says).toMatch(/^Two things need you: Camille Ostrander asks you to take over as Owner of Northbend Athletic;/)
  })

  it('the greeting leads with the Owner ask as its recommendation', async () => {
    const lead = ownerAskLead(ownerAskItems([pass()], seats, 'p-dev', CO))
    const a = await today(emptyRead(), { now: NOW, greeting: true, owners: { ask: lead } })
    if (a.kind !== 'NEEDS') throw new Error(a.kind)
    expect(a.recommend?.says).toMatch(/^Camille Ostrander asks you to take over as Owner of Northbend Athletic\./)
  })
})

describe('the card: Yes and Not now, the why on tap, the Owners route’s own yes', () => {
  const card = () => queueCards({ total: 1, items: ownerAskItems([pass()], seats, 'p-dev', CO) })[0]

  it('Yes posts { decision: yes } to POST /api/settings/owners/:id, never to the twin’s approval route', () => {
    const c = card()
    expect(c.act).toEqual({ label: 'Yes', url: '/api/settings/owners/ask-pass', body: { decision: 'yes' }, done: 'Answered yes, and recorded under your name.' })
    expect(c.act!.url).not.toMatch(/\/api\/twin\//)
  })

  it('the card says what the yes does, and why this person is asked is one tap away with the reason and the day it lapses', () => {
    const c = card()
    expect(c.title).toBe('Camille Ostrander asks you to take over as Owner of Northbend Athletic.')
    expect(c.fact).toBe('After your yes you are an Owner and Camille Ostrander stays an Owner.')
    expect(c.why).toMatch(/^Only the person taking over says yes, so nobody becomes an Owner by surprise\. Camille Ostrander’s reason: “Dev runs the business day to day\.” It waits until Nov 19, 2026; with no answer it lapses and nothing changes\.$/)
  })

  it('the screen draws the why under the card and, once answered, shows the route’s own sentence in place of the buttons', () => {
    const view = src('src/app/dashboard/conversations/ask-etyme.tsx')
    expect(view).toContain('card.why &&')
    expect(view).toContain('Why you?')
    // The route's own sentence (data.message) over the card's fallback.
    expect(view).toContain("typeof body?.data?.message === 'string' ? body.data.message")
    expect(view).toMatch(/\{done\.state === 'DONE' \? 'Done' : 'Kept waiting'\}/)
  })

  it('the yes route answers in a sentence the card can show: data.message', () => {
    expect(src('src/app/api/settings/owners/[id]/route.ts')).toMatch(/NextResponse\.json\(\{ data: \{ message: says \} \}\)/)
  })
})

describe('the mark and the greeting agree', () => {
  it('an Owner ask is a row of the one queue the mark counts, added once', () => {
    const asks = ownerAskItems([pass()], seats, 'p-dev', CO)
    const once = withOwnerAsks({ total: 0, items: [] }, asks)!
    expect(once.total).toBe(1)
    expect(withOwnerAsks(once, asks)).toBe(once)
  })

  it('a queue that could not be read stays unread rather than counting the ask alone', () => {
    expect(withOwnerAsks(null, ownerAskItems([pass()], seats, 'p-dev', CO))).toBeNull()
  })

  it('a seat whose firm hat holds nothing else still counts and reads its Owner ask', () => {
    const route = src('src/app/api/conversations/twin/route.ts')
    expect(route).toMatch(/inFirmHatWithNothing\(caller, request\)\)\) \{\s*return NextResponse\.json\(\{ data: \{ total: \(await ownerAsksOf\(caller\)\)\.items\.length \} \}\)/)
    expect(ownerAsksHeadline(1)).toBe('One thing needs you: the Owner ask below.')
  })

  it('the queue the greeting and the mark read carries the Owner asks', () => {
    expect(src('src/app/api/conversations/twin/route.ts')).toMatch(/withOwnerAsks\(withFirmAsks\(/)
  })
})

describe('the Owner who asked reads that it waits on somebody else, once, never as something she owes', () => {
  it('Camille reads her pass as waiting on Dev Patel’s yes', () => {
    expect(waitingOnOthersSays([pass()], seats, 'p-camille', CO)?.says).toBe(
      'Your ask that Dev Patel take over as Owner waits on Dev Patel’s yes. Nothing at Northbend Athletic changes until then, and it lapses after seven days with no answer.')
  })

  it('a removal waits on the yes of every Owner who did not ask, by name', () => {
    expect(waitingOnOthersSays([removeBen], seats, 'p-camille', CO)?.says).toMatch(/^Your ask to remove Ben Ho as an Owner waits on the yes of Ana Ruiz or Ben Ho\./)
  })

  it('two asks are one line', () => {
    const line = waitingOnOthersSays([pass(), demoteAna], seats, 'p-camille', CO)!
    expect(line.says.split('. Nothing at')[0]).toBe('Your ask that Dev Patel take over as Owner waits on Dev Patel’s yes; your ask to move Ana Ruiz from Owner to Admin waits on the yes of Ana Ruiz or Ben Ho')
  })

  it('the asker’s line is a fact in the greeting, not the recommendation and not counted', async () => {
    const waiting = waitingOnOthersSays([pass()], seats, 'p-camille', CO)
    const a = await today(emptyRead(), { now: NOW, greeting: true, needs: async () => 0, owners: { waiting } })
    if (a.kind !== 'NEEDS') throw new Error(a.kind)
    expect(a.recommend).toBeUndefined()
    expect(a.says).toMatch(/^Nothing needs you today/)
    expect((a.more ?? []).filter((l) => l.says === waiting!.says)).toHaveLength(1)
    expect(a.queue ?? []).toEqual([])
  })
})

describe('Become Owner, for an Admin whose two proofs stand', () => {
  const both = proofStanding({ kind: 'VENDOR', dnsDomain: 'northbend.example', directory: null, person: { provider: 'Persona', reference: 'R-1', checkedOn: null, result: 'clear' } })
  const gate = { ownerProofRequiredAt: new Date('2026-11-12'), ownerVerifiedAt: null }

  it('is one line with its link to Setup → Prove ownership', () => {
    const line = becomeOwnerSays({ gate, standing: both, seatRole: 'Admin', seatLive: true, liveOwners: 0, companyName: 'Tapin' })
    expect(line).toEqual({
      says: 'Both your proofs stand, so you can become Tapin’s Owner. Press Become Owner under Setup → Prove ownership.',
      links: [{ text: 'Setup → Prove ownership', href: '/dashboard/settings/setup/ownership' }],
    })
  })

  it('is not offered while a proof is still to come, to an Owner, or where the company already has an Owner', () => {
    const half = proofStanding({ kind: 'VENDOR', dnsDomain: 'northbend.example', directory: null, person: null })
    expect(becomeOwnerSays({ gate, standing: half, seatRole: 'Admin', seatLive: true, liveOwners: 0, companyName: 'Tapin' })).toBeNull()
    expect(becomeOwnerSays({ gate, standing: both, seatRole: 'Owner', seatLive: true, liveOwners: 1, companyName: 'Tapin' })).toBeNull()
    expect(becomeOwnerSays({ gate, standing: both, seatRole: 'Admin', seatLive: true, liveOwners: 1, companyName: 'Tapin' })).toBeNull()
  })
})
