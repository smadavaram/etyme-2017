import { describe, it, expect } from 'vitest'
import {
  mayForward, onwardRate, journeyFor, journeySentence, howFar,
  orderChain, toHops, mirrorRole,
  type Submission, type Actor, type Destination, type Hop,
} from '@/lib/forwarding'

/**
 * Submitting somebody to you and you sending them onward to the client are
 * two events, days apart. Only the first existed, so the question every
 * consultant asks — have they actually submitted me, or am I sitting in a
 * spreadsheet — had no answer.
 *
 * Each hop is its own submission with its own rate, linked to the one it
 * came from. Two rates, two decisions, one chain: the layer cake as it
 * actually is.
 */

const SUB: Submission = {
  id: 's1',
  fromCompanyId: 'cloudepa',
  toCompanyId: 'vertex',
  status: 'SUBMITTED',
  rateCents: 6200,
  forwardedAt: null,
}

function actor(over: Partial<Actor> = {}): Actor {
  return { companyId: 'vertex', permissions: ['submissions.create'], ...over }
}

function to(over: Partial<Destination> = {}): Destination {
  return { via: 'ONWARD', companyId: 'terumo', rateCents: 9500, ...over }
}

describe('who may send somebody onward', () => {
  it('lets the company holding it send it on', () => {
    expect(mayForward(actor(), SUB, to()).ok).toBe(true)
  })

  it('refuses the sub-vendor who submitted it', () => {
    // Reaching past the prime to their client is the thing primes fear
    // most about a network, and it would be the end of the relationship.
    const v = mayForward(actor({ companyId: 'cloudepa' }), SUB, to())
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('NOT_YOURS')
  })

  it('refuses a company with nothing to do with it', () => {
    expect(mayForward(actor({ companyId: 'rival' }), SUB, to()).ok).toBe(false)
  })

  it('needs the permission to submit, because that is what this is', () => {
    const v = mayForward(actor({ permissions: [] }), SUB, to())
    expect(v.ok === false && v.code).toBe('NO_PERMISSION')
  })
})

describe('what cannot be sent on', () => {
  it('refuses one the client already answered', () => {
    for (const status of ['PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']) {
      const v = mayForward(actor(), { ...SUB, status }, to())
      expect(v.ok, status).toBe(false)
      expect(v.ok === false && v.code).toBe('ALREADY_DECIDED')
    }
  })

  it('refuses to send the same one twice', () => {
    // Which would put the same name in front of the client twice — the
    // failure the whole platform exists to prevent, one layer up.
    const v = mayForward(actor(), { ...SUB, forwardedAt: new Date() }, to())
    expect(v.ok === false && v.code).toBe('ALREADY_FORWARDED')
    expect(v.ok === false && v.message).toMatch(/twice/)
  })

  it('refuses to send it back to somebody already on it', () => {
    expect(mayForward(actor(), SUB, to({ companyId: 'cloudepa' })).ok).toBe(false)
    expect(mayForward(actor(), SUB, to({ companyId: 'vertex' })).ok).toBe(false)
  })
})

describe('when the next party is not on Etyme', () => {
  it('records an email as an email', () => {
    const v = mayForward(actor(), SUB, { via: 'EMAIL', email: 'staffing@terumobct.com' })
    expect(v.ok).toBe(true)
    expect(v.ok === true && v.note).toMatch(/emailed/)
  })

  it('fails loudly when there is nowhere to send it', () => {
    // 2017's exact failure, kept because it is the honest one. Pretending
    // otherwise loses a candidate in a queue nobody is watching.
    const v = mayForward(actor(), SUB, { via: 'EMAIL', email: null })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.message).toMatch(/No valid client email found/)
  })

  it('refuses something that is not an address', () => {
    expect(mayForward(actor(), SUB, { via: 'EMAIL', email: 'the client' }).ok).toBe(false)
  })

  it('refuses an onward hop with no company named', () => {
    const v = mayForward(actor(), SUB, { via: 'ONWARD', companyId: null })
    expect(v.ok === false && v.code).toBe('NOWHERE_TO_SEND')
  })
})

