import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/** Conversation's BENCH notices (7d4e62c0f), reaching the bell and the schema's own note. */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a bench notice reads as a bench notice in the bell', () => {
  const bell = src('src/components/notification-bell.tsx')

  it('the bell names a bench notice "Bench" and opens the bench from it', () => {
    expect(bell).toMatch(/BENCH:\s+'Bench'/)
    expect(bell).toMatch(/BENCH:\s+'\/dashboard\/bench'/)
  })

  it('a bench notice carries an icon and a chip of its own, like every other type', () => {
    expect((bell.match(/^\s+BENCH:/gm) ?? []).length).toBe(4)
  })

  it('the schema lists every notification type the product writes, interviews, matches and bench among them', () => {
    const line = src('prisma/schema.prisma').split('\n').find((l) => /^\s+type\s+String \/\/ SUBMISSION/.test(l))!
    for (const t of ['INTERVIEW', 'MATCH_READY', 'BENCH']) expect(line).toContain(t)
  })
})
