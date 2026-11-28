import { describe, it, expect } from 'vitest'

/**
 * Template pack invariants — from BUILD.md §4.A.
 *
 * POST /api/companies/:id/template-pack { pack }
 *   → contract types, Cycle definitions, DocTemplates, skill graph seeds
 *
 * Four packs: US_IT, US_SAP, IN_DELIVERY, UK.
 * Each is self-consistent: no duplicate cycle kinds, no empty skill
 * seeds, all doc audiences are valid.
 */

import {
  TEMPLATE_PACKS,
  TEMPLATE_PACK_IDS,
  getTemplatePack,
  validatePack,
} from '@/lib/template-packs'
import { isMoneyKind } from '@/lib/cycle-kinds'

describe('Template Packs (BUILD.md §4.A)', () => {
  describe('Registry', () => {
    it('four packs exist: US_IT, US_SAP, IN_DELIVERY, UK', () => {
      expect(TEMPLATE_PACK_IDS).toHaveLength(4)
      expect(TEMPLATE_PACK_IDS).toContain('US_IT')
      expect(TEMPLATE_PACK_IDS).toContain('US_SAP')
      expect(TEMPLATE_PACK_IDS).toContain('IN_DELIVERY')
      expect(TEMPLATE_PACK_IDS).toContain('UK')
    })

    it('getTemplatePack returns null for an unknown pack', () => {
      expect(getTemplatePack('FAKE')).toBeNull()
    })

    it('getTemplatePack returns the pack for a known id', () => {
      const pack = getTemplatePack('US_IT')
      expect(pack).not.toBeNull()
      expect(pack!.id).toBe('US_IT')
    })
  })

  describe('Every pack passes validation', () => {
    for (const id of TEMPLATE_PACK_IDS) {
      it(`${id} has no validation errors`, () => {
        const pack = TEMPLATE_PACKS[id]
        const errors = validatePack(pack)
        expect(errors).toHaveLength(0)
      })
    }
  })

  describe('Contract types', () => {
    it('US_IT includes W2, C2C, 1099, and C2H_W2', () => {
      const codes = TEMPLATE_PACKS.US_IT.contractTypes.map((c) => c.code)
      expect(codes).toContain('W2')
      expect(codes).toContain('C2C')
      expect(codes).toContain('1099')
      expect(codes).toContain('C2H_W2')
    })

    it('UK includes Limited Company, Umbrella, and PAYE — IR35 country', () => {
      const codes = TEMPLATE_PACKS.UK.contractTypes.map((c) => c.code)
      expect(codes).toContain('LIMITED_COMPANY')
      expect(codes).toContain('UMBRELLA')
      expect(codes).toContain('PAYE')
    })

    it('IN_DELIVERY includes CDD and FIXED_TERM — Indian labor law', () => {
      const codes = TEMPLATE_PACKS.IN_DELIVERY.contractTypes.map((c) => c.code)
      expect(codes).toContain('CDD')
      expect(codes).toContain('FIXED_TERM')
    })
  })

  describe('Cycle definitions', () => {
    it('every pack has at least TIMESHEET_SUBMIT and SALARY_PAY cycles', () => {
      for (const id of TEMPLATE_PACK_IDS) {
        const kinds = TEMPLATE_PACKS[id].cycleDefinitions.map((c) => c.kind)
        expect(kinds).toContain('TIMESHEET_SUBMIT')
        expect(kinds).toContain('SALARY_PAY')
      }
    })

    // These two pinned the opposite. An IR35 assessment and a GST return
    // were carried as billing cycles, which shifted them off weekends for
    // no reason and put them where nothing read them. A reminder is not
    // a billing event; the UK pack already asks for the IR35 determination
    // as a document, which is what it is.
    it('no pack generates a compliance cycle — a reminder is not a billing event', () => {
      for (const id of TEMPLATE_PACK_IDS) {
        const kinds = TEMPLATE_PACKS[id].cycleDefinitions.map((c) => c.kind)
        for (const gone of ['IR35_ASSESSMENT', 'GST_RETURN', 'TAX_WITHHOLD']) {
          expect(kinds, `${id} still carries ${gone}`).not.toContain(gone)
        }
      }
    })

    it('the UK asks for the IR35 determination as a document, not as a cycle', () => {
      const docs = TEMPLATE_PACKS.UK.docTemplates.map((d) => d.name)
      expect(docs.some((n) => /IR35/i.test(n))).toBe(true)
    })

    it('no pack generates a commission cycle while there is no commission plan to calculate against', () => {
      for (const id of TEMPLATE_PACK_IDS) {
        const kinds = TEMPLATE_PACKS[id].cycleDefinitions.map((c) => c.kind)
        expect(kinds.filter((k) => k.startsWith('COMMISSION_')), id).toEqual([])
      }
    })

    it('every cycle a pack carries is a kind something actually reads', () => {
      for (const id of TEMPLATE_PACK_IDS) {
        for (const c of TEMPLATE_PACKS[id].cycleDefinitions) {
          expect(isMoneyKind(c.kind), `${id}: ${c.kind}`).toBe(true)
        }
      }
    })

    it('no pack has duplicate cycle kinds', () => {
      for (const id of TEMPLATE_PACK_IDS) {
        const kinds = TEMPLATE_PACKS[id].cycleDefinitions.map((c) => c.kind)
        const unique = new Set(kinds)
        expect(unique.size).toBe(kinds.length)
      }
    })

    it('every cycle has a valid frequency', () => {
      const valid = new Set(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'ON_COMPLETION'])
      for (const id of TEMPLATE_PACK_IDS) {
        for (const c of TEMPLATE_PACKS[id].cycleDefinitions) {
          expect(valid.has(c.frequency)).toBe(true)
        }
      }
    })
  })

  describe('Document templates', () => {
    it('every pack has at least one candidate-facing document that needs a signature', () => {
      for (const id of TEMPLATE_PACK_IDS) {
        const candidateDocs = TEMPLATE_PACKS[id].docTemplates.filter(
          (d) => d.audience === 'CANDIDATE' && d.needsSignature
        )
        expect(candidateDocs.length).toBeGreaterThan(0)
      }
    })

    it('US_IT has an NDA and a Right to Represent', () => {
      const names = TEMPLATE_PACKS.US_IT.docTemplates.map((d) => d.name)
      expect(names).toContain('NDA')
      expect(names).toContain('Right to Represent')
    })

    it('UK has an IR35 Status Determination Statement', () => {
      const names = TEMPLATE_PACKS.UK.docTemplates.map((d) => d.name)
      expect(names).toContain('IR35 Status Determination Statement')
    })
  })

  describe('Skill seeds', () => {
    it('US_SAP includes SAP-specific skill categories', () => {
      const categories = TEMPLATE_PACKS.US_SAP.skillSeeds.map((s) => s.category)
      expect(categories).toContain('SAP Functional')
      expect(categories).toContain('SAP Technical')
      expect(categories).toContain('SAP S/4HANA')
    })

    it('every skill category has at least one skill', () => {
      for (const id of TEMPLATE_PACK_IDS) {
        for (const seed of TEMPLATE_PACKS[id].skillSeeds) {
          expect(seed.skills.length).toBeGreaterThan(0)
        }
      }
    })
  })
})
