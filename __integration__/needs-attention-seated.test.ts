import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, freshWorld } from './harness'
import { GET as decisionsRoute } from '@/app/api/decisions/route'
import { GET as programPage } from '@/app/api/program/route'
import { GET as greet } from '@/app/api/conversations/twin/route'
import { decisionsAddress } from '@/app/dashboard/decisions/chips'

/**
 * Needs attention for a firm seated in a client's program (the second
 * production walk, 2026-10-26): Aptiva, seated at Cavanaugh Glassworks,
 * read Ruben Ortega's week at Harlow Health — its own book — on Needs
 * attention, while the chat and the program page showed Cavanaugh's queue.
 */

const D = '@demo.etyme.local'
const APTIVA = `world-aptiva${D}`
const CAVANAUGH_PM = `world-corning-programme${D}`

const keyOf = (r: any) => `${r.type}:${r.entityId}`
const says = (r: any) => `${r.title ?? ''} ${r.subtitle ?? ''} ${r.named?.whose ?? ''}`
const read = async (url: string) => json((await decisionsRoute(req('GET', url)))!)

describe('Needs attention, for a seat in a client’s program', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 240_000)

  it('Needs attention always asks for the program, and forwards the program a page picked', () => {
    expect(decisionsAddress('')).toBe('/api/decisions?in=program')
    expect(decisionsAddress('?clientCompanyId=c1&type=x')).toBe('/api/decisions?in=program&clientCompanyId=c1')
  })

  it('an MSP seated in a client’s program reads that program’s queue on Needs attention, and never its own book', async () => {
    as(APTIVA)
    // The walk's case must be on the seed, or this sentence proves nothing:
    // Aptiva's own book has Ruben Ortega's week at Harlow Health in it.
    const own = await read('/api/decisions?in=own')
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    expect(own.body.data.decisions.some((r: any) => says(r).includes('Ruben Ortega')), 'Ruben Ortega on Aptiva’s own book').toBe(true)

    const page = await json((await programPage(req('GET', '/api/program')))!)
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.data.seated).toBe(true)
    const rows: any[] = page.body.data.programQueue ?? []
    expect(rows.length, 'something in Cavanaugh’s program needs the seat').toBeGreaterThan(0)

    const needs = await read('/api/decisions?in=program')
    expect(needs.status, JSON.stringify(needs.body)).toBe(200)
    const got: any[] = needs.body.data.decisions
    expect(got.map(keyOf).sort()).toEqual(rows.map(keyOf).sort())
    for (const r of got) {
      expect(says(r)).not.toContain('Ruben Ortega')
      expect(says(r)).not.toContain('Harlow')
    }
    expect(needs.body.data.reading).toMatchObject({ seated: true, clientName: page.body.data.client.name })
    const counted = Object.values(needs.body.data.counts as Record<string, number>).reduce((a, b) => a + b, 0)
    expect(counted).toBe(got.length)
  })

  it('a seated MSP that asks for its queue without saying which reads the program\u2019s queue, never its own book', async () => {
    as(APTIVA)
    const bare = await read('/api/decisions')
    expect(bare.status, JSON.stringify(bare.body)).toBe(200)
    const program = await read('/api/decisions?in=program')
    expect(bare.body.data.decisions.map(keyOf).sort()).toEqual(program.body.data.decisions.map(keyOf).sort())
    expect(bare.body.data.reading.seated).toBe(true)
    for (const r of bare.body.data.decisions) expect(says(r)).not.toContain('Ruben Ortega')
  })

  it('Needs attention, the program page and the Ask Etyme mark give a seated MSP one number', async () => {
    as(APTIVA)
    const needs = await read('/api/decisions?in=program')
    const page = await json((await programPage(req('GET', '/api/program')))!)
    const mark = await json(await greet(req('GET', '/api/conversations/twin?only=owed')))
    expect(mark.status, JSON.stringify(mark.body)).toBe(200)
    expect(needs.body.data.total).toBe(page.body.data.programQueue.length)
    expect(needs.body.data.total).toBe(mark.body.data.total)
  })

  it('a client’s own seat reads its own queue on Needs attention, the same as before', async () => {
    as(CAVANAUGH_PM)
    const plain = await read('/api/decisions')
    const asked = await read('/api/decisions?in=program')
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(asked.body.data.decisions.map(keyOf)).toEqual(plain.body.data.decisions.map(keyOf))
    expect(asked.body.data.reading.seated).toBe(false)
  })
})
