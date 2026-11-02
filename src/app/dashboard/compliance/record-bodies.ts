/**
 * What the Compliance page's "Record the I-9" and "Record a screening
 * company's report" forms post to `POST /api/compliance/verifications`,
 * from what was typed. Pure, so the test that every question the route
 * asks has a field on the screen reads the body the screen really sends
 * (`__tests__/invariants/every-question-has-a-field.test.ts`).
 */

export interface I9Typed {
  edition: string
  /** Which document was shown, by its key. */
  doc: string
  docNumber: string
  docIssuer: string
  docExpires: string
}

export function recordI9Body(contractId: string, t: I9Typed): Record<string, unknown> {
  return {
    contractId, about: 'PERSON', type: 'I9_EVERIFY', formEdition: t.edition,
    evidence: [{ type: t.doc, issuer: t.docIssuer || null, reference: t.docNumber || null, expiresAt: t.docExpires || null }],
  }
}

export interface VerdictTyped {
  type: string
  provider: string
  reference: string
  renderedOn: string
  outcome: string
  providerSays: string
}

export function recordVerdictBody(contractId: string, t: VerdictTyped): Record<string, unknown> {
  return {
    contractId, about: 'PERSON', type: t.type, provider: t.provider, reference: t.reference, renderedOn: t.renderedOn, outcome: t.outcome,
    // Nothing has come back yet when it is only ordered, so there are no words to copy.
    ...(t.outcome === 'ORDERED' ? {} : { providerSays: t.providerSays }),
  }
}
