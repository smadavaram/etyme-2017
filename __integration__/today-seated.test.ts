import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, freshWorld } from './harness'
import { GET as decisionsRoute } from '@/app/api/decisions/route'
import { GET as todayRoute } from '@/app/api/today/route'
import { GET as greet } from '@/app/api/conversations/twin/route'
import { decisionsAddress } from '@/app/dashboard/decisions/chips'

/**
 * Today for a firm seated in a client's program (decided 2026-10-26, the
 * second production walk; reversible by the founder in a sentence): the
 * whole session is in that program. Today's headline is the program's
 * queue, the number the mark and the chat carry, and the firm's own book
 * is read only by a seat at home.
 */

const D = '@demo.etyme.local'
const APTIVA = `world-aptiva${D}`
const BRIGHTMOOR = `world-brightmoor${D}`

describe('Today, for a seat in a client’s program', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 240_000)

  it('an MSP seated in a client’s program reads one number on Today, on the mark and in the chat', async () => {
    as(APTIVA)
    // Today's headline reads the address Today asks: Needs attention's own.
    const queue = await json((await decisionsRoute(req('GET', decisionsAddress(''))))!)
    expect(queue.status, JSON.stringify(queue.body)).toBe(200)
    expect(queue.body.data.reading.seated).toBe(true)

    const today = await json((await todayRoute(req('GET', '/api/today')))!)
    expect(today.status, JSON.stringify(today.body)).toBe(200)
    expect(today.body.data.seated).toEqual({ clientName: queue.body.data.reading.clientName })
    // Nothing of Aptiva's own book is read beside the program's queue.
    for (const part of ['billing', 'signed', 'rollingOff', 'bench', 'whoIsWhere', 'unpaid']) {
      expect(today.body.data[part], part).toBeNull()
    }
    expect(JSON.stringify(today.body)).not.toContain('Ruben Ortega')

    const mark = await json(await greet(req('GET', '/api/conversations/twin?only=owed')))
    expect(mark.status, JSON.stringify(mark.body)).toBe(200)
    expect(queue.body.data.decisions.length).toBe(mark.body.data.total)
    expect(queue.body.data.total).toBe(mark.body.data.total)

    // The chat's greeting names the same rows, so it counts the same number;
    // its wording is the chat's own.
    const chat = await json(await greet(req('GET', '/api/conversations/twin')))
    expect(chat.status, JSON.stringify(chat.body)).toBe(200)
    const cards: any[] = chat.body.data.answer.queue ?? []
    expect(cards.map((c) => c.key).sort()).toEqual(queue.body.data.decisions.map((r: any) => `${r.type}:${r.entityId}`).sort())
  })

  it('a firm with no seat in any program reads its own book on Today, as before', async () => {
    as(BRIGHTMOOR)
    const today = await json((await todayRoute(req('GET', '/api/today')))!)
    expect(today.status, JSON.stringify(today.body)).toBe(200)
    expect(today.body.data.seated).toBeNull()
    expect(today.body.data.signed).not.toBeNull()
  })
})
