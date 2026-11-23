import { entityField, typedBody, type FieldSpec, type Values } from '../act-spec'

/**
 * The acts on the Checklists tab and what each posts: the routes under
 * /api/compliance/checklist-items and /api/compliance/immigration-petitions.
 */

type Entities = readonly { id: string; name: string }[]

/** The words the contracts agent keeps an agreed rate in (`rateWords` in lib/agents/checklist-rules, held equal by a test). */
export const rateWordsOf = (dollars: string, currency: string): string => {
  const cents = Math.round(Number(dollars) * 100)
  return `${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)} an hour`
}

export type ItemKind = 'RATE' | 'TERMS' | 'WINDOW'

// ── Record the signed paper ─────────────────────────────────────────

export function recordSignedFields(kind: ItemKind | null, entities: Entities): FieldSpec[] {
  const paper: FieldSpec = { key: 'paperReference', label: 'The signed paper: its name, number or date', type: 'text' }
  const same = 'Leave blank if the signed paper agrees with the line as it reads now.'
  const value: FieldSpec[] =
    kind === 'RATE' ? [{ key: 'rate', label: 'The hourly rate the signed paper agrees', type: 'number', optional: true, help: same }]
    : kind === 'TERMS' ? [{ key: 'days', label: 'The payment terms the signed paper agrees, in days', type: 'number', optional: true, help: same }]
    : kind === 'WINDOW' ? [
      { key: 'from', label: 'The order starts on', type: 'date', optional: true, help: same },
      { key: 'to', label: 'The order ends on', type: 'date', optional: true, help: 'Leave blank for no end date.' },
    ] : [{ key: 'agreedValue', label: 'What the signed paper agrees', type: 'text', optional: true, help: same }]
  return [paper, ...value, ...entityField(entities)]
}

export function recordSignedBody(kind: ItemKind | null, currency: string, v: Values, entities: Entities): Record<string, unknown> {
  const fields = recordSignedFields(kind, entities)
  const body = typedBody(fields.filter((f) => !['rate', 'days', 'from', 'to'].includes(f.key)), v)
  if (kind === 'RATE' && v.rate?.trim()) body.agreedValue = rateWordsOf(v.rate, currency)
  if (kind === 'TERMS' && v.days?.trim()) body.agreedValue = `Net ${Math.round(Number(v.days))}`
  if (kind === 'WINDOW' && v.from?.trim()) body.agreedValue = `${v.from.trim()}..${v.to?.trim() ?? ''}`
  return { action: 'RECORD_SIGNED', ...body }
}

// ── A petition paper ────────────────────────────────────────────────

export const markMetFields = (entities: Entities): FieldSpec[] => [
  { key: 'paperReference', label: 'The paper that is on hand: its name, number or date', type: 'text', help: 'Etyme keeps the reference, never the paper.' },
  ...entityField(entities),
]
export const markMetBody = (v: Values, entities: Entities) => ({ action: 'MARK_MET', ...typedBody(markMetFields(entities), v) })

export const signatoryFields = (people: readonly { id: string; name: string }[], entities: Entities): FieldSpec[] => [
  { key: 'signatoryPersonId', label: 'Who signs this paper', type: 'select', options: people.map((p) => ({ value: p.id, label: p.name })) },
  ...entityField(entities),
]
export const signatoryBody = (v: Values, people: readonly { id: string; name: string }[], entities: Entities) => ({ action: 'SET_SIGNATORY', ...typedBody(signatoryFields(people, entities), v) })

// ── A petition ──────────────────────────────────────────────────────

export const startPetitionFields = (people: readonly { id: string; name: string }[], entities: Entities): FieldSpec[] => [
  { key: 'personId', label: 'Who the petition is for', type: 'select', options: people.map((p) => ({ value: p.id, label: p.name })) },
  { key: 'kind', label: 'What kind of petition it is', type: 'text', help: 'As your counsel names it.' },
  { key: 'filedOn', label: 'The day it was filed', type: 'date', optional: true, help: 'Leave blank until it is filed.' },
  ...entityField(entities),
]
export const startPetitionBody = (v: Values, people: readonly { id: string; name: string }[], entities: Entities) => typedBody(startPetitionFields(people, entities), v)

export const filingDayFields = (entities: Entities): FieldSpec[] => [
  { key: 'filedOn', label: 'The day it was filed', type: 'date', help: 'The public access file is tracked from this day.' },
  ...entityField(entities),
]
export const filingDayBody = (v: Values, entities: Entities) => typedBody(filingDayFields(entities), v)
