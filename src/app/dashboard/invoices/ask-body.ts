/**
 * What "Ask the supplier" on an invoice receipt posts to the thread, as a
 * pure function of the field on the row, so a test can fill the field in
 * and check what reaches the route (`POST /api/conversations`).
 */

export interface AskTyped {
  /** The job the receipt bills: the thread is about the job. */
  requirementId: string
  /** The firm that sent the invoice. */
  supplierId: string
  /** The receipt's own number, said first so the supplier knows which. */
  number: string
  /** What the person typed, as typed. */
  question: string
}

export function askSupplierBody(t: AskTyped): Record<string, unknown> {
  return {
    topic: 'REQUIREMENT',
    topicId: t.requirementId,
    withCompanyId: t.supplierId,
    initialMessage: `About invoice ${t.number}: ${t.question.trim()}`,
  }
}
