import { describe, it, expect } from 'vitest'
import { WORLD_CLIENTS } from '@/lib/seed-world'
import { PROGRAMMES } from '@/lib/seed-programmes'

/**
 * Everybody seated at one seeded client can be told apart by name.
 *
 * A tester walking Northbend Athletic's approval chain on 2026-09-30 met
 * Dana Whitfield (the approver), Dana Whitlock (the program manager) and
 * Camille Whitford (the owner) on the same screens — "Waiting on Dana
 * Whitfield" on the card, "Waiting on Camille Whitford" on the page — and
 * could not follow who was waiting on whom. The chain was right; the
 * names made it unreadable. A demo is read by somebody who has never
 * seen it, and three near-identical names on one approval chain is a
 * puzzle, not a program.
 *
 * So at each client the owner, the approver and every program desk have
 * a first name nobody else there has, a last name nobody else there has,
 * and no two last names that open on the same four letters.
 */

function staffAt(slug: string): string[] {
  const client = WORLD_CLIENTS.find((c) => c.slug === slug)
  const program = PROGRAMMES.find((p) => p.client === slug)
  return [
    client?.owner,
    client?.vp,
    ...(program ? Object.values(program.people) : []),
  ].filter((n): n is string => !!n)
}

const first = (n: string) => n.split(' ')[0]
const last = (n: string) => n.split(' ').slice(-1)[0]

function clashes(names: string[], key: (n: string) => string): string[] {
  const seen = new Map<string, string>()
  const out: string[] = []
  for (const n of names) {
    const k = key(n).toLowerCase()
    const was = seen.get(k)
    if (was) out.push(`${was} and ${n}`)
    else seen.set(k, n)
  }
  return out
}

describe('Everybody seated at one seeded client has a name nobody else there shares', () => {
  it('reads the three program clients and their desks, rather than passing on an empty list', () => {
    for (const slug of ['nike', 'corning', 'terumo-bct']) {
      expect(staffAt(slug).length, slug).toBeGreaterThanOrEqual(8)
    }
  })

  for (const client of WORLD_CLIENTS) {
    it(`at ${client.name}, no two seated people share a first name`, () => {
      expect(clashes(staffAt(client.slug), first)).toEqual([])
    })

    it(`at ${client.name}, no two seated people share a last name, or a last name that opens on the same four letters`, () => {
      const names = staffAt(client.slug)
      expect(clashes(names, last)).toEqual([])
      expect(clashes(names, (n) => last(n).slice(0, 4))).toEqual([])
    })
  }

  it('Northbend Athletic’s owner, approver and program manager read as three different people', () => {
    const [owner, vp] = [WORLD_CLIENTS.find((c) => c.slug === 'nike')!.owner, WORLD_CLIENTS.find((c) => c.slug === 'nike')!.vp]
    const programme = PROGRAMMES.find((p) => p.client === 'nike')!.people.programme
    expect([owner, vp, programme]).toEqual(['Camille Ostrander', 'Dana Whitfield', 'Lorena Kellerman'])
  })
})
