import { describe, it, expect } from 'vitest'
import { packetByKey } from '@/lib/packets'
import {
  deriveSupplierPacket,
  deriveStartPacket,
  differenceFromStatic,
  explainDerivation,
  type Circumstances,
} from '@/lib/packet-derivation'

/**
 * The five static checklists were the 2017 shape: a list somebody typed,
 * right for the case it was typed for and quietly wrong for every other.
 *
 * A W-2 employee and a corp-to-corp contractor need almost disjoint sets. A
 * UK placement needs a right-to-work check and no I-9. An H-1B holder needs
 * an approval notice; a citizen does not. A list cannot hold that.
 */

const US: Circumstances = { country: 'US', onSite: true }
const keys = (items: { key: string }[]) => items.map((i) => i.key)

describe('bringing on a supplier', () => {
  it('asks a US supplier for a W-9 and workers’ compensation', () => {
    const d = deriveSupplierPacket(US)
    expect(keys(d.items)).toContain('W9')
    expect(keys(d.items)).toContain('INSURANCE_WC')
  })

  it('asks a UK supplier for VAT instead, and never for a W-9', () => {
    // The static list asked every supplier on earth for a W-9.
    const d = deriveSupplierPacket({ country: 'GB', onSite: true })
    expect(keys(d.items)).toContain('VAT_REG')
    expect(keys(d.items)).not.toContain('W9')
    expect(keys(d.items)).not.toContain('INSURANCE_WC')
  })

  it('asks an Indian supplier for GST and PAN', () => {
    const d = deriveSupplierPacket({ country: 'IN' })
    expect(keys(d.items)).toContain('GST_REG')
    expect(keys(d.items)).toContain('PAN')
  })

  it('asks for cyber cover only where people touch our systems', () => {
    expect(keys(deriveSupplierPacket({ ...US, systemsAccess: true }).items)).toContain('INSURANCE_CYBER')
    expect(keys(deriveSupplierPacket({ ...US, systemsAccess: false }).items)).not.toContain('INSURANCE_CYBER')
  })

  it('asks for professional indemnity only on a large engagement', () => {
    expect(keys(deriveSupplierPacket({ ...US, valueCents: 900_000_00 }).items)).toContain('INSURANCE_EO')
    expect(keys(deriveSupplierPacket({ ...US, valueCents: 40_000_00 }).items)).not.toContain('INSURANCE_EO')
  })

  it('asks for a signed agreement only when there is not one already', () => {
    expect(keys(deriveSupplierPacket({ ...US, hasAgreement: false }).items)).toContain('MSA_SIGNED')
    expect(keys(deriveSupplierPacket({ ...US, hasAgreement: true }).items)).not.toContain('MSA_SIGNED')
  })

  it('always asks for the three things every supplier needs, wherever they are', () => {
    for (const country of ['US', 'GB', 'IN', 'DE']) {
      const k = keys(deriveSupplierPacket({ country }).items)
      expect(k, country).toContain('BUSINESS_PARTNER')
      expect(k, country).toContain('BANK_LETTER')
      expect(k, country).toContain('INSURANCE_GL')
    }
  })
})

describe('starting somebody', () => {
  it('asks a US W-2 hire for an I-9 and says it cannot be waived', () => {
    const d = deriveStartPacket({ country: 'US', classification: 'W2', onSite: true })
    expect(keys(d.items)).toContain('I9_EVERIFY')
    expect(d.reasoning.join(' ')).toMatch(/cannot be waived/i)
  })

  it('asks a UK hire for a right-to-work check and never for an I-9', () => {
    // An I-9 in the UK is a form that does not exist, and asking for it
    // makes the whole request look automated and wrong.
    const d = deriveStartPacket({ country: 'GB', classification: 'W2' })
    expect(keys(d.items)).toContain('RIGHT_TO_WORK_UK')
    expect(keys(d.items)).not.toContain('I9_EVERIFY')
  })

  it('puts the insurance on the contractor’s own company on corp-to-corp', () => {
    // The whole point of the classification: on C2C the contractor is the
    // employer, so the cover has to be theirs, not the vendor's.
    const d = deriveStartPacket({ country: 'US', classification: 'C2C' })
    expect(keys(d.items)).toContain('INSURANCE_WC')
    expect(d.items.find((i) => i.key === 'INSURANCE_WC')!.hint).toMatch(/your own company/i)
    // And no I-9, because nobody is employing them here.
    expect(keys(d.items)).not.toContain('I9_EVERIFY')
  })

  it('asks a visa holder for their approval notice and an I-94', () => {
    const d = deriveStartPacket({ country: 'US', classification: 'W2', workAuth: 'H1B' })
    expect(keys(d.items)).toContain('VISA_APPROVAL')
    expect(keys(d.items)).toContain('I94')
  })

  it('does not ask a citizen for a visa document', () => {
    const d = deriveStartPacket({ country: 'US', classification: 'W2', workAuth: 'US_CITIZEN' })
    expect(keys(d.items)).not.toContain('VISA_APPROVAL')
  })

  it('does not ask for a background check for somebody who is never on site', () => {
    expect(keys(deriveStartPacket({ country: 'US', classification: 'W2', onSite: false }).items))
      .not.toContain('BACKGROUND_CHECK')
  })

  it('always asks for confidentiality, whoever they are', () => {
    for (const classification of ['W2', 'C2C', 'IND_1099', 'C2H_W2']) {
      expect(keys(deriveStartPacket({ country: 'US', classification }).items), classification)
        .toContain('NDA')
    }
  })
})

