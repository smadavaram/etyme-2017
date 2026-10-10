import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, applyUrl, claimUrl, claimLetter, approvedSays, sentSays } from '@/lib/supplier-link'
import { welcomeUrl } from '@/lib/contractor-link'
import { datesHelp } from '@/lib/supplier-onboarding'

/**
 * Round one of the sign-up walk, 2026-10-08: an approved supplier was
 * never told, links pointed at a one-off deploy address, and a handful
 * of screens spoke the system's words instead of the reader's.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const KEYS = ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
const set = (env: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) {
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
}
afterEach(() => set(saved as Record<string, string>))

describe('every link the app mails is built from one base address', () => {
  it('every link the app mails is built from one base address', () => {
    set({ NEXTAUTH_URL: 'https://app.etyme.example/', NEXT_PUBLIC_APP_URL: 'https://public.example', VERCEL_URL: 'etyme-abc123.vercel.app' })
    expect(appUrl()).toBe('https://app.etyme.example')
    expect(applyUrl('t1')).toBe('https://app.etyme.example/apply/t1')
    expect(claimUrl('t2')).toBe('https://app.etyme.example/claim/t2')
    expect(welcomeUrl('t3')).toBe('https://app.etyme.example/welcome/t3')
  })

  it('on a deployment with only the sign-in address set, links never point at the one-off deploy address', () => {
    set({ NEXTAUTH_URL: 'https://app.etyme.example', VERCEL_URL: 'etyme-abc123.vercel.app' })
    expect(applyUrl('t')).not.toContain('vercel.app')
  })

  it('without the sign-in address it falls back to the public address, then the deploy address, then this machine', () => {
    set({ NEXT_PUBLIC_APP_URL: 'https://public.example', VERCEL_URL: 'etyme-abc123.vercel.app' })
    expect(appUrl()).toBe('https://public.example')
    set({ VERCEL_URL: 'etyme-abc123.vercel.app' })
    expect(appUrl()).toBe('https://etyme-abc123.vercel.app')
    set({})
    expect(appUrl()).toBe('http://localhost:3000')
  })

  it('no other mailed link in this domain reads the address on its own', () => {
    for (const file of ['src/lib/contractor-link.ts', 'src/app/api/suppliers/route.ts']) {
      expect(read(file), file).not.toMatch(/process\.env\.(NEXT_PUBLIC_APP_URL|VERCEL_URL|NEXTAUTH_URL)/)
    }
  })
})

describe('an approved supplier is told, with a link, that it can take its account', () => {
  it('an approved supplier is told, with a link, that it can take its account', () => {
    set({ NEXTAUTH_URL: 'https://app.etyme.example' })
    const letter = claimLetter({ contactName: 'Dana Brook', firmName: 'Brookfield Walk Staffing', clientName: 'Northbend Athletic', token: 'abc' })
    expect(letter.body).toContain('Northbend Athletic approved Brookfield Walk Staffing as a supplier. Take your account: https://app.etyme.example/claim/abc')
    expect(letter.subject).toBe('Northbend Athletic approved Brookfield Walk Staffing as a supplier')
  })

  it('the apply page, once decided, says the same sentence as the email', () => {
    const page = read('src/app/apply/[token]/page.tsx')
    expect(page).toContain('data.claim.says')
    expect(page).toContain('data.claim.url')
    expect(approvedSays({ clientName: 'Northbend Athletic', firmName: 'Brookfield Walk Staffing' }))
      .toBe('Northbend Athletic approved Brookfield Walk Staffing as a supplier. Take your account:')
  })

  it('Finance’s last yes sends the claim email rather than only writing the claim', () => {
    const route = read('src/app/api/supplier-requests/[id]/route.ts')
    expect(route).toContain('await sendClaim(')
  })
})

describe('the firm’s own page says plain things', () => {
  it('after sending its side, the firm reads that it was sent and that the client will be in touch', () => {
    expect(sentSays('Northbend Athletic')).toBe('Sent to Northbend Athletic. They will be in touch.')
  })

  it('a certificate of good standing is explained as itself, not as insurance cover', () => {
    expect(datesHelp('GOOD_STANDING')).toBe('Shows your company is registered and in good standing with the state. Usually valid for a year.')
    expect(datesHelp('GOOD_STANDING')).not.toMatch(/cover/i)
    expect(datesHelp('INSURANCE')).toMatch(/cover/i)
  })

  it('both pages that ask for the two dates take the line from the item, never one fixed sentence', () => {
    for (const file of ['src/app/apply/[token]/page.tsx', 'src/app/dashboard/suppliers/page.tsx']) {
      const src = read(file)
      expect(src, file).toContain('datesHelp(')
      expect(src, file).not.toContain('cover that begins next month covers nobody')
    }
  })
})

describe('the client’s screens use the client’s words', () => {
  const program = read('src/app/dashboard/program/page.tsx')
  const programRoute = read('src/app/api/program/route.ts')
  const list = read('src/app/dashboard/requirements/page.tsx')
  const sheets = read('src/app/dashboard/timesheets/page.tsx')

  it('the client dashboard says job request, never requirement', () => {
    expect(program).not.toContain('Raise a requirement')
    expect(program).toContain('Nothing open. Raise a job request and it publishes itself within plan.')
  })

  it('"Raise a job request" is shown only to a seat the job request route would let raise one', () => {
    expect(programRoute).toContain("hasPermission(raiseDesk.permissions, 'requirements.write')")
    expect(program).toContain('{data.mayRaise && (')
  })

  it('the job requests list says job request, and counts settled ones as Archived rather than Filled', () => {
    expect(list).toContain('New job request')
    expect(list).toContain('across all job requests')
    expect(list).not.toMatch(/>\s*New requirement/)
    expect(list).not.toContain('across all reqs')
    expect(list).not.toContain("statusWord('FILLED')")
  })

  it('a client’s empty timesheet list speaks of hours at its sites, never of sell contracts', () => {
    expect(sheets).toContain('Hours worked at your sites, waiting for your approval, will appear here.')
    expect(sheets).not.toContain('logging hours against sell contracts')
  })
})
