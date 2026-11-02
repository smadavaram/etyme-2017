/**
 * Two sentences the platform draws promised an email whether or not one
 * could leave this deployment (found 2026-11-01; conversation's
 * `mailLeaves` in lib/notify/mail-leaves is the one answer).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('No sentence promises a letter that cannot leave', () => {
  it('inviting a teammate shows the route’s own sentence, and where there is none it promises no email', () => {
    const src = read('src/components/invite-teammate.tsx')
    const line = src.split('\n').find((l) => l.includes('body.data?.says ??'))!
    expect(line).toBeTruthy()
    const fallback = line.slice(line.indexOf('??') + 2).replace(/\$\{[^}]*\}/g, '')
    expect(fallback).not.toMatch(/email|e-mail|letter|sent|has been invited/i)
  })

  it('the nightly bench-stay reminder says it was emailed only where an email can leave, and says where it waits otherwise', () => {
    const src = read('src/app/api/cron/bench-stays/route.ts')
    expect(src).toContain("import { mailLeaves } from '@/lib/notify/mail-leaves'")
    expect(src).toContain('const mail = mailLeaves()')
    expect(src).toMatch(/mail\s*\?\s*`\$\{person\.name\} was reminded by email/)
    expect(src).toContain('No email can be sent from here, so the reminder and its one-tap renew wait on their notice.')
    expect(src).not.toContain("the letter carries a one-tap renew")
    expect(src).toMatch(/reminder\(s\) \$\{mail \? 'sent' : /)
  })
})