describe('when two rules want the same thing', () => {
  it('keeps it required if either rule required it', () => {
    const d = deriveStartPacket({ country: 'US', classification: 'C2C', onSite: true })
    expect(d.items.find((i) => i.key === 'INSURANCE_WC')!.required).toBe(true)
  })

  it('never lists the same document twice', () => {
    for (const c of [
      { country: 'US', classification: 'C2C', onSite: true, systemsAccess: true, valueCents: 900_000_00 },
      { country: 'GB', classification: 'W2', workAuth: 'H1B' },
    ] as Circumstances[]) {
      const k = keys(deriveStartPacket(c).items)
      expect(new Set(k).size).toBe(k.length)
      const s = keys(deriveSupplierPacket(c).items)
      expect(new Set(s).size).toBe(s.length)
    }
  })
})

describe('being able to see why', () => {
  it('says which rule asked for each thing', () => {
    // A rule engine nobody can inspect is a worse list than the list.
    const d = deriveSupplierPacket({ ...US, systemsAccess: true })
    const cyber = d.items.find((i) => i.key === 'INSURANCE_CYBER')!
    expect(cyber.becauseOf).toMatch(/access to our systems/i)
  })

  it('answers "why eleven and not four" in one sentence', () => {
    // "Our policy" is the answer that makes somebody phone you.
    const c: Circumstances = { country: 'US', classification: 'C2C', workAuth: 'H1B', systemsAccess: true, valueCents: 900_000_00 }
    const s = explainDerivation(deriveSupplierPacket(c), c)
    expect(s).toMatch(/because this is/i)
    expect(s).toContain('US')
    expect(s).toContain('systems')
  })

  it('shows what a static list would have asked for and does not need', () => {
    const staticPack = packetByKey('VENDOR_ONBOARDING_US')!
    const derived = deriveSupplierPacket({ country: 'GB' })
    const diff = differenceFromStatic(derived.items, staticPack.items)
    // A UK supplier being asked for a W-9 and workers' comp is exactly the
    // thing that makes a request look machine-generated.
    expect(diff.notNeeded).toContain('W-9')
    expect(diff.notNeeded).toContain("Certificate of workers' compensation")
  })

  it('shows what the derivation added that a static list would have missed', () => {
    const staticPack = packetByKey('VENDOR_ONBOARDING_US')!
    const derived = deriveSupplierPacket({ country: 'IN' })
    const diff = differenceFromStatic(derived.items, staticPack.items)
    expect(diff.addedBecause.map((a) => a.label)).toContain('GST registration')
    expect(diff.addedBecause.find((a) => a.label === 'GST registration')!.because).toMatch(/GST and PAN/i)
  })
})

describe('the shape of a derived packet', () => {
  it('never produces an empty list', () => {
    // An empty request is worse than a wrong one: nobody knows what to do.
    for (const country of ['US', 'GB', 'IN', 'DE', 'AU']) {
      expect(deriveSupplierPacket({ country }).items.length, country).toBeGreaterThan(0)
      expect(deriveStartPacket({ country, classification: 'W2' }).items.length, country).toBeGreaterThan(0)
    }
  })

  it('explains every item in words the counterparty would use', () => {
    for (const item of deriveSupplierPacket({ ...US, systemsAccess: true }).items) {
      expect(item.hint.length, item.key).toBeGreaterThan(15)
      expect(item.becauseOf.length, item.key).toBeGreaterThan(15)
    }
  })
})

describe('how the explanation reads', () => {
  it('names a classification the way a person says it', () => {
    // "engaged w2" reads as a machine talking.
    const c: Circumstances = { country: 'US', classification: 'W2' }
    expect(explainDerivation(deriveStartPacket(c), c)).toContain('on W-2')
    const c2: Circumstances = { country: 'US', classification: 'C2C' }
    expect(explainDerivation(deriveStartPacket(c2), c2)).toContain('corp-to-corp')
  })
})
