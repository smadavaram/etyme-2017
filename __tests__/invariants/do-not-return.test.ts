import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mayRead, mayBar, stillStands,
  MAY_READ, MAY_BAR_A_PERSON, MAY_BAR_A_FIRM,
  READING_DESKS, BARRING_DESKS,
  CANNOT_READ, NO_COMPANY, cannotBar, cannotLift,
} from '@/app/api/blacklist/desks'
import { decideSubmission, type Situation } from '@/lib/representation'
import { rolesFor, type CompanyKind, type RoleSeed } from '@/lib/company-defaults'
import { PERMISSIONS } from '@/lib/permissions'

/**
 * The do-not-return list: who may read it, who may write it, and whose
 * it is.
 *
 * `GET /api/blacklist` gated a READ on `consultants.write` and refused
 * with "Requires consultants.write permission". Every Compliance Officer
 * in the product — vendor, client and MSP — holds `consultants.read` and
 * no write at all, deliberately, so the desk whose own blurb is "Checks
 * documents and work authorization" was refused by the one screen most
 * obviously theirs. At a client the same line meant only the account
 * Owner could write the company's own list, because a Program Manager
 * holds `governance.write` and not `consultants.write`.
 *
 * It survived because no test had a role attached. This file walks every
 * default role of every kind of company through every gate.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = read('src/app/api/blacklist/route.ts')
const HOLDS = read('src/lib/holds.ts')

const KINDS: CompanyKind[] = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']

function seat(kind: CompanyKind, name: string): RoleSeed {
  const r = rolesFor(kind).find((x) => x.name === name)
  if (!r) throw new Error(`${kind} has no role called "${name}"`)
  return r
}

function everySeat(): { kind: CompanyKind; role: RoleSeed }[] {
  return KINDS.flatMap((kind) => rolesFor(kind).map((role) => ({ kind, role })))
}

const NOW = new Date('2026-09-18T00:00:00Z')
const ahead = (d: number) => new Date(NOW.getTime() + d * 86_400_000)
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

function situation(over: Partial<Situation> = {}): Situation {
  return {
    now: NOW,
    companyId: 'brightmoor',
    listing: { revokedAt: null, askFirst: false },
    blocked: false,
    barredByUs: false,
    holds: [],
    ...over,
  }
}

// ── Who reads it ─────────────────────────────────────────────────────

describe('who may read the list of people and firms this company will not work with again', () => {
  it('a compliance officer can read the list of people who must not be submitted again', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI'] as CompanyKind[]) {
      const officer = seat(kind, 'Compliance Officer')
      expect(mayRead(officer.permissions), `${kind} Compliance Officer`).toBe(true)
    }
  })

  it('and a recruiter is stopped before they submit somebody on it', () => {
    // Two halves of one sentence. The recruiter can open the list —
    const recruiter = seat('VENDOR', 'Recruiter')
    expect(mayRead(recruiter.permissions)).toBe(true)

    // — and the submission itself is refused, so it does not depend on
    // anybody having remembered to look.
    const v = decideSubmission(situation({ barredByUs: true }))
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('ON_OUR_DNR_LIST')
  })

  it('every desk the list is named for can open it, at every kind of company', () => {
    const refused: string[] = []
    for (const { kind, role } of everySeat()) {
      if (!READING_DESKS.includes(role.name)) continue
      if (!mayRead(role.permissions)) refused.push(`${kind} ${role.name}`)
    }
    expect(refused).toEqual([])
  })

  it('the desk that owns suppliers can read the firms its company has barred', () => {
    expect(mayRead(seat('CLIENT', 'Procurement Lead').permissions)).toBe(true)
    expect(mayRead(seat('MSP', 'Supplier Manager').permissions)).toBe(true)
  })

  it('reading the list is never gated on being allowed to write it', () => {
    // The fault this file exists for. Anybody who may write must be able
    // to read what they are writing into, and more people may read.
    const writers = everySeat().filter(
      ({ role }) => mayBar(role.permissions, 'PERSON') || mayBar(role.permissions, 'COMPANY')
    )
    for (const { kind, role } of writers) {
      expect(mayRead(role.permissions), `${kind} ${role.name} writes but cannot read`).toBe(true)
    }
    // And strictly more read than write.
    const readers = everySeat().filter(({ role }) => mayRead(role.permissions))
    expect(readers.length).toBeGreaterThan(writers.length)
  })

  it('a desk that handles only money is not handed a list of people with something held against them', () => {
    for (const name of ['Accounts Receivable', 'AP & Payroll', 'Finance']) {
      expect(mayRead(seat('VENDOR', name).permissions), name).toBe(false)
    }
    expect(mayRead(seat('CLIENT', 'AP Clerk').permissions)).toBe(false)
  })
})

// ── Who writes it ────────────────────────────────────────────────────

describe('who may put somebody on it, and who may take them off', () => {
  it('a compliance officer reads the list and does not write it, which is what their own desk says', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP'] as CompanyKind[]) {
      const officer = seat(kind, 'Compliance Officer')
      expect(mayRead(officer.permissions)).toBe(true)
      expect(mayBar(officer.permissions, 'PERSON'), `${kind}`).toBe(false)
      expect(mayBar(officer.permissions, 'COMPANY'), `${kind}`).toBe(false)
    }
  })

  it('a client’s program manager can bar somebody from its own sites, where before only the owner could', () => {
    const pm = seat('CLIENT', 'Program Manager')
    expect(pm.permissions).not.toContain('consultants.write') // the old gate
    expect(mayBar(pm.permissions, 'PERSON')).toBe(true)
  })

  it('a recruiter may bar a person and may not bar a whole firm', () => {
    const recruiter = seat('VENDOR', 'Recruiter')
    expect(mayBar(recruiter.permissions, 'PERSON')).toBe(true)
    // Taking a supplier off the panel was never a recruiter's act, and
    // the single `consultants.write` gate let every one of them do it.
    expect(mayBar(recruiter.permissions, 'COMPANY')).toBe(false)
  })

  it('the desk that owns the supplier panel is the desk that bars a firm', () => {
    expect(mayBar(seat('CLIENT', 'Procurement Lead').permissions, 'COMPANY')).toBe(true)
    expect(mayBar(seat('MSP', 'Supplier Manager').permissions, 'COMPANY')).toBe(true)
    expect(mayBar(seat('CLIENT', 'Hiring Manager').permissions, 'COMPANY')).toBe(false)
  })

  it('every desk named as a writer of each half can actually write that half', () => {
    const refused: string[] = []
    for (const { kind, role } of everySeat()) {
      for (const half of ['PERSON', 'COMPANY'] as const) {
        if (!BARRING_DESKS[half].includes(role.name)) continue
        if (!mayBar(role.permissions, half)) refused.push(`${kind} ${role.name} / ${half}`)
      }
    }
    expect(refused).toEqual([])
  })

  it('lifting a bar takes the same desk as placing it, because it lets somebody back', () => {
    // Asserted through the route: LIFT is gated on the same `mayBar`,
    // keyed on what the entry itself bars.
    expect(ROUTE).toContain('mayBar(caller.permissions, target)) return refuse(cannotLift(target))')
  })
})

// ── Whose list it is ─────────────────────────────────────────────────

describe('one company’s do-not-return list is never read by another', () => {
  it('the list is filtered by the caller’s own company at the query, not on the screen', () => {
    expect(ROUTE).toContain('const where: any = { companyId }')
  })

  it('a caller with no company is refused, instead of being handed every company’s list', () => {
    // Prisma drops an `undefined` from a `where` rather than matching
    // nothing, so `companyId: caller.company?.id` on a caller with no
    // company was every company's list in one response.
    expect(ROUTE).toContain('if (!companyId) return refuse(NO_COMPANY)')
    expect(NO_COMPANY).toContain('never read across companies')
  })

  it('a bar at another company is not found rather than refused, so no id fishes for one', () => {
    expect(ROUTE).toContain('where: { id: blacklistId, companyId: caller.company?.id }')
  })

  it('a consultant on the firm’s bench cannot open the firm’s do-not-return list', () => {
    expect(ROUTE).toContain("staffOnly(caller, 'The do-not-return list')")
  })

  it('a client’s bar on somebody is never quoted back to the supplier submitting them', () => {
    // The query in `maySubmit` reads the submitting firm's own list.
    // Reading the client's here would tell one firm what is on another
    // firm's list, by inference from the refusal.
    expect(HOLDS).toContain('companyId: input.companyId,')
    const from = HOLDS.indexOf('prisma.blacklist.findFirst')
    const bar = HOLDS.slice(from, HOLDS.indexOf('}),', from))
    expect(bar).toContain('companyId: input.companyId')
    expect(bar).not.toContain('clientCompanyId')
  })

  it('reading the list leaves a trail, because it names people and what is held against them', () => {
    expect(ROUTE).toContain("action: 'DNR_VIEW'")
  })
})

// ── What the refusal says ────────────────────────────────────────────

describe('the refusal names the desk that is missing, never a permission', () => {
  const SENTENCES: [string, string][] = [
    ['reading it', CANNOT_READ],
    ['barring a person', cannotBar('PERSON')],
    ['barring a firm', cannotBar('COMPANY')],
    ['lifting a bar on a person', cannotLift('PERSON')],
    ['lifting a bar on a firm', cannotLift('COMPANY')],
    ['having no company at all', NO_COMPANY],
  ]

  for (const [what, sentence] of SENTENCES) {
    it(`the refusal for ${what} says what is missing and what to do about it`, () => {
      expect(sentence.length).toBeGreaterThan(80)
      expect(sentence).toMatch(/\.$/)
    })

    it(`the refusal for ${what} names no permission`, () => {
      expect(sentence.toLowerCase()).not.toContain('permission')
      for (const p of PERMISSIONS) expect(sentence).not.toContain(p)
    })
  }

  it('the refusal for reading names the desks that do read it', () => {
    expect(CANNOT_READ).toContain('recruiter')
    expect(CANNOT_READ).toContain('compliance officer')
  })

  it('the route hands back no permission codes at all', () => {
    expect(ROUTE).not.toContain('Requires consultants.write permission')
    // Nothing the route puts in quotes says "permission" — `caller.permissions`
    // is the machine's business and is not a string anybody reads.
    const said = ROUTE.split('\n').filter(
      (l) => /permission/i.test(l) && !/caller\.permissions/.test(l)
    )
    expect(said).toEqual([])
  })
})

// ── Whether a bar still stands ───────────────────────────────────────

describe('a bar is only useful as a thing that is checked', () => {
  it('a bar with no end date stands until somebody lifts it', () => {
    expect(stillStands({ liftedAt: null, expiresAt: null }, NOW)).toBe(true)
  })

  it('a bar that has run out stops standing, without waiting for anything to sweep it', () => {
    expect(stillStands({ liftedAt: null, expiresAt: ago(1) }, NOW)).toBe(false)
    expect(stillStands({ liftedAt: null, expiresAt: ahead(1) }, NOW)).toBe(true)
  })

  it('a bar that was lifted no longer stands, whatever its end date said', () => {
    expect(stillStands({ liftedAt: ago(2), expiresAt: ahead(30) }, NOW)).toBe(false)
  })

  it('the rows and the flag beside each of them are the same arithmetic', () => {
    expect(ROUTE).toContain('isActive: stillStands(e, now)')
    expect(ROUTE).toContain('entries.filter((e) => stillStands(e, now)).length')
  })
})

// ── The gates themselves ─────────────────────────────────────────────

describe('the gates are stated once, as a table, rather than four times as ifs', () => {
  it('reading opens for the desks that deal with people, suppliers or the rules', () => {
    expect([...MAY_READ]).toEqual(['consultants.read', 'vendors.read', 'governance.read'])
  })

  it('barring a person belongs to whoever owns who gets put forward', () => {
    expect([...MAY_BAR_A_PERSON]).toEqual(['consultants.write', 'governance.write'])
  })

  it('barring a firm belongs to whoever owns the supplier panel', () => {
    expect([...MAY_BAR_A_FIRM]).toEqual(['vendors.manage', 'governance.write'])
  })

  it('nobody with no permissions at all gets in', () => {
    expect(mayRead([])).toBe(false)
    expect(mayBar([], 'PERSON')).toBe(false)
    expect(mayBar([], 'COMPANY')).toBe(false)
  })
})
