/**
 * The link in an invitation email lands on the page that accepts it
 * (record 110, 2026-11-22, item 6: "its link lands correctly").
 *
 * With NEXTAUTH_URL set, every link the invitation letter carries is
 * built from it: the first-password link at /reset/<token> and the
 * sign-in link at /login. Both pages exist. What this cannot prove is
 * that the address in NEXTAUTH_URL is the live site, or that the email
 * arrived: only a real invitation sent in production proves those.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const made: any[] = []
vi.mock('@/lib/db', () => ({
  prisma: {
    emailToken: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async (a: any) => { made.push(a.data); return a.data }),
    },
  },
}))

const KEYS = ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL', 'VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
const env = (e: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) {
    if (e[k] === undefined) delete process.env[k]
    else process.env[k] = e[k]
  }
}
afterEach(() => { env(saved as Record<string, string>); made.length = 0 })

const at = (p: string) => join(process.cwd(), p)
const read = (p: string) => readFileSync(at(p), 'utf8')
const SITE = 'https://www.etyme.example'

describe('the link in an invitation email lands on the page that accepts it', () => {
  it('with NEXTAUTH_URL set, the first-password link in an invitation is built from it and points at /reset/<token>', async () => {
    env({ NEXTAUTH_URL: `${SITE}/`, VERCEL_URL: 'one-off-abc123.vercel.example' })
    const { issueSetPassword } = await import('@/lib/password-door')
    const url = await issueSetPassword('per_1', 72, new Date('2026-11-22T18:00:00Z'), 'co_1')
    expect(url).toMatch(/^https:\/\/www\.etyme\.example\/reset\/[A-Za-z0-9_-]{20,}$/)
    expect(url).not.toContain('one-off')
  })

  it('the token in the link is kept only as a hash, marked as an invitation for the firm that sent it', async () => {
    env({ NEXTAUTH_URL: SITE })
    const { issueSetPassword } = await import('@/lib/password-door')
    const url = await issueSetPassword('per_1', 72, new Date('2026-11-22T18:00:00Z'), 'co_1')
    const token = url.split('/reset/')[1]
    expect(made).toHaveLength(1)
    expect(made[0]).toMatchObject({ personId: 'per_1', purpose: 'RESET', payload: { invitation: true, firmId: 'co_1' } })
    expect(JSON.stringify(made[0])).not.toContain(token)
  })

  it('the page that accepts a first-password link exists at /reset/<token>', () => {
    expect(existsSync(at('src/app/(auth)/reset/[token]/page.tsx'))).toBe(true)
  })

  it('with NEXTAUTH_URL set, the sign-in link in an invitation is built from it and points at /login, a page that exists', async () => {
    env({ NEXTAUTH_URL: SITE })
    const { baseUrl } = await import('@/lib/signed-link')
    expect(`${baseUrl()}/login`).toBe(`${SITE}/login`)
    expect(existsSync(at('src/app/(auth)/login/page.tsx'))).toBe(true)
    expect(read('src/app/api/access/invite/one.ts')).toContain('const login = baseUrl() ? `${baseUrl()}/login` : \'\'')
  })

  it('the invitation letter carries the link it was given, unchanged', async () => {
    const { inviteLetter, INVITE_LINK_HOURS } = await import('@/lib/access-grant')
    const link = `${SITE}/reset/abcDEF123456789012345`
    const letter = inviteLetter({
      door: 'PASSWORD', companyName: 'Larkfield Staffing', roleName: 'Recruiter',
      setPasswordUrl: link, loginUrl: `${SITE}/login`, linkHours: INVITE_LINK_HOURS, workAccount: false,
    })
    expect(letter.link).toBe(link)
  })

  it('the invitation email goes through the one mail door, named as an invitation about the seat', () => {
    const src = read('src/app/api/access/invite/one.ts')
    expect(src).toContain("template: 'invitation'")
    expect(src).toContain("recordType: 'Context', recordId: a.contextId")
  })

  it('with nothing saying where the site lives, an invitation carries no sign-in link at all', async () => {
    env({})
    const { baseUrl } = await import('@/lib/signed-link')
    expect(baseUrl()).toBe('')
  })
})
