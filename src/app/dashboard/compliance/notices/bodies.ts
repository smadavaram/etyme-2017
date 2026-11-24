import { entityField, typedBody, type FieldSpec, type Values } from '../act-spec'

/**
 * The acts on the Notices tab and what each posts: the routes under
 * /api/compliance/notice-postings and /api/compliance/access-files.
 */

type Entities = readonly { id: string; name: string }[]

export const recordNoticeFields = (sites: readonly { id: string; name: string }[], entities: Entities): FieldSpec[] => [
  { key: 'kind', label: 'What kind of notice was posted', type: 'text', help: 'For example, a labor condition notice.' },
  { key: 'locationId', label: 'Where it was posted', type: 'select', options: sites.map((s) => ({ value: s.id, label: s.name })) },
  { key: 'postedOn', label: 'The day it was posted', type: 'date' },
  { key: 'measuredFromOn', label: 'The filing day it is measured against', type: 'date', optional: true, help: 'Optional. With it, Etyme checks the day the notice was posted against that filing day. It never stops work.' },
  { key: 'fileRef', label: 'Where the copy is kept', type: 'text', optional: true, help: 'A file name or number. Etyme keeps the reference, never the notice.' },
  ...entityField(entities),
]
export const recordNoticeBody = (v: Values, sites: readonly { id: string; name: string }[], entities: Entities) => typedBody(recordNoticeFields(sites, entities), v)

/** The filing day a notice already on file is measured against, entered by a person. */
export const filingDayFields = (entities: Entities): FieldSpec[] => [
  { key: 'measuredFromOn', label: 'The filing day it is measured against', type: 'date' },
  ...entityField(entities),
]
export const filingDayBody = (v: Values, entities: Entities) => typedBody(filingDayFields(entities), v)

/** The chip beside a notice's timing: none where no filing day was entered, and never green, because the rule is a proposal. */
export const timingChip = (timing: 'ON_TIME' | 'LATE' | 'TOO_EARLY' | null): { tone: 'passive' | 'attention'; text: string } | null =>
  timing === null ? null : timing === 'LATE' ? { tone: 'attention', text: 'Dated after filing' } : timing === 'TOO_EARLY' ? { tone: 'attention', text: 'Dated early' } : { tone: 'passive', text: 'Dated before filing' }

/** A removal asks for a reason only when it comes down before its required period ends. Days are year-month-day, so they compare as text. */
export const cameDownEarly = (typedDay: string, periodEndsOn: string) => typedDay !== '' && typedDay < periodEndsOn

export const removalFields = (typedDay: string, periodEndsOn: string, entities: Entities): FieldSpec[] => [
  { key: 'takenDownOn', label: 'The day it came down', type: 'date' },
  ...(cameDownEarly(typedDay, periodEndsOn) ? [{ key: 'reason', label: 'Why it came down before the required period ended', type: 'text' as const, help: 'It goes on the record.' }] : []),
  ...entityField(entities),
]
export const removalBody = (v: Values, periodEndsOn: string, entities: Entities) => typedBody(removalFields(v.takenDownOn ?? '', periodEndsOn, entities), v)

/** Approving a public access file: the reason is asked only when the file was ready after its due day. */
export const approveFields = (typedDay: string, dueOn: string, entities: Entities): FieldSpec[] => [
  { key: 'readyOn', label: 'The day the file was ready', type: 'date' },
  ...(typedDay !== '' && typedDay > dueOn ? [{ key: 'reason', label: 'Why it was ready after its due day', type: 'text' as const, help: 'It goes on the record.' }] : []),
  ...entityField(entities),
]
export const approveBody = (v: Values, dueOn: string, entities: Entities) => typedBody(approveFields(v.readyOn ?? '', dueOn, entities), v)
