/** A refusal about a company that does not exist must still reach the trail. */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], existing: ['real'] as string[] }))

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn(async () => undefined) }))
vi.mock('@/lib/db', () => ({
  prisma: {
    company: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => h.existing.includes(id)).map((id) => ({ id })),
    },
    accessLog: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        h.rows.push(...data)
        return { count: data.length }
      },
    },
  },
}))

import { recordRefusal } from '@/lib/access-log'

const actor = { actorPersonId: 'renata', actorCompanyId: 'northbend', action: 'DOCUMENT_FILE_READ' as const, reason: 'Asked to link' }

beforeEach(() => { h.rows = [] })

describe('A refusal about a company that does not exist', () => {
  it('a refusal about a company that does not exist is still logged', async () => {
    const n = await recordRefusal([{ companyId: 'ghost' }], actor)
    expect(n).toBe(1)
    expect(h.rows).toEqual([
      expect.objectContaining({ subjectId: null, subjectCompanyId: null, allowed: false, reason: 'Asked to link (company ghost does not exist)' }),
    ])
  })

  it('a refusal about a company that exists still names it as the subject', async () => {
    await recordRefusal([{ companyId: 'real' }], actor)
    expect(h.rows).toEqual([expect.objectContaining({ subjectCompanyId: 'real', reason: 'Asked to link' })])
  })
})