describe('the rate on the way up', () => {
  it('is the forwarder’s own', () => {
    expect(onwardRate(SUB, to({ rateCents: 9500 }))).toBe(9500)
  })

  it('falls back to what they were quoted rather than inventing a markup', () => {
    expect(onwardRate(SUB, to({ rateCents: null }))).toBe(6200)
  })

  it('warns when somebody sends it on for less than they were quoted', () => {
    // Not forbidden — a firm may buy a relationship — but it is nearly
    // always a typo, and a typo here costs them the difference every hour.
    const v = mayForward(actor(), SUB, to({ rateCents: 5800 }))
    expect(v.ok).toBe(true)
    expect(v.ok === true && v.warning).toMatch(/less than the \$62\/hr you were quoted/)
  })

  it('says nothing when the markup is the ordinary way round', () => {
    const v = mayForward(actor(), SUB, to({ rateCents: 9500 }))
    expect(v.ok === true && v.warning).toBeNull()
  })
})

describe('what each party sees of the journey', () => {
  const hops: Hop[] = [
    { from: 'cloudepa', to: 'vertex', rateCents: 6200, status: 'SUBMITTED', at: new Date('2026-08-18'), yours: false },
    { from: 'vertex', to: 'terumo', rateCents: 9500, status: 'SHORTLISTED', at: new Date('2026-08-20'), yours: false },
  ]

  it('shows the sub-vendor their own rate and not the prime’s', () => {
    // The difference between the two is the prime's margin, and it never
    // travels back down.
    const seen = journeyFor(hops, 'cloudepa')
    expect(seen[0].rateCents).toBe(6200)
    expect(seen[1].rateCents).toBeNull()
  })

  it('shows the prime both, because they are party to both', () => {
    const seen = journeyFor(hops, 'vertex')
    expect(seen[0].rateCents).toBe(6200)
    expect(seen[1].rateCents).toBe(9500)
  })

  it('shows the client only their own', () => {
    const seen = journeyFor(hops, 'terumo')
    expect(seen[0].rateCents).toBeNull()
    expect(seen[1].rateCents).toBe(9500)
  })

  it('shows everybody the shape, whatever they may see of the money', () => {
    // How many hands it passed through is not a secret — how far it got is
    // the whole question.
    for (const who of ['cloudepa', 'vertex', 'terumo', null]) {
      expect(journeyFor(hops, who)).toHaveLength(2)
    }
  })

  it('shows a consultant the shape and none of the money', () => {
    const seen = journeyFor(hops, null)
    expect(seen.every((h) => h.rateCents === null)).toBe(true)
  })
})

describe('what the consultant is told', () => {
  const names = { cloudepa: 'Cloudepa Inc.', vertex: 'Vertex Global', terumo: 'Terumo BCT' }
  const hops: Hop[] = [
    { from: 'cloudepa', to: 'vertex', rateCents: null, status: 'SUBMITTED', at: new Date('2026-08-18'), yours: false },
    { from: 'vertex', to: 'terumo', rateCents: null, status: 'SUBMITTED', at: new Date('2026-08-20'), yours: false },
  ]

  it('reads as the answer to the question they asked', () => {
    const said = journeySentence(hops, names)
    expect(said).toBe(
      'Cloudepa Inc. put you forward to Vertex Global on 2026-08-18, and Vertex Global sent you on to Terumo BCT on 2026-08-20.'
    )
  })

  it('says plainly when nobody has put them forward', () => {
    expect(journeySentence([], names)).toMatch(/Nobody has put you forward/)
  })

  it('says how far it got rather than a status word', () => {
    expect(howFar(hops, true)).toBe('with the client')
    expect(howFar([hops[0]], false)).toBe('with the agency’s customer')
    expect(howFar([], false)).toBe('not sent')
  })
})

