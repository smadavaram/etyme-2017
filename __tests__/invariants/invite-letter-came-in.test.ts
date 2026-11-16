/**
 * An invitation never carries a link that sets a password on an account
 * somebody has used, by any door (2026-11-16).
 *
 * The invitation letter minted a set-password link wherever the person had
 * no password and no sign-in method on record. So a person who came in only
 * by LinkedIn, a company directory or a first email link, or who only
 * answered something by link, was sent a link that let whoever held the
 * letter choose a password on her account; and where no email can leave,
 * that link was kept on the notice for staff to pass on.
 *
 * Now the letter reads the one predicate the firm's sign-in link reads,
 * `hasEverCameIn` in lib/notify/came-in: only a record nobody has ever
 * used is offered a first password. Anybody else is told to sign in the
 * way she usually does.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inviteLetter, INVITE_LINK_HOURS } from '@/lib/access-grant'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const LOGIN = 'https://app.etyme.example/login'

/** The names the AccessAction union lists, comments taken out. */
function accessActionNames(): string[] {
  const src = read('src/lib/access-log.ts')
  const start = src.indexOf('export type AccessAction =')
  const body = src.slice(start, src.indexOf('\ninterface ', start))
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  return [...body.matchAll(/\|\s*'([A-Z_]+)'/g)].map((m) => m[1])
}

describe('an invitation never carries a link that sets a password on an account somebody has used, by any door', () => {
  it('a person who has ever come in is never offered the password door, whatever the company’s sign-in mode or address', async () => {
    const { doorFor } = await import('@/app/api/access/invite/one')
    for (const mode of ['OPEN', 'HYBRID', 'INVITE_ONLY', 'SSO_ONLY'] as const) {
      for (const login of [LOGIN, '']) {
        expect(doorFor({ mode, cameIn: true, login }), `${mode} ${login}`).not.toBe('PASSWORD')
      }
    }
  })

  it('a person who has ever come in is told to sign in the way she usually does, with no link that sets a password', async () => {
    const { doorFor } = await import('@/app/api/access/invite/one')
    expect(doorFor({ mode: 'HYBRID', cameIn: true, login: LOGIN })).toBe('SIGN_IN')
    const l = inviteLetter({
      door: 'SIGN_IN', companyName: 'Northwind Staffing', roleName: 'Recruiter', setPasswordUrl: null,
      loginUrl: LOGIN, linkHours: INVITE_LINK_HOURS, workAccount: true,
    })
    expect(l.lines).toEqual([`Sign in at ${LOGIN} the way you usually do. You are in Northwind Staffing as Recruiter.`])
    expect(l.link).toBeNull()
    expect(l.lines.join(' ')).not.toMatch(/password|reset/i)
  })

  it('even handed a set-password link by mistake, the sign-in letter never carries it', () => {
    const l = inviteLetter({
      door: 'SIGN_IN', companyName: 'Northwind Staffing', roleName: null, setPasswordUrl: 'https://app.etyme.example/reset/abc',
      loginUrl: LOGIN, linkHours: INVITE_LINK_HOURS, workAccount: false,
    })
    expect(l.link).toBeNull()
    expect(l.lines.join(' ')).not.toContain('/reset/')
  })

  it('a record nobody has ever used is still offered a first password', async () => {
    const { doorFor } = await import('@/app/api/access/invite/one')
    expect(doorFor({ mode: 'HYBRID', cameIn: false, login: LOGIN })).toBe('PASSWORD')
  })

  it('the letter reads whether she came in through the one predicate the firm’s sign-in link reads, and nothing of its own', () => {
    const one = read('src/app/api/access/invite/one.ts')
    expect(one).toContain("import { hasEverCameIn } from '@/lib/notify/came-in'")
    expect(one).toContain('const cameIn = await hasEverCameIn(a.person.id)')
    expect(one).toContain('doorFor({ mode: a.mode, cameIn, login })')
    // The old partial reading is gone: a password or a sign-in method only.
    expect(one).not.toContain('prisma.credential.count')
    expect(one).not.toMatch(/hasPassword/)
    // A set-password link is minted only where the door is the password door.
    expect(one).toContain("door === 'PASSWORD' ? await issueSetPassword(a.person.id, INVITE_LINK_HOURS, now, a.company.id) : null")
  })
})

describe('a press of a firm’s sign-in link is findable in the trail under a name of its own', () => {
  it('the access log lists a name for a press of a firm’s sign-in link and its refusals, once', () => {
    const names = accessActionNames()
    expect(names.filter((n) => n === 'SIGN_IN_LINK_USE')).toHaveLength(1)
  })
})
