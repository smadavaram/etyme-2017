import { describe, it, expect } from 'vitest'
import { payerScope, sellContractScope } from '@/lib/resolve-client-company'
import type { CallerContext } from '@/lib/api-context'

/**
 * What a client may see of the chain beneath its own supplier.
 *
 * Found by seeding one shared world and reading the same placement from
 * three seats. Harlow Health, a client, was shown three sell contracts
 * for two people — including the row where CloudEPA sells to Computer
 * Systems at $112, sitting next to the row where Computer Systems sells
 * to Harlow at $138. The subtraction is the prime's entire margin.
 *
 * Per-visitor demo copies could not surface this: each one contained a
 * single company's data, so no seat ever saw another's.
 */

const caller = (kind: string, companyId: string): CallerContext =>
  ({
    person: { id: 'p1', name: 'Someone' },
    company: { id: companyId, kind },
    context: { type: 'EMPLOYEE' },
    permissions: ['*'],
  }) as unknown as CallerContext

describe('a client sees who is on its site, and not what they cost', () => {
  it('scopes a rate-bearing list to what the client is actually billed for', () => {
    // Not endClientFilter. A sub-vendor's contract also names this client
    // as its end client, which is how tenure aggregates — and is exactly
    // the row that must not appear on a list carrying rates.
    expect(payerScope(caller('CLIENT', 'harlow'))).toEqual({ clientCompanyId: 'harlow' })
  })

  it('still lets the client reach every contract at its site where no rate is shown', () => {
    // Timesheets and rolloff both use this: the client signs off hours
    // for people it never contracted with, and needs to know who is
    // rolling off its site whoever employs them.
    const scope = sellContractScope(caller('CLIENT', 'harlow')) as { OR: unknown[] }
    expect(scope.OR).toBeDefined()
    expect(JSON.stringify(scope)).toContain('endClientCompanyId')
  })

  it('leaves a vendor seeing its own book either way', () => {
    expect(payerScope(caller('VENDOR', 'cloudepa'))).toEqual({ companyId: 'cloudepa' })
    expect(sellContractScope(caller('VENDOR', 'cloudepa'))).toEqual({ companyId: 'cloudepa' })
  })

  it('gives a consultant their own contracts and nobody else’s', () => {
    const onBench = {
      person: { id: 'priya', name: 'Priya' },
      company: { id: 'cloudepa', kind: 'VENDOR' },
      context: { type: 'CONSULTANT' },
      permissions: [],
    } as unknown as CallerContext
    expect(payerScope(onBench)).toEqual({ personId: 'priya' })
  })
})
