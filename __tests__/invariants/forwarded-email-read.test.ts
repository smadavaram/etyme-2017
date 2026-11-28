/**
 * Reading the body of an email somebody forwarded to their company is a
 * read of somebody else's data, and it is in the trail under a name of
 * its own (lib/access-log `recordForwardedEmailRead`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const writes = vi.hoisted(() => ({ rows: [] as any[], fail: false }))
vi.mock('@/lib/db', () => ({
  prisma: {
    accessLog: {
      createMany: async ({ data }: any) => {
        if (writes.fail) throw new Error('the log is down')
        writes.rows.push(...data)
        return { count: data.length }
      },
      create: async ({ data }: any) => { writes.rows.push(data); return data },
    },
  },
}))
vi.mock('@/lib/alerts', () => ({ reportError: async () => undefined }))

import { recordForwardedEmailRead, forwardedEmailReadReason } from '@/lib/access-log'

const actor = { actorPersonId: 'p-ap-clerk', actorCompanyId: 'c-northbend' }

beforeEach(() => { writes.rows = []; writes.fail = false })

describe('the body of a forwarded email, read', () => {
  it('a card that shows a forwarded email’s body writes a row naming the email and the person who forwarded it, before the text is handed over', async () => {
    await recordForwardedEmailRead({ inboundEmailId: 'ie-1', forwarderPersonId: 'p-dana', shownOn: 'the invoice receipt card' }, actor)
    expect(writes.rows).toHaveLength(1)
    expect(writes.rows[0]).toMatchObject({
      subjectId: 'p-dana', action: 'FORWARDED_EMAIL_READ', allowed: true, actorPersonId: 'p-ap-clerk', actorCompanyId: 'c-northbend',
      reason: 'Read the body of forwarded email ie-1 on the invoice receipt card',
    })
  })

  it('a read whose row cannot be written throws, so the body is not shown', async () => {
    writes.fail = true
    await expect(recordForwardedEmailRead({ inboundEmailId: 'ie-1', forwarderPersonId: 'p-dana' }, actor)).rejects.toThrow()
  })

  it('a refused read is written as refused, with the sentence the reader was told, and never throws', async () => {
    await recordForwardedEmailRead({ inboundEmailId: 'ie-2', forwarderPersonId: 'p-dana', refused: 'It was forwarded to another company.' }, actor)
    expect(writes.rows[0]).toMatchObject({ action: 'FORWARDED_EMAIL_READ', allowed: false })
    expect(forwardedEmailReadReason({ inboundEmailId: 'ie-2', refused: 'It was forwarded to another company.' }))
      .toBe('Refused the body of forwarded email ie-2: It was forwarded to another company.')
  })

  it('the read has a name of its own in the trail, beside every other kind of read', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/access-log.ts'), 'utf8')
    const union = src.slice(src.indexOf('export type AccessAction ='), src.indexOf('\ninterface ', src.indexOf('export type AccessAction =')))
    expect(union).toMatch(/\|\s*'FORWARDED_EMAIL_READ'/)
  })
})
