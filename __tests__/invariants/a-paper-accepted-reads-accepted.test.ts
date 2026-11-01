import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { keptPaperSays } from '@/lib/document-stages/own-papers'
import { audienceWord, AUDIENCE_WORDS } from '@/lib/document-request'

/**
 * The second Tapin walk, 2026-10-30: Brightmoor accepted Tapin's
 * insurance, the award cleared on it, and Tapin's own Company paperwork
 * still read "On file, not examined" while Brightmoor's request to Tapin
 * for the same certificate went on asking. One examination, one answer,
 * on both sides.
 */

const DB = vi.hoisted(() => ({
  items: [] as { id: string; packetId: string; key: string; state: string; required: boolean; verificationId?: string | null; reviewNote?: string | null }[],
  packets: [] as { id: string; companyId: string; subjectCompanyId: string; cancelledAt: Date | null; completedAt: Date | null }[],
}))

const inWhere = (row: any, where: any): boolean =>
  Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k])
    return row[k] === v
  })

vi.mock('@/lib/db', () => ({
  prisma: {
    packetItem: {
      findMany: vi.fn(async ({ where }: any) =>
        DB.items.filter((i) => {
          if (where.packetId) return i.packetId === where.packetId
          const p = DB.packets.find((x) => x.id === i.packetId)!
          return i.key === where.key && where.state.in.includes(i.state) && inWhere(p, where.packet)
        })
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        for (const i of DB.items) if (where.id.in.includes(i.id)) Object.assign(i, data)
        return { count: where.id.in.length }
      }),
    },
    documentPacket: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        for (const p of DB.packets) if (p.id === where.id && p.completedAt === null) Object.assign(p, data)
        return { count: 1 }
      }),
    },
  },
}))

import { answerOpenAsks } from '@/app/api/packets/examination'

const ON = new Date('2026-10-30T15:00:00Z')

describe('a paper kept on file reads one state on both sides', () => {
  it('a paper the client accepted reads accepted on the supplier’s own Company paperwork, with the firm and the day', () => {
    expect(keptPaperSays({ examinedAt: ON, examinedBy: 'Jenna Okafor', examinedFor: 'Brightmoor Staffing', checkStatus: 'PENDING' }))
      .toEqual({ examined: true, says: 'Accepted by Brightmoor Staffing (Jenna Okafor) on Oct 30, 2026' })
  })

  it('a paper nobody examined reads on file, not examined', () => {
    expect(keptPaperSays({ examinedAt: null, checkStatus: 'PENDING' })).toEqual({ examined: false, says: 'On file, not examined' })
  })

  it('a paper with an examined check behind it reads examined', () => {
    expect(keptPaperSays({ examinedAt: null, checkStatus: 'CLEAR' }).examined).toBe(true)
  })

  it('a paper sent back is not stamped as examined, so it never reads accepted on either side', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/documents/[id]/examine/route.ts'), 'utf8')
    const keptBranch = route.slice(route.indexOf('} else if (keptForBuyer) {'), route.indexOf('} else {', route.indexOf('} else if (keptForBuyer) {')))
    expect(keptBranch).toContain('data: { note }')
    expect(keptBranch).not.toContain('examinedAt: now')
  })

  it('the supplier’s own list reads the examination the client wrote on the paper', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/me/papers/route.ts'), 'utf8')
    expect(route).toContain('keptPaperSays')
    expect(route).toContain('examinedAt: true, examinedById: true')
  })
})

describe('accepting a supplier’s paper answers the buyer’s own open request for it', () => {
  beforeEach(() => {
    DB.packets = [
      { id: 'from-brightmoor', companyId: 'brightmoor', subjectCompanyId: 'tapin', cancelledAt: null, completedAt: null },
      { id: 'from-northbend', companyId: 'northbend', subjectCompanyId: 'tapin', cancelledAt: null, completedAt: null },
    ]
    DB.items = [
      { id: 'gl', packetId: 'from-brightmoor', key: 'INSURANCE_GL', state: 'PENDING', required: true },
      { id: 'w9', packetId: 'from-brightmoor', key: 'W9', state: 'ACCEPTED', required: true },
      { id: 'nb-gl', packetId: 'from-northbend', key: 'INSURANCE_GL', state: 'PENDING', required: true },
    ]
  })

  const accept = () =>
    answerOpenAsks({ buyerId: 'brightmoor', supplierId: 'tapin', key: 'INSURANCE_GL', verificationId: 'v-1', reviewerId: 'jenna', validUntil: null, now: ON })

  it('the request item reads accepted and points at the check it became', async () => {
    expect(await accept()).toBe(1)
    const gl = DB.items.find((i) => i.id === 'gl')!
    expect(gl.state).toBe('ACCEPTED')
    expect(gl.verificationId).toBe('v-1')
  })

  it('a request with nothing left outstanding closes', async () => {
    await accept()
    expect(DB.packets.find((p) => p.id === 'from-brightmoor')!.completedAt).toEqual(ON)
  })

  it('what one firm accepted does not answer another firm’s request', async () => {
    await accept()
    expect(DB.items.find((i) => i.id === 'nb-gl')!.state).toBe('PENDING')
    expect(DB.packets.find((p) => p.id === 'from-northbend')!.completedAt).toBeNull()
  })

  it('every door that accepts a supplier’s paper answers the open asks', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    expect(read('src/app/api/packets/examination.ts')).toContain('await answerOpenAsks({')
    expect(read('src/app/api/documents/[id]/examine/route.ts')).toContain('await answerOpenAsks({')
  })
})

describe('the library says who a document is asked of in words', () => {
  it('a document is asked of a worker, a supplier, a client, your own staff or anybody — never the stored role', () => {
    expect(audienceWord('VENDOR')).toBe('A supplier')
    expect(audienceWord('CLIENT')).toBe('A client')
    expect(audienceWord('CANDIDATE')).toBe('A worker')
    for (const word of Object.values(AUDIENCE_WORDS)) expect(word).not.toMatch(/vendor|msp|candidate|general/i)
  })

  it('the Paperwork library and the refusal for a missing audience never print the stored role', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/documents/page.tsx'), 'utf8')
    const route = readFileSync(join(process.cwd(), 'src/app/api/documents/route.ts'), 'utf8')
    expect(page).not.toContain('t.audience.slice(1).toLowerCase()')
    expect(page).toContain('audienceWord(')
    expect(route).not.toContain('audience must be one of')
  })
})
