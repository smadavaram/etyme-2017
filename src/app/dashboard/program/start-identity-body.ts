/**
 * What the start's one question posts to `POST /api/program/start-identity`,
 * as a pure function, so the field contract can check it against what the
 * route reads (`every-question-has-a-field-demand.test.ts`).
 */
export interface StartIdentityTyped {
  contractId: string
  /** Yes is true, No is false. */
  confirmed: boolean
}

export function startIdentityBody(t: StartIdentityTyped): Record<string, unknown> {
  return { contractId: t.contractId, confirmed: t.confirmed }
}