describe('putting a chain back in order', () => {
  const row = (id: string, from: string, to: string, parent: string | null, day: number) => ({
    id, fromCompanyId: from, toCompanyId: to, rate: 6200, status: 'SUBMITTED',
    submittedAt: new Date(`2026-08-${String(day).padStart(2, '0')}`),
    parentSubmissionId: parent, forwardedAt: null,
  })

  it('reads a chain from its root, whatever order the rows arrive in', () => {
    const rows = [
      row('c', 'vertex', 'terumo', 'b', 20),
      row('a', 'anita', 'cloudepa', null, 16),
      row('b', 'cloudepa', 'vertex', 'a', 18),
    ]
    expect(orderChain(rows).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops nothing when somebody has broken the chain', () => {
    // An orphan hop is appended rather than lost. A hop nobody can see is
    // worse than an odd-looking list.
    const rows = [row('a', 'x', 'y', null, 16), row('orphan', 'p', 'q', 'missing', 19)]
    expect(orderChain(rows)).toHaveLength(2)
  })

  it('survives a loop rather than hanging', () => {
    const rows = [row('a', 'x', 'y', 'b', 16), row('b', 'y', 'z', 'a', 17)]
    expect(orderChain(rows).length).toBeGreaterThan(0)
  })

  it('turns rows into hops in order', () => {
    const rows = [row('b', 'cloudepa', 'vertex', 'a', 18), row('a', 'anita', 'cloudepa', null, 16)]
    expect(toHops(rows).map((h) => h.from)).toEqual(['anita', 'cloudepa'])
  })
})

describe('the role on the way up', () => {
  const source = {
    id: 'req-prime',
    title: 'SAP FICO Consultant — Lakewood',
    skills: ['SAP FICO'],
    location: 'Lakewood, CO',
  }

  it('gives the destination their own record of the role', () => {
    // A submission is unique on (requirement, person), which is the rule
    // that stops one name reaching a client twice. Reusing the sender's
    // row collides with exactly the rule most worth keeping — found by
    // running the chain, not by reading it.
    const m = mirrorRole(source, 'terumo')
    expect(m.companyId).toBe('terumo')
    expect(m.title).toBe(source.title)
  })

  it('remembers where it was mirrored from', () => {
    expect(mirrorRole(source, 'terumo').mirroredFromRequirementId).toBe('req-prime')
  })

  it('carries the skills and the place across', () => {
    const m = mirrorRole(source, 'terumo')
    expect(m.skills).toEqual(['SAP FICO'])
    expect(m.location).toBe('Lakewood, CO')
  })
})

// ── The end client survives every hop ────────────────────────────────
//
// It did not. A role forwarded through a prime arrived at the sub with no
// end client, so the sub's contract recorded the prime as the place of
// work — and tenure, which Addendum E requires to aggregate at the end
// client across every vendor, counted the wrong company.
//
// Twelve months at Nike direct and twelve at Nike through a prime read as
// two unrelated years at two firms. That is precisely the industry blind
// spot this product exists to close, and the forward route was selecting
// the field and then not using it.

describe('Where the work actually is survives being forwarded', () => {

  it('carries the end client to the next company down the chain', () => {
    const m = mirrorRole(
      {
        id: 'req-1', title: 'Validation engineer', skills: ['GxP'], location: 'Denver',
        endClientCompanyId: 'terumo', companyId: 'prime-systems',
      },
      'sub-staffing'
    )
    expect(m.endClientCompanyId).toBe('terumo')
  })

  it('survives a second hop, because a chain is rarely two companies long', () => {
    const first = mirrorRole(
      { id: 'req-1', title: 'X', skills: [], location: null, endClientCompanyId: 'terumo', companyId: 'client' },
      'prime'
    )
    const second = mirrorRole(
      { id: 'req-2', title: 'X', skills: [], location: null, endClientCompanyId: first.endClientCompanyId, companyId: 'prime' },
      'sub'
    )
    expect(second.endClientCompanyId).toBe('terumo')
  })

  it('falls back to the sender where nobody set an end client', () => {
    // A null here reads downstream as "direct placement", which is wrong
    // twice — the sender is at least the end client as far as the
    // recipient can tell.
    const m = mirrorRole(
      { id: 'req-1', title: 'X', skills: [], location: null, companyId: 'prime-systems' },
      'sub-staffing'
    )
    expect(m.endClientCompanyId).toBe('prime-systems')
  })

  it('is null only when the sender genuinely does not know either', () => {
    const m = mirrorRole({ id: 'req-1', title: 'X', skills: [], location: null }, 'sub')
    expect(m.endClientCompanyId).toBeNull()
  })

  it('still records which role it was mirrored from, for anybody auditing', () => {
    const m = mirrorRole(
      { id: 'req-1', title: 'X', skills: [], location: null, endClientCompanyId: 'terumo' },
      'sub'
    )
    expect(m.mirroredFromRequirementId).toBe('req-1')
    expect(m.companyId).toBe('sub')
  })
})
