/**
 * The qualification a job asks for (`Requirement.requiredQualification`),
 * as the job form, the raise, the edit and the parse write it.
 *
 * Regulatory's degree rules read it (CLAUDE.md, "A degree is read, not
 * just held", 2026-11-03): a degree whose qualification is not what the
 * job asks is a sentence to HR, never a refusal. So it is the hiring
 * manager's own words ("Bachelor's in mechanical engineering", "BSN"),
 * kept as typed, and null where the job asks none, which most do.
 *
 * Pure: no database.
 */

/** The longest kept, so it stays a short phrase and never a paragraph. */
export const QUALIFICATION_MAX = 200

export type QualificationRead =
  | { ok: true; value: string | null }
  | { ok: false; field: 'requiredQualification'; says: string }

/**
 * What the form sent, checked. Blank is "asks none", stored as null.
 * Anything that is not words, or runs past one phrase, is refused in a
 * sentence rather than stored.
 */
export function readQualification(raw: unknown): QualificationRead {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== 'string') {
    return { ok: false, field: 'requiredQualification', says: 'Say the qualification in words, for example "Bachelor’s in mechanical engineering", or leave it empty.' }
  }
  const value = raw.trim().replace(/\s+/g, ' ')
  if (!value) return { ok: true, value: null }
  if (value.length > QUALIFICATION_MAX) {
    return { ok: false, field: 'requiredQualification', says: `Keep the qualification to ${QUALIFICATION_MAX} characters; it is one phrase, such as "BSN" or "Master’s in statistics".` }
  }
  return { ok: true, value }
}

/** What a job description says about the qualification, for the parse. */
export interface QualificationFound {
  value: string | null
  confidence: number
  /** Always true below a labeled line: a person confirms it before it is the job's. */
  flagged: boolean
}

const LABELED = /^\s*(?:required\s+)?(?:qualifications?|education|degree)\s*[:\-]\s*(.+?)\s*$/im
const DEGREE = /\b((?:bachelor|master|associate)(?:['’]s)?(?:\s+degree)?\s+(?:in|of)\s+[a-z][a-z &/-]{2,60}?|(?:ph\.?\s?d|doctorate)\s+(?:in|of)\s+[a-z][a-z &/-]{2,60}?|bsn|msn|mba)(?=[.,;\n)]|\s+(?:or|and|with|from|required|preferred)\b|$)/i

/**
 * Read by rules, never by a model: a line labeled "Qualification",
 * "Education" or "Degree" is read as written; else the first degree named
 * in the text ("Bachelor's in mechanical engineering", "BSN") is offered,
 * flagged for a person to confirm; else nothing.
 */
export function qualificationFromText(text: string): QualificationFound {
  const labeled = text.match(LABELED)
  if (labeled) {
    const read = readQualification(labeled[1])
    if (read.ok && read.value) return { value: read.value, confidence: 0.9, flagged: false }
  }
  const degree = text.match(DEGREE)
  if (degree) {
    const read = readQualification(degree[1])
    if (read.ok && read.value) return { value: read.value, confidence: 0.7, flagged: true }
  }
  return { value: null, confidence: 0, flagged: true }
}
