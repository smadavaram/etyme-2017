/**
 * What the compliance routes of chains 3 and 6 ask a person to say, as one
 * pure reader per act. The routes read their fields through these, and the
 * screens' forms are tested against the same readers, so a route that
 * starts asking for something the form does not draw fails the build
 * (`__tests__/invariants/every-question-has-a-field.test.ts`).
 *
 * An ask is null where the body says enough, or the sentence the person
 * reads and the field it is about.
 */

import { dayFrom, text } from './checklist-items/read'

export interface Ask { says: string; field: string }
type Body = Record<string, unknown>

/** A contract item's signed paper: which paper, and what it agrees where the line should not be taken as it stands. */
export function recordSignedAsk(body: Body, actualOnTheLine: string | null): Ask | null {
  if (!text(body.paperReference)) return { says: 'Say which signed paper this comes from: its name, number or date.', field: 'paperReference' }
  if (!(text(body.agreedValue) || actualOnTheLine)) return { says: 'There is no value on the line to agree to. Say what the signed paper agrees.', field: 'agreedValue' }
  return null
}

/** A petition paper on hand: which paper. */
export function markMetAsk(body: Body): Ask | null {
  return text(body.paperReference) ? null : { says: 'Say which paper is on hand: its name, number or date. Etyme keeps the reference, never the paper.', field: 'paperReference' }
}

/** Starting a petition's checklist: the person, the kind, and a filing day if one is given. */
export function startPetitionAsk(body: Body): Ask | null {
  if (!text(body.personId)) return { says: 'Choose the person the petition is for.', field: 'personId' }
  if (!text(body.kind)) return { says: 'Say what kind of petition this is.', field: 'kind' }
  const filed = text(body.filedOn)
  if (filed && !dayFrom(filed)) return { says: 'Say the filing day as year-month-day, for example 2026-11-23.', field: 'filedOn' }
  return null
}

/** Recording a posted notice: its kind, its site and the day it went up. */
export function noticePostedAsk(body: Body): Ask | null {
  if (!text(body.kind)) return { says: 'Say what kind of notice was posted.', field: 'kind' }
  if (!text(body.locationId)) return { says: 'Choose the site where the notice was posted. It must be one of your firm’s sites.', field: 'locationId' }
  if (!dayFrom(body.postedOn)) return { says: 'Say the day it was posted as year-month-day, for example 2026-11-23.', field: 'postedOn' }
  return null
}

/** Recording a removal: the day it came down. */
export function removalDayAsk(body: Body): Ask | null {
  return dayFrom(body.takenDownOn) ? null : { says: 'Say the day it came down as year-month-day, for example 2026-12-08.', field: 'takenDownOn' }
}

/** Approving a public access file: the day it was ready. */
export function readyDayAsk(body: Body): Ask | null {
  return dayFrom(body.readyOn) ? null : { says: 'Say the day the file was ready as year-month-day, for example 2026-11-24.', field: 'readyOn' }
}
