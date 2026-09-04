/**
 * What tax lands on an invoice, and when we refuse to say.
 *
 * The refusals are the point. An under-taxed invoice is a liability that
 * surfaces two years later with interest, and a plausible zero is the one
 * output nobody ever audits.
 */

import { describe, it, expect } from 'vitest'
import { taxFor, withholdingFor } from '@/lib/billing-cascade'

const US = { country: 'US' }
const IN_MH = { country: 'IN', state: 'MH' }

describe('Where the work was done decides the tax, not where the vendor sits', () => {
  it('a US invoice is taxed in the state where the work was done, not where the vendor sits', () => {
    const v = taxFor({
      supplier: { country: 'US', state: 'TX' },
      placeOfPerformance: { country: 'US', state: 'CT' },
      customer: { country: 'US', state: 'NY' },
      netMinor: 1_000_000,
    })
    expect(v.placeOfSupply).toBe('CT')
    expect(v.outcome).toBe('TAXABLE')
    // Connecticut's special 1% rate for personnel services.
    expect(v.rateBps).toBe(100)
    expect(v.taxMinor).toBe(10_000)
    expect(v.grossMinor).toBe(1_010_000)
  })

  it('a US supply with no state on the ship-to refuses to name a tax rate rather than guessing one', () => {
    const v = taxFor({
      supplier: US,
      placeOfPerformance: { country: 'US' },
      customer: US,
      netMinor: 500_000,
    })
    expect(v.outcome).toBe('UNKNOWN')
    expect(v.rateBps).toBeNull()
    expect(v.taxMinor).toBeNull()
    expect(v.says).toContain('does not say which state')
  })

  it('a state that does not tax staffing services is zero rated for that reason, not for want of data', () => {
    const v = taxFor({
      supplier: { country: 'US', state: 'CO' },
      placeOfPerformance: { country: 'US', state: 'CO' },
      customer: US,
      netMinor: 250_000,
    })
    expect(v.outcome).toBe('ZERO_RATED')
    expect(v.taxMinor).toBe(0)
    expect(v.basis).toContain('CO')
  })

  it('an invoice with no place of supply at all returns no rate and says why', () => {
    const v = taxFor({
      supplier: US,
      placeOfPerformance: null,
      customer: US,
      netMinor: 100_000,
    })
    expect(v.outcome).toBe('UNKNOWN')
    expect(v.grossMinor).toBeNull()
    expect(v.says).toContain('where this work was done')
  })
})

describe('Europe: the customer accounts for it when the customer is a business elsewhere', () => {
  it('a supply between two EU states with both VAT numbers is reverse charged, and the invoice says so', () => {
    const v = taxFor({
      supplier: { country: 'IE', taxId: 'IE1234567X' },
      placeOfPerformance: { country: 'DE' },
      customer: { country: 'DE', taxId: 'DE123456789' },
      netMinor: 800_000,
    })
    expect(v.outcome).toBe('REVERSE_CHARGE')
    expect(v.taxMinor).toBe(0)
    expect(v.basis).toContain('Article 196')
    expect(v.says).toContain('reverse charge')
  })

  it('a supply within one EU state carries that state’s own VAT rate', () => {
    const v = taxFor({
      supplier: { country: 'DE', taxId: 'DE1' },
      placeOfPerformance: { country: 'DE' },
      customer: { country: 'DE', taxId: 'DE2' },
      netMinor: 1_000_000,
    })
    expect(v.outcome).toBe('TAXABLE')
    expect(v.rateBps).toBe(1900)
    expect(v.taxMinor).toBe(190_000)
  })

  it('a cross-border EU customer with no VAT number is not reverse charged, and is told why', () => {
    const v = taxFor({
      supplier: { country: 'IE' },
      placeOfPerformance: { country: 'FR' },
      customer: { country: 'FR' },
      netMinor: 100_000,
    })
    expect(v.outcome).toBe('TAXABLE')
    // The supplier's own rate, Ireland at 23%.
    expect(v.rateBps).toBe(2300)
    expect(v.says).toContain('no VAT number')
  })

  it('a UK domestic supply carries twenty per cent VAT', () => {
    const v = taxFor({
      supplier: { country: 'GB' },
      placeOfPerformance: { country: 'GB' },
      customer: { country: 'GB' },
      netMinor: 1_000_000,
    })
    expect(v.rateBps).toBe(2000)
    expect(v.taxMinor).toBe(200_000)
  })

  it('a UK supplier billing a customer abroad is outside the scope of UK VAT', () => {
    const v = taxFor({
      supplier: { country: 'GB' },
      placeOfPerformance: { country: 'GB' },
      customer: { country: 'US' },
      netMinor: 400_000,
    })
    expect(v.outcome).toBe('OUT_OF_SCOPE')
    expect(v.taxMinor).toBe(0)
  })
})

