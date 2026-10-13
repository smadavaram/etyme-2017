import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { notificationHref } from '@/lib/notify'

/** Conversation's BENCH notices (7d4e62c0f), reaching the bell and the schema's own note. */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a bench notice reads as a bench notice', () => {
  // The bell that drew its own chip per type is gone (2026-10-13); where a
  // notice opens is lib/notify's one answer, read by email, Teams and Ask Etyme.
  it('a bench notice opens the bench', () => {
    expect(notificationHref('BENCH')).toBe('/dashboard/bench')
  })

  it('the schema lists every notification type the product writes, interviews, matches and bench among them', () => {
    const line = src('prisma/schema.prisma').split('\n').find((l) => /^\s+type\s+String \/\/ SUBMISSION/.test(l))!
    for (const t of ['INTERVIEW', 'MATCH_READY', 'BENCH']) expect(line).toContain(t)
  })
})
