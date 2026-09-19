import { describe, it, expect } from 'vitest'
import {
  whyContract,
  whyConsultant,
  whyRequirement,
  refusalText,
  type Viewer,
} from '@/lib/why'

/**
 * Access here is decided by six separate rule sets, and fifteen routes
 * compose them by hand. One composed them wrongly and showed a walled
 * delivery manager every contract on the platform.
 *
 * So: one place decides, and every answer explains itself. "Insufficient
 * privileges" is what teaches people to work around a product; a sentence
 * that says what to do instead is what makes an administrator trust it.
 */

function viewer(over: Partial<Viewer> = {}): Viewer {
  return {
    personId: 'priya',
    name: 'Priya Anand',
    companyId: 'ravensbourne',
    companyName: 'Ravensbourne Systems',
    outsideAccess: 'NAMED_ONLY',
    permissions: ['assignments.read', 'consultants.read', 'requirements.read'],
    orgUnitId: 'retail',
    unitsVisible: ['retail'],
    unitName: 'Retail account',
    ...over,
  }
}

const CONTRACT = {
  personId: 'meera',
  companyId: 'ravensbourne',
  clientCompanyId: 'nike',
  endClientCompanyId: null,
  deliveryUnitId: 'retail',
  orgUnitId: null,
}

describe('why somebody can see a placement', () => {
  it('always lets a person read their own', () => {
    const w = whyContract(viewer({ personId: 'meera', permissions: [] }), CONTRACT)
    expect(w.visible).toBe(true)
    expect(w.because).toMatch(/their own work is always theirs/i)
  })

  it('names the missing permission, and who can add it', () => {
    // "Insufficient privileges" is a support ticket. This is an answer.
    const w = whyContract(viewer({ permissions: [] }), CONTRACT)
    expect(w.visible).toBe(false)
    expect(w.fix).toMatch(/assignments\.read/)
    expect(w.fix).toMatch(/team\.manage/)
  })

  it('says plainly when the record belongs to companies theirs never touched', () => {
    const w = whyContract(viewer({ companyId: 'stranger-co' }), CONTRACT)
    expect(w.visible).toBe(false)
    expect(w.because).toMatch(/nothing to do with/i)
    // Nothing an admin can fix, and saying so beats implying otherwise.
    expect(w.fix).toMatch(/^Nothing to change/)
  })

  it('explains an account wall by naming the account they are on', () => {
    const w = whyContract(viewer(), { ...CONTRACT, deliveryUnitId: 'medical' })
    expect(w.visible).toBe(false)
    expect(w.because).toMatch(/another client's account/i)
    expect(w.because).toMatch(/Retail account/)
  })

  it('tells the admin the two ways to fix an account wall', () => {
    const w = whyContract(viewer(), { ...CONTRACT, deliveryUnitId: 'medical' })
    expect(w.fix).toMatch(/Move them onto that account/i)
    expect(w.fix).toMatch(/take them off accounts altogether/i)
  })

  it('keeps unallocated work visible rather than walling it by accident', () => {
    const w = whyContract(viewer(), { ...CONTRACT, deliveryUnitId: null })
    expect(w.visible).toBe(true)
  })

  it('reads the buyer’s org chart when the viewer is the buyer', () => {
    // A supplier's accounts and a buyer's departments are two different
    // companies' structures, and filtering one by the other is meaningless.
    const w = whyContract(
      viewer({ companyId: 'nike', unitsVisible: ['footwear'], unitName: 'Footwear' }),
      { ...CONTRACT, deliveryUnitId: 'retail', orgUnitId: 'footwear' }
    )
    expect(w.visible).toBe(true)
  })

  it('lists the fields withheld from a record they can see', () => {
    const w = whyContract(viewer(), CONTRACT)
    expect(w.visible).toBe(true)
    expect(w.hidden.map((h) => h.field)).toContain('payRate')
    expect(w.hidden.find((h) => h.field === 'payRate')!.because).toMatch(/consultants\.cost/)
  })

  it('shows every rule it consulted, in order', () => {
    // An administrator debugging access wants the working, not the verdict.
    const w = whyContract(viewer(), { ...CONTRACT, deliveryUnitId: 'medical' })
    expect(w.checks.map((c) => c.rule)).toEqual(['PERMISSION', 'PARTY', 'ACCOUNT_WALL'])
  })
})

describe('why somebody can see a person', () => {
  const ON_OUR_BENCH = { personId: 'anita', listedTo: ['ravensbourne'], worksAt: [] }
  const SOMEBODY_ELSES = { personId: 'anita', listedTo: ['cloudepa'], worksAt: [] }

  it('credits the consultant’s own choice, not the company’s permission', () => {
    const w = whyConsultant(viewer(), ON_OUR_BENCH)
    expect(w.visible).toBe(true)
    expect(w.because).toMatch(/by their own choice/i)
  })

  it('refuses a delivery employee looking at somebody else’s bench', () => {
    const w = whyConsultant(viewer(), SOMEBODY_ELSES)
    expect(w.visible).toBe(false)
    expect(w.fix).toMatch(/network\.read/)
  })

  it('lets the contractor desk look, because that is their job', () => {
    const w = whyConsultant(
      viewer({ permissions: ['consultants.read', 'network.read'] }),
      SOMEBODY_ELSES
    )
    expect(w.visible).toBe(true)
  })

  it('says a closed company is closed, and that no role changes it', () => {
    const w = whyConsultant(
      viewer({ outsideAccess: 'CLOSED', permissions: ['consultants.read', 'network.read'] }),
      SOMEBODY_ELSES
    )
    expect(w.visible).toBe(false)
    expect(w.fix).toMatch(/No role overrides it/i)
  })

  it('never names a stranger’s bench as the reason', () => {
    // Which agency holds them is the thing the wall exists to keep quiet.
    const w = whyConsultant(viewer(), SOMEBODY_ELSES)
    expect(JSON.stringify(w)).not.toMatch(/cloudepa/i)
  })
})

describe('why somebody can see a piece of demand', () => {
  const REQ = {
    companyId: 'terumo',
    openToNetwork: false,
    status: 'OPEN',
    invited: ['cloudepa'],
    endClientVisible: false,
  }

  it('lets the company that raised it read it', () => {
    expect(whyRequirement(viewer({ companyId: 'terumo' }), REQ).visible).toBe(true)
  })

  it('lets an invited supplier read it, and hides the band', () => {
    const w = whyRequirement(viewer({ companyId: 'cloudepa', outsideAccess: 'ALLOWED' }), REQ)
    expect(w.visible).toBe(true)
    expect(w.hidden.map((h) => h.field)).toContain('billMin, billMax')
  })

  it('refuses an uninvited supplier on an invite-only role', () => {
    const w = whyRequirement(viewer({ companyId: 'northwind', outsideAccess: 'ALLOWED' }), REQ)
    expect(w.visible).toBe(false)
    expect(w.because).toMatch(/invite-only/i)
    expect(w.fix).toMatch(/decides who sees it/i)
  })

  it('opens it to anybody who may look outside, once it is published to the network', () => {
    const w = whyRequirement(
      viewer({ companyId: 'northwind', outsideAccess: 'ALLOWED' }),
      { ...REQ, openToNetwork: true }
    )
    expect(w.visible).toBe(true)
  })

  it('still refuses a delivery employee at a walled firm, network or not', () => {
    const w = whyRequirement(viewer({ companyId: 'ravensbourne' }), { ...REQ, openToNetwork: true })
    expect(w.visible).toBe(false)
    expect(w.fix).toMatch(/network\.read/)
  })

  it('hides the end client until the firm holding it says otherwise', () => {
    const w = whyRequirement(viewer({ companyId: 'cloudepa', outsideAccess: 'ALLOWED' }), REQ)
    expect(w.hidden.map((h) => h.field)).toContain('endClientCompany')
    const shown = whyRequirement(
      viewer({ companyId: 'cloudepa', outsideAccess: 'ALLOWED' }),
      { ...REQ, endClientVisible: true }
    )
    expect(shown.hidden.map((h) => h.field)).not.toContain('endClientCompany')
  })
})

describe('what a refused person is shown', () => {
  it('reads as one sentence with the way out', () => {
    const w = whyContract(viewer({ permissions: [] }), CONTRACT)
    const said = refusalText(w)
    expect(said).toMatch(/assignments\.read/)
    expect(said.split('.').length).toBeGreaterThan(1)
  })

  it('says nothing extra when there is nothing to do', () => {
    const w = whyContract(viewer({ personId: 'meera' }), CONTRACT)
    expect(refusalText(w)).toBe(w.because)
  })
})
