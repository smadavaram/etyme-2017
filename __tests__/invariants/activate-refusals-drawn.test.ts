import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { viewBefore, viewAfterRefusal, type StartPreflight } from '@/app/dashboard/contracts/activate-view'
import { startRefusalSays } from '@/lib/award/start-refusal'
import { podSaleCardRationale } from '@/lib/twin/pod-sale-card'

const route = readFileSync(join(process.cwd(), 'src/app/api/contracts/[id]/activate/route.ts'), 'utf8')
const may: StartPreflight = { may: true, state: 'DRAFT', says: null, terms: null, papers: { outcome: 'PASS', says: 'Cleared.', fix: null } }

describe('the refusals Activate can meet on a placement', () => {
  it('a line whose terms are pending draws the route’s sentence and the next step, and no Activate button', () => {
    const v = viewBefore({ ...may, terms: { blocks: true, says: 'Brightmoor has not stated her terms.', fix: 'Brightmoor states them on the terms page.' } })
    expect(v.button).toBeNull()
    expect(v.says).toBe('Brightmoor has not stated her terms. Brightmoor states them on the terms page.')
  })

  it('the start’s route says the next step beside the terms it is waiting on, before any press', () => {
    expect(route).toMatch(/terms: terms\.blocks \? \{ blocks: true, says: terms\.says, fix: /)
  })

  it('every refusal code the activate route returns draws a sentence on the page', () => {
    const codes = [...new Set([...route.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]))]
      .filter((c) => !['DOCUMENTS_WARN', 'GOVERNANCE_WARN', 'START_IDENTITY_WARN'].includes(c))
    expect(codes).toEqual(expect.arrayContaining(['TERMS_PENDING', 'DOCUMENTS_BLOCK', 'GOVERNANCE_BLOCK', 'PAST_LAST_DAY', 'NOT_FOUND', 'VALIDATION']))
    for (const code of codes) {
      const says = viewAfterRefusal({ code, message: `The route’s sentence for ${code}.` }, 409).says
      expect(says, code).toContain(`The route’s sentence for ${code}.`)
    }
    expect(startRefusalSays(409, { code: 'TERMS_PENDING' })).not.toBe('')
  })

  it('a pods card names its price as money in its currency, never as a count of cents', () => {
    const says = podSaleCardRationale({ sellerName: 'Tapin', projectName: 'Data platform build', acceptorName: 'Dana', deliverableCount: 2, priceCents: 1250000, currency: 'USD' })
    expect(says).toContain('$12,500.00')
    expect(says).not.toMatch(/cents/)
  })
})
