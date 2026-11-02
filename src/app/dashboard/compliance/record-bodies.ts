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

// ── After a flagged report ─────────────────────────────────────────────

export type AdverseStepTyped = 'PRE_NOTICE' | 'FINAL' | 'NOT_TAKEN'

/**
 * What the form asks for at each step: the notice, raised from the firm's
 * own template with the copy of the report attached and sent to the
 * person, for the pre-adverse and the final notice; the reason for the
 * final notice and for a decision not to act.
 */
export function adverseFields(step: AdverseStepTyped): ('notice' | 'reason')[] {
  return [...(step === 'NOT_TAKEN' ? [] : ['notice' as const]), ...(step === 'PRE_NOTICE' ? [] : ['reason' as const])]
}

/**
 * The notice the form raises before it posts a step that needs one: a
 * paper about the person, from this firm's own template, with the copy
 * attached and sent (`notice` in record-check.tsx). The facts the route
 * reads off it.
 */
export const NOTICE_THE_FORM_RAISES = { aboutThisPerson: true, fromThisFirm: true, hasFile: true, sent: true } as const

export function recordAdverseBody(
  verificationId: string,
  contractId: string,
  step: AdverseStepTyped,
  t: { noticeDocumentId?: string; reason?: string }
): Record<string, unknown> {
  const asks = adverseFields(step)
  return {
    verificationId, contractId, step,
    ...(asks.includes('notice') && t.noticeDocumentId ? { noticeDocumentId: t.noticeDocumentId } : {}),
    ...(asks.includes('reason') ? { reason: t.reason ?? '' } : {}),
  }
}