describe('India: the same total, two different returns', () => {
  it('an Indian interstate supply is IGST and an intrastate one splits into CGST and SGST', () => {
    const inter = taxFor({
      supplier: { country: 'IN', state: 'KA' },
      placeOfPerformance: IN_MH,
      customer: { country: 'IN', state: 'MH' },
      netMinor: 1_000_000,
    })
    expect(inter.components.map((c) => c.name)).toEqual(['IGST'])
    expect(inter.rateBps).toBe(1800)
    expect(inter.taxMinor).toBe(180_000)

    const intra = taxFor({
      supplier: { country: 'IN', state: 'MH' },
      placeOfPerformance: IN_MH,
      customer: { country: 'IN', state: 'MH' },
      netMinor: 1_000_000,
    })
    expect(intra.components.map((c) => c.name)).toEqual(['CGST', 'SGST'])
    // Same money as the interstate case, split in two.
    expect(intra.rateBps).toBe(1800)
    expect(intra.taxMinor).toBe(180_000)
  })

  it('an export out of the taxing country carries no tax and says which rule made it zero', () => {
    const v = taxFor({
      supplier: { country: 'IN', state: 'KA' },
      placeOfPerformance: { country: 'IN', state: 'KA' },
      customer: { country: 'US' },
      netMinor: 900_000,
    })
    expect(v.outcome).toBe('ZERO_RATED')
    expect(v.taxMinor).toBe(0)
    expect(v.basis).toContain('Export of services')
    expect(v.says).toContain('not the same as exempt')
  })

  it('an Indian supply missing one of the two states refuses to guess the split', () => {
    const v = taxFor({
      supplier: { country: 'IN' },
      placeOfPerformance: { country: 'IN', state: 'MH' },
      customer: { country: 'IN' },
      netMinor: 100_000,
    })
    expect(v.outcome).toBe('UNKNOWN')
    expect(v.says).toContain('identical totals but different returns')
  })
})

describe('Arithmetic and the edge of the table', () => {
  it('tax is computed on the line, in minor units, and the invoice total is the lines plus the tax', () => {
    const lines = [333_33, 666_67]
    const verdicts = lines.map((n) =>
      taxFor({
        supplier: { country: 'GB' },
        placeOfPerformance: { country: 'GB' },
        customer: { country: 'GB' },
        netMinor: n,
      })
    )
    const net = lines.reduce((a, b) => a + b, 0)
    const tax = verdicts.reduce((a, v) => a + (v.taxMinor ?? 0), 0)
    const gross = verdicts.reduce((a, v) => a + (v.grossMinor ?? 0), 0)
    expect(net).toBe(1_000_00)
    expect(gross).toBe(net + tax)
    // Rounded per line, which is what an invoice shows.
    expect(tax).toBe(Math.round(333_33 * 0.2) + Math.round(666_67 * 0.2))
  })

  it('a country nobody has a rule for returns no rate and says so instead of assuming zero', () => {
    const v = taxFor({
      supplier: { country: 'BR' },
      placeOfPerformance: { country: 'BR' },
      customer: { country: 'BR' },
      netMinor: 100_000,
    })
    expect(v.outcome).toBe('UNKNOWN')
    expect(v.rateBps).toBeNull()
    expect(v.says).toContain('BR')
  })
})

describe('Withholding comes off what is paid, never off what was earned', () => {
  it('withholding is deducted from what the client pays and never from what the vendor earned', () => {
    const w = withholdingFor({
      payerCountry: 'IN',
      supplierCountry: 'IN',
      supplierHasTaxId: true,
      netMinor: 1_000_000,
    })
    expect(w.applies).toBe(true)
    expect(w.rateBps).toBe(1000)
    expect(w.withheldMinor).toBe(100_000)
    expect(w.netOfWithholdingMinor).toBe(900_000)
    expect(w.says).toContain('never be netted into revenue')
  })

  it('US backup withholding is a consequence of a missing form, and stops when the form arrives', () => {
    const without = withholdingFor({
      payerCountry: 'US',
      supplierCountry: 'US',
      supplierHasTaxId: false,
      netMinor: 1_000_000,
    })
    expect(without.applies).toBe(true)
    expect(without.rateBps).toBe(2400)

    const withForm = withholdingFor({
      payerCountry: 'US',
      supplierCountry: 'US',
      supplierHasTaxId: true,
      netMinor: 1_000_000,
    })
    expect(withForm.applies).toBe(false)
    expect(withForm.netOfWithholdingMinor).toBe(1_000_000)
  })
})
