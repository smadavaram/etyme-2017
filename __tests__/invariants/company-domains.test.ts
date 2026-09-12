import { describe, it, expect } from 'vitest'
import {
  decideEntry,
  canClaim,
  describePolicy,
  isConsumerDomain,
  domainOfEmail,
  type ClaimedDomain,
} from '@/lib/company-domains'

/**
 * The old model was Company.domain — one unique string, and the company
 * *was* that domain. Common, and wrong in ways that only show up once real
 * companies arrive: conglomerates hold dozens, subsidiaries share a family
 * and are deliberately separate, mergers need two tenants to become one,
 * and a rebrand should not cost a company its identity.
 *
 * Patching the string made it worse. Reducing every address to its
 * registrable domain fixed mail.corp.com creating a duplicate and
 * immediately forced us.infosys.com and infosys.com into one tenant that
 * neither asked for. One failure traded for another.
 *
 * A domain is a claim, not an identity.
 */

function claim(over: Partial<ClaimedDomain> & { domain: string }): ClaimedDomain {
  return {
    companyId: 'c1',
    companyName: 'Infosys',
    verified: true,
    joinPolicy: 'REQUEST',
    ...over,
  }
}

describe('an exact claim decides', () => {
  it('joins somebody straight in where the company said so', () => {
    const e = decideEntry('dev@infosys.com', [claim({ domain: 'infosys.com', joinPolicy: 'AUTO' })])
    expect(e.action).toBe('JOIN')
  })

  it('gives them a seat and asks somebody, which is the default', () => {
    // Auto-join is a choice a company makes, not what happens by default.
    const e = decideEntry('dev@infosys.com', [claim({ domain: 'infosys.com' })])
    expect(e.action).toBe('REQUEST')
  })

  it('lets a company claim a domain that admits nobody', () => {
    // A marketing domain claimed so nobody else takes it. Falling through
    // to CREATE would hand them a second tenant.
    const e = decideEntry('x@infosys.com', [claim({ domain: 'infosys.com', joinPolicy: 'NONE' })])
    expect(e.action).toBe('REFUSE')
    expect(e.message).toMatch(/ask them to invite you/i)
  })

  it('ignores a claim nobody has proved', () => {
    const e = decideEntry('dev@infosys.com', [claim({ domain: 'infosys.com', verified: false })])
    expect(e.action).toBe('CREATE')
  })
})

describe('a subsidiary is asked rather than guessed at', () => {
  it('does not silently join us.infosys.com to infosys.com', () => {
    // The bug the registrable-domain patch introduced. Infosys US and
    // Infosys India have different legal entities, payroll and clients,
    // and DNS cannot tell you which reading is right.
    const e = decideEntry('ops@us.infosys.com', [claim({ domain: 'infosys.com', joinPolicy: 'AUTO' })])
    expect(e.action).toBe('SUGGEST')
    expect(e.action).not.toBe('JOIN')
  })

  it('asks the question in a form somebody can answer', () => {
    const e = decideEntry('ops@us.infosys.com', [claim({ domain: 'infosys.com' })])
    expect(e.message).toMatch(/part of them, or a separate company/i)
  })

  it('joins them properly once the subsidiary domain is claimed too', () => {
    // The company decides, not DNS. Adding the domain is the decision.
    const e = decideEntry('ops@us.infosys.com', [
      claim({ domain: 'infosys.com', joinPolicy: 'AUTO' }),
      claim({ domain: 'us.infosys.com', joinPolicy: 'AUTO' }),
    ])
    expect(e.action).toBe('JOIN')
  })

  it('keeps a subsidiary separate when it is a separate tenant', () => {
    // Two claims, two companies, and nothing merges them.
    const e = decideEntry('ops@us.infosys.com', [
      claim({ domain: 'infosys.com', companyId: 'in', companyName: 'Infosys India' }),
      claim({ domain: 'us.infosys.com', companyId: 'us', companyName: 'Infosys US', joinPolicy: 'AUTO' }),
    ])
    expect(e.action).toBe('JOIN')
    if (e.action === 'JOIN') expect(e.companyId).toBe('us')
  })
})

