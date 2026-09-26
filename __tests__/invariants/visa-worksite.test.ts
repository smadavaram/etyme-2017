import { describe, it, expect } from 'vitest'
import {
  mayMoveTo, worksiteTied, sameArea, SHORT_TERM_DAYS, CHAIN_EVIDENCE, I9_CAUTION,
} from '@/lib/visa-worksite'

/**
 * An H-1B filing pack for thirteen real employees shows the shape of
 * this: Applied Materials via Infosys via Expedite, HP via Infosys via
 * Expedite, thyssenkrupp direct. People move between those clients,
 * because moving people between clients is the business.
 *
 * It is also the commonest way an employer accidentally puts somebody
 * out of status. An H-1B is not permission to work in the United States
 * — it is permission to work in a named job, for a named employer, at a
 * named place, and the product is the only thing in the building that
 * knows the move is coming.
 */

describe('whose move is a legal question at all', () => {
  it('treats a move on an H-1B as one', () => {
    expect(worksiteTied('H1B')).toBe(true)
  })

  it('does not treat a green card holder’s move as one', () => {
    // They may work anywhere for anyone. Moving them is commercial.
    expect(worksiteTied('GC')).toBe(false)
    const d = mayMoveTo('GC', { petitionedArea: 'San Jose', proposedArea: 'Dallas' })
    expect(d.verdict).toBe('PASS')
    expect(d.reason).toMatch(/not tied to a worksite/i)
  })

  it('does not treat somebody with no recorded visa as sponsored', () => {
    expect(mayMoveTo(null, { petitionedArea: 'San Jose', proposedArea: 'Dallas' }).verdict).toBe('PASS')
  })
})

describe('moving to a client in another part of the country', () => {
  it('blocks it until an amended petition is filed', () => {
    // Matter of Simeio Solutions: a worksite change needing a new LCA is
    // a material change to the petition.
    const d = mayMoveTo('H1B', { petitionedArea: 'san-jose-ca', proposedArea: 'houston-tx' })
    expect(d.verdict).toBe('BLOCK')
    expect(d.reason).toMatch(/material change/i)
  })

  it('says starting before the filing is unauthorised employment, in those words', () => {
    const d = mayMoveTo('H1B', { petitionedArea: 'san-jose-ca', proposedArea: 'houston-tx' })
    expect(d.reason).toMatch(/unauthorised employment/i)
  })

  it('says they may start once it is filed, not once it is approved', () => {
    // Routinely got wrong in the other direction, and waiting for
    // approval strands somebody on the bench for months for no legal
    // reason.
    const d = mayMoveTo('H1B', { petitionedArea: 'san-jose-ca', proposedArea: 'houston-tx' })
    expect(d.action).toMatch(/approval is not required first/i)
  })

  it('passes once the amendment is on file', () => {
    const d = mayMoveTo('H1B', {
      petitionedArea: 'san-jose-ca', proposedArea: 'houston-tx', amendmentFiled: true,
    })
    expect(d.verdict).toBe('PASS')
  })
})

describe('moving to a client down the road', () => {
  it('needs no amendment when the new site is in the same area', () => {
    const d = mayMoveTo('H1B', { petitionedArea: 'san-jose-ca', proposedArea: 'SAN-JOSE-CA ' })
    expect(d.verdict).toBe('WARN')
    expect(d.reason).toMatch(/no new LCA and no amended petition/i)
  })

  it('will not decide two city names are one area by comparing the words', () => {
    // Santa Clara and San Jose are one metropolitan area; Kansas City KS
    // and Kansas City MO are also one; and "Springfield" is a dozen
    // places. No amount of comparing strings gets any of that right, so
    // the input is an opaque key an MSA table produces, and a mismatch
    // here fails safe.
    expect(sameArea('Santa Clara, CA', 'San Jose, CA')).toBe(false)
    expect(mayMoveTo('H1B', {
      petitionedArea: 'Santa Clara, CA', proposedArea: 'San Jose, CA',
    }).verdict).toBe('BLOCK')
  })

  it('still asks for the posting notice, which is why it warns rather than passes', () => {
    const d = mayMoveTo('H1B', { petitionedArea: 'san-jose-ca', proposedArea: 'san-jose-ca' })
    expect(d.action).toMatch(/post the LCA notice/i)
  })
})

describe('the short-term placement exemption, which is real and narrow', () => {
  it('allows a brief stint at a site outside the petitioned area', () => {
    const d = mayMoveTo('H1B', {
      petitionedArea: 'san-jose-ca', proposedArea: 'houston-tx', workdaysThisYear: 12,
    })
    expect(d.verdict).toBe('WARN')
    expect(d.reason).toContain('12')
  })

  it('names the day the exemption runs out, rather than leaving somebody to find out', () => {
    const d = mayMoveTo('H1B', {
      petitionedArea: 'san-jose-ca', proposedArea: 'houston-tx', workdaysThisYear: 28,
    })
    expect(d.action).toContain(String(SHORT_TERM_DAYS + 1))
  })

  it('blocks once the thirty workdays are spent', () => {
    const d = mayMoveTo('H1B', {
      petitionedArea: 'san-jose-ca', proposedArea: 'houston-tx', workdaysThisYear: 31,
    })
    expect(d.verdict).toBe('BLOCK')
  })
})

describe('not knowing where they were petitioned to work stops the move', () => {
  it('blocks when the petition has no location recorded', () => {
    // The conservative direction on purpose. "We could not tell" must
    // never resolve to "carry on" — that is how somebody works a month
    // out of status.
    const d = mayMoveTo('H1B', { petitionedArea: null, proposedArea: 'houston-tx' })
    expect(d.verdict).toBe('BLOCK')
    expect(d.action).toMatch(/find the location on the approved petition/i)
  })

  it('blocks when the new site has no address recorded', () => {
    expect(mayMoveTo('H1B', { petitionedArea: 'san-jose-ca', proposedArea: null }).verdict).toBe('BLOCK')
  })

  it('never treats an unknown area as matching another unknown one', () => {
    expect(sameArea(null, null)).toBe(false)
  })
})

describe('the evidence a petition needs is evidence the product already holds', () => {
  it('names the whole chain, because USCIS asks about every hop of it', () => {
    // Straight off a real filing pack: client letter, vendor letter, and
    // the MSA and SOW between them. Applied Materials via Infosys via
    // Expedite is three hops, and the question being asked is whether an
    // employer-employee relationship survives all three.
    expect(CHAIN_EVIDENCE.map((e) => e.key)).toEqual(['CLIENT_LETTER', 'VENDOR_LETTER', 'MSA', 'SOW'])
  })

  it('warns that none of it may be demanded for an I-9', () => {
    // Two processes, two purposes, one filing cabinet — which is exactly
    // why they get confused. Asking a visa holder for their I-797
    // "because we have it anyway" is document abuse under §1324b(a)(6).
    expect(I9_CAUTION).toMatch(/document abuse/i)
    expect(I9_CAUTION).toMatch(/employee chooses/i)
  })
})
