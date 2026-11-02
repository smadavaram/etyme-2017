/**
 * The access log can name a firm as the subject of a read (2026-11-01).
 *
 * The simulation found it: the document file route wrote a supplier's id
 * into `AccessLog.subjectId`, which points at a person, the foreign key
 * refused it, and 98 reads of company papers and a refusal were never in
 * the trail. A firm's own papers are about the firm, so the row names the
 * firm (`subjectCompanyId`), and the one writer keeps "exactly one
 * subject" because the schema cannot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  release: null as null | (() => void),
  hold: false,
  fail: false,
  reportError: vi.fn(async () => undefined),
}))

vi.mock('@/lib/alerts', () => ({ reportError: h.reportError }))
vi.mock('@/lib/db', () => ({
  prisma: {
    accessLog: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        if (h.hold) await new Promise<void>((r) => { h.release = r })
        if (h.fail) throw new Error('the database said no')
        h.rows.push(...data)
        return { count: data.length }
      },
    },
  },
}))

import { recordAccess, recordRefusal, subjectColumns, whomSaid } from '@/lib/access-log'

const reader = { actorPersonId: 'renata', actorCompanyId: 'northbend', action: 'DOCUMENT_FILE_READ' as const, reason: 'Opened the certificate of insurance' }

beforeEach(() => {
  h.rows = []
  h.release = null
  h.hold = false
  h.fail = false
  h.reportError.mockClear()
})

describe('A firm as the subject of a read', () => {
  it('a read of a company’s paper is logged with the company as its subject, and the row is written before the file is sent', async () => {
    h.hold = true
    let done = false
    const writing = recordAccess([{ companyId: 'brightmoor' }], reader).then((n) => { done = true; return n })
    await new Promise((r) => setTimeout(r, 0))
    expect(done).toBe(false)
    h.release!()
    expect(await writing).toBe(1)
    expect(h.rows).toEqual([expect.objectContaining({ subjectId: null, subjectCompanyId: 'brightmoor', action: 'DOCUMENT_FILE_READ', allowed: true })])
  })

  it('where the row cannot be written the writer says so, so the file is not handed over', async () => {
    h.fail = true
    await expect(recordAccess([{ companyId: 'brightmoor' }], reader)).rejects.toThrow('the database said no')
  })

  it('a refused read of a company’s paper is written with the company as its subject before the refusal goes out, once per firm', async () => {
    expect(await recordRefusal([{ companyId: 'techpeple' }, { companyId: 'techpeple' }], { ...reader, allowed: false })).toBe(1)
    expect(h.rows).toEqual([expect.objectContaining({ subjectId: null, subjectCompanyId: 'techpeple', allowed: false })])
  })

  it('a refusal that cannot be written is reported in words that name a firm, and never thrown', async () => {
    h.fail = true
    expect(await recordRefusal([{ companyId: 'techpeple' }], { ...reader, allowed: false })).toBe(0)
    expect(String((h.reportError.mock.calls[0] as unknown[])[1])).toMatch(/refused DOCUMENT_FILE_READ of 1 firm\./)
  })

  it('a person named by id, as every route did before, is written exactly as before', async () => {
    await recordAccess(['helena'], { ...reader, action: 'CONTRACT_VIEW' })
    expect(h.rows).toEqual([expect.objectContaining({ subjectId: 'helena', subjectCompanyId: null })])
  })
})

describe('Exactly one subject on every row', () => {
  it('a row names a person or a firm, never both and never neither', () => {
    expect(subjectColumns('helena')).toEqual({ subjectId: 'helena', subjectCompanyId: null })
    expect(subjectColumns({ personId: 'helena' })).toEqual({ subjectId: 'helena', subjectCompanyId: null })
    expect(subjectColumns({ companyId: 'brightmoor' })).toEqual({ subjectId: null, subjectCompanyId: 'brightmoor' })
    expect(() => subjectColumns({ personId: 'helena', companyId: 'brightmoor' } as never)).toThrow(/not both/)
    expect(() => subjectColumns('')).toThrow(/named neither/)
    expect(() => subjectColumns({ companyId: '  ' })).toThrow(/named neither/)
  })

  it('a read that names both is refused before anything is written', async () => {
    await expect(recordAccess([{ personId: 'helena', companyId: 'brightmoor' } as never], reader)).rejects.toThrow(/not both/)
    expect(h.rows).toEqual([])
  })

  it('who a failed write was about is said in words, people and firms apart', () => {
    expect([whomSaid(['a']), whomSaid(['a', 'b']), whomSaid([{ companyId: 'c' }]), whomSaid(['a', { companyId: 'c' }, { companyId: 'd' }])])
      .toEqual(['1 person', '2 people', '1 firm', '1 person and 2 firms'])
  })

  it('the table can name a firm as the subject, by a foreign key that is indexed, and a person subject stays optional only beside it', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')
    const model = schema.slice(schema.indexOf('model AccessLog {'), schema.indexOf('}', schema.indexOf('model AccessLog {')))
    expect(model).toMatch(/subjectCompanyId\s+String\?/)
    expect(model).toMatch(/subjectCompany\s+Company\?\s+@relation\("accessSubjectCompany", fields: \[subjectCompanyId\]/)
    expect(model).toContain('@@index([subjectCompanyId, at])')
    expect(model).toMatch(/subjectId\s+String\?/)
  })
})