describe('a conglomerate holding many domains', () => {
  it('treats every claimed domain as the same company', () => {
    // The case a unique column forbids outright.
    const unilever: ClaimedDomain[] = [
      claim({ domain: 'unilever.com', companyId: 'u', companyName: 'Unilever', joinPolicy: 'AUTO' }),
      claim({ domain: 'benjerry.com', companyId: 'u', companyName: 'Unilever', joinPolicy: 'AUTO' }),
      claim({ domain: 'dove.com', companyId: 'u', companyName: 'Unilever', joinPolicy: 'AUTO' }),
    ]
    for (const email of ['a@unilever.com', 'b@benjerry.com', 'c@dove.com']) {
      const e = decideEntry(email, unilever)
      expect(e.action, email).toBe('JOIN')
      if (e.action === 'JOIN') expect(e.companyId, email).toBe('u')
    }
  })
})

describe('mail subdomains, which started all this', () => {
  it('still suggests rather than creating a duplicate', () => {
    // The original bug: somebody on mail.corp.com created a second tenant
    // for the same organisation. Now they are asked.
    const e = decideEntry('x@mail.corp.com', [claim({ domain: 'corp.com', companyName: 'Corp' })])
    expect(e.action).toBe('SUGGEST')
  })
})

describe('people who belong to nobody', () => {
  it('makes a consumer address a consultant, not a company', () => {
    for (const email of ['a@gmail.com', 'b@outlook.com', 'c@yahoo.co.in', 'd@proton.me']) {
      expect(decideEntry(email, []).action, email).toBe('CONSULTANT')
    }
  })

  it('does not call it a lesser outcome', () => {
    const e = decideEntry('a@gmail.com', [])
    expect(e.message).toMatch(/take it between agencies/i)
  })

  it('refuses something that is not an address', () => {
    expect(decideEntry('nonsense', []).action).toBe('REFUSE')
  })
})

describe('claiming a domain', () => {
  it('takes the identity provider’s word, because it already proved it', () => {
    const v = canClaim('corp.com', undefined, true)
    expect(v.ok).toBe(true)
    expect(v.needsProof).toBe(false)
  })

  it('asks for DNS proof otherwise', () => {
    // A claim can admit people to a tenant, so it is never taken on
    // somebody's word.
    const v = canClaim('corp.com', undefined, false)
    expect(v.ok).toBe(true)
    expect(v.needsProof).toBe(true)
    expect(v.reason).toMatch(/admits nobody/i)
  })

  it('refuses a consumer provider outright', () => {
    // Claiming gmail.com would admit the entire internet.
    const v = canClaim('gmail.com', undefined, true)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/belongs to everybody/i)
  })

  it('refuses a domain somebody else already holds, and names them', () => {
    const v = canClaim('corp.com', { domain: 'corp.com', companyId: 'x', companyName: 'Corp Ltd', verified: true, joinPolicy: 'AUTO' }, true)
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('Corp Ltd')
    expect(v.reason).toMatch(/they can release it/i)
  })
})

describe('what a policy means, said before it is chosen', () => {
  it('warns about auto-join on a domain that may not be exclusively yours', () => {
    // The mistake that quietly admits strangers: a shared host, a
    // university, a holding company whose domain a dozen firms use.
    const d = describePolicy('AUTO', 'university.edu')
    expect(d.caution).toMatch(/admits strangers/i)
  })

  it('has nothing to warn about on the default', () => {
    expect(describePolicy('REQUEST', 'corp.com').caution).toBeNull()
  })
})

describe('reading the domain off an address', () => {
  it('takes it exactly, without reducing it', () => {
    // Reduction is what merged the subsidiary. The claim is exact.
    expect(domainOfEmail('a@us.infosys.com')).toBe('us.infosys.com')
  })

  it('handles a trailing dot and capitals', () => {
    expect(domainOfEmail('A@Corp.COM.')).toBe('corp.com')
  })

  it('knows the consumer providers', () => {
    expect(isConsumerDomain('gmail.com')).toBe(true)
    expect(isConsumerDomain('cloudepa.com')).toBe(false)
  })
})
