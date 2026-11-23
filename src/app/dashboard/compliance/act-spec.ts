/**
 * What a small act on the Checklists and Notices tabs draws and posts.
 * Pure, so the test that every question a route asks has a field on its
 * screen reads the very fields and body the screen uses
 * (`__tests__/invariants/every-question-has-a-field.test.ts`).
 */

export interface FieldSpec {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select'
  help?: string
  /** The route does not need it; a blank is left out of the body. */
  optional?: boolean
  options?: { value: string; label: string }[]
}

export type Values = Record<string, string>

/**
 * The legal entity the act is for. Asked only where the firm has more than
 * one: a firm with one entity, or none, is never asked to choose it (the
 * route supplies the one it has).
 */
export function entityField(entities: readonly { id: string; name: string }[]): FieldSpec[] {
  return entities.length > 1
    ? [{ key: 'actingEntityId', label: 'Which legal entity is this for?', type: 'select', options: entities.map((e) => ({ value: e.id, label: e.name })) }]
    : []
}

/** The typed values as a body: blanks left out, so the route's own default applies. */
export function typedBody(fields: readonly FieldSpec[], v: Values): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const f of fields) if ((v[f.key] ?? '').trim() !== '') body[f.key] = v[f.key].trim()
  return body
}

/** Whether every field the form draws that the route needs has been typed; the sentence for the first that has not. */
export function firstMissing(fields: readonly FieldSpec[], v: Values): string | null {
  const f = fields.find((x) => !x.optional && (v[x.key] ?? '').trim() === '')
  return f ? `Fill in: ${f.label.toLowerCase().replace(/\?$/, '')}.` : null
}
