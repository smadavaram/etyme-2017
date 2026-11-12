import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { joinSentence, type JoinFacts } from '@/lib/join-words'

/**
 * How people join a company, said in one sentence read from what the doors
 * do (founder, 2026-11-12). Users & permissions, Settings and setup each
 * said it a different way, and for Tapin (no domain of its own, people on
 * Gmail and on Etyme's own domain) none of them was true.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const facts = (o: Partial<JoinFacts> = {}): JoinFacts => ({
  companyName: 'Brightmoor Staffing', kind: 'VENDOR', slug: 'brightmoor', mode: 'OPEN',
  domains: [], ownerEmailDomains: ['brightmoor.example'], ...o,
})

describe('how people join this company is said from what the code does', () => {
  it('a company with no verified domain is told people join by invitation, and a colleague on its Owner’s email domain who signs up with its Etyme address joins as Member and waits for a role', () => {
    expect(joinSentence(facts())).toBe(
      'People join Brightmoor Staffing by invitation. An Owner or Admin invites each person from Users & permissions. ' +
      'A colleague with an address on brightmoor.example who signs up with brightmoor.etyme.com also joins, as Member, and waits for a role.'
    )
  })

  it('a company whose Owner is on a personal address is told people join by invitation only', () => {
    expect(joinSentence(facts({ ownerEmailDomains: ['gmail.com'] }))).toBe(
      'People join Brightmoor Staffing by invitation only. An Owner or Admin invites each person from Users & permissions.'
    )
  })

  it('a company whose people are on Etyme’s own domain is told people join by invitation only', () => {
    expect(joinSentence(facts({ companyName: 'Tapin', slug: 'tapin', ownerEmailDomains: ['etyme.com', 'gmail.com'] }))).toBe(
      'People join Tapin by invitation only. An Owner or Admin invites each person from Users & permissions.'
    )
  })

  it('a company with a verified domain that lets people in at once is told they join as Member and wait for a role', () => {
    const s = joinSentence(facts({ domains: [{ domain: 'brightmoor.example', verified: true, joinPolicy: 'AUTO' }] }))!
    expect(s).toContain('Anybody who signs in with an address on brightmoor.example joins at once as Member and waits for a role.')
    expect(s).not.toContain('signs up with brightmoor.etyme.com')
  })

  it('a company with a verified domain that asks first is told people ask to join and wait, never that they join automatically', () => {
    const s = joinSentence(facts({ domains: [{ domain: 'brightmoor.example', verified: true, joinPolicy: 'REQUEST' }] }))!
    expect(s).toContain('asks to join, and an Owner or Admin gives them a role')
    expect(s).not.toMatch(/automatically|at once/)
  })

  it('a domain claimed and not yet verified, or verified and closed, lets nobody in by it', () => {
    const s = joinSentence(facts({
      ownerEmailDomains: [],
      domains: [{ domain: 'a.example', verified: false, joinPolicy: 'AUTO' }, { domain: 'b.example', verified: true, joinPolicy: 'NONE' }],
    }))!
    expect(s).toContain('by invitation only')
    expect(s).not.toContain('a.example')
  })

  it('a company that lets people in by invitation only is told so, whatever its domains', () => {
    const s = joinSentence(facts({ mode: 'INVITE_ONLY', domains: [{ domain: 'brightmoor.example', verified: true, joinPolicy: 'AUTO' }] }))!
    expect(s).toBe('People join Brightmoor Staffing by invitation only. An Owner or Admin invites each person from Users & permissions.')
  })

  it('a directory-only company is told people join through its directory, and never about passwords or emailed links', () => {
    const s = joinSentence(facts({ mode: 'SSO_ONLY', domains: [{ domain: 'brightmoor.example', verified: true, joinPolicy: 'AUTO' }] }))!
    expect(s).toBe("People join Brightmoor Staffing through your company's directory. Add a person there, and they sign in through it.")
    expect(s).not.toMatch(/password|link|email|etyme\.com|invit/i)
  })

  it('a one-person firm is told nothing about colleagues joining', () => {
    expect(joinSentence(facts({ kind: 'CONSULTANT_CORP' }))).toBeNull()
  })

  it('Settings, its Sign-in page and the setup items for the team and the domain read the one sentence', () => {
    expect(read('src/app/api/settings/route.ts')).toContain('joinSentenceFor(companyId)')
    expect(read('src/app/api/settings/sign-in/overview/route.ts')).toContain('joinSentenceFor(company.id)')
    const setup = read('src/app/api/settings/setup/read.ts')
    expect(setup).toContain('joinSentenceFor(companyId)')
    expect(setup).toContain("if (k === 'TEAM')")
    expect(setup).toContain("if (k === 'DOMAIN')")
    // The copy that promised a join by the Etyme address to everybody is gone.
    expect(read('src/app/dashboard/settings/page.tsx')).not.toContain('or by signing up with that address')
  })

  it('the Roles subtitle names no role, so a bench vendor is never told it gets a Hiring Manager', () => {
    const page = read('src/app/dashboard/settings/page.tsx')
    const roles = page.slice(page.indexOf('function RolesTab'), page.indexOf('// ── Locations'))
    expect(roles).not.toMatch(/Hiring Manager|Recruiter/)
  })
})

describe('the sign-up start page says how people join from the same sentence (2026-11-12)', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/(auth)/start/page.tsx'), 'utf8')
  const state = readFileSync(join(process.cwd(), 'src/lib/setup-state.ts'), 'utf8')

  it('once the company exists, the start page prints the join sentence the doors are read for, never a line of its own', () => {
    expect(state).toContain('joinSentenceFor(companyId).catch(() => null)')
    expect(page).toContain('{setup.company.joinSays && ` ${setup.company.joinSays}`}')
    expect(page).not.toContain('Colleagues join by invitation, or by signing up with the same Etyme address')
  })

  it('before the company exists, the page promises nobody joins by their web address, and names the invitation step', () => {
    expect(page).not.toContain('Anyone else from your web address who signs in will join you as Member.')
    expect(page).toContain("const BEFORE_THE_COMPANY_JOIN_LINE = 'Colleagues come in by your invitation, on the Your team step. Settings then says any other way people can join.'")
  })

  it('the start page, a browser page, never imports the database reader behind the sentence', () => {
    expect(page).not.toMatch(/from '@\/lib\/join-words'/)
  })
})
