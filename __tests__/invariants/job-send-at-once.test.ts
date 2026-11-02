import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Sending a job to its suppliers was the slowest write of the founder-scale
 * run (2026-11-01): p95 7.6 s at sixty at once, a job going to seven to
 * nine firms, each firm's invitation, thread and first line written one
 * after another. Every write is now one statement for all the firms, and
 * what each firm is answered is what it was answered one at a time.
 */

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
const send = code('src/app/api/requisitions/send.ts')
const invite = send.slice(send.indexOf('async function inviteAtOnce('), send.indexOf('async function threadsAtOnce('))
const threads = send.slice(send.indexOf('async function threadsAtOnce('))

describe('a job reaches every firm it is sent to in a handful of writes, however many firms there are', () => {
  it('every invitation is written in one statement, each firm with its own band', () => {
    expect(invite).toContain('prisma.requirementInvitation.createManyAndReturn({')
    expect(invite).toMatch(/payMin: v\.payMin \?\? null,\s*payMax: v\.payMax \?\? null,/)
    expect(send).toContain('const created = await inviteAtOnce(id, requisition.companyId, vendors, expiresAt)')
  })

  it('a firm already asked, or asked a moment ago by a send racing this one, reads as already asked, never as sent twice', () => {
    expect(invite).toContain("where: { requirementId, toCompanyId: { in: ids } },")
    expect(invite).toContain('skipDuplicates: true,')
    expect(send).toContain("status: first && created.has(v.companyId) ? 'sent' : 'already_invited'")
  })

  it('a firm named twice in one send is asked once, and the second naming reads as already asked', () => {
    expect(invite).toContain('if (!asked.has(v.companyId) && !firstOf.has(v.companyId)) firstOf.set(v.companyId, v)')
    expect(send).toMatch(/const first = !answered\.has\(v\.companyId\)\s*answered\.add\(v\.companyId\)/)
  })

  it('where the batch fails for any other reason, the firms are asked one at a time as before, so one firm’s failure is that firm’s alone', () => {
    expect(send).toMatch(/\} else \{[\s\S]*?for \(const v of vendors\) \{[\s\S]*?await prisma\.requirementInvitation\.create\(\{[\s\S]*?status: 'error', reason: 'Could not send'/)
  })

  it('every thread and its first line are written at once, and a thread a racing send opened is read, never doubled', () => {
    expect(threads.match(/prisma\.conversation\.findMany\(/g)?.length).toBe(1)
    expect(threads).toContain('prisma.conversation.createManyAndReturn({')
    expect(threads).toContain('prisma.message.createMany({')
    expect(threads).toContain("await read(missing.map((f) => f.companyId).filter((c) => !threadOf.has(c)))")
    // Every firm opened, or none written: a half-written batch falls back.
    expect(threads).toContain('if (opened.length !== input.firms.length) return null')
  })

  it('where the threads cannot all be opened at once, each firm’s thread is opened on its own and the job still reaches the rest', () => {
    expect(send).toMatch(/if \(atOnce\) \{[\s\S]*?\} else \{\s*await Promise\.all\(\s*sent\.map\(async \(s\) => \{/)
    expect(send).toContain('The thread for ${requisition.title} with ${s.name} could not be opened:')
  })

  it('the opening line of each thread is the same line, with that firm’s own note and never a band', () => {
    expect(send).toContain('lineFor: (companyId) => jobSentThreadLine({ ...facts, note: vendors.find((v) => v.companyId === companyId)?.message ?? null }),')
  })
})
