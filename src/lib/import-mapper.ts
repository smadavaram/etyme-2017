/**
 * AI column mapping for data imports.
 *
 * BUILD.md: "Claude returns fields with per field confidence;
 * anything under 0.9 is flagged, not corrected silently."
 *
 * For now, uses a deterministic heuristic mapper that normalizes
 * column headers and maps them to Etyme fields. When Claude API
 * credentials are configured, this switches to AI-powered mapping.
 */

import { sortsByOrigin, originRefusal } from '@/lib/work-authorisation'
import { formatDay } from '@/lib/format-date'

export interface ColumnMapping {
  sourceColumn: string
  targetField: string | null
  confidence: number
  flagged: boolean // true when confidence < 0.9
}

export interface MappingResult {
  mappings: ColumnMapping[]
  unmapped: string[]
  warnings: string[]
  /**
   * Columns or sheets dropped because they sort people by where they
   * are from, and what was said about each.
   *
   * Separate from `warnings` on purpose. A warning is something somebody
   * may override; these are not overridable and the list is the record
   * that they were removed.
   */
  refused: string[]
}

// Known field aliases → canonical Etyme field name
const FIELD_ALIASES: Record<string, string> = {
  // Person
  'name': 'name',
  'full name': 'name',
  'full_name': 'name',
  'fullname': 'name',
  'candidate name': 'name',
  'consultant name': 'name',
  'employee name': 'name',
  'first name': 'firstName',
  'first_name': 'firstName',
  'firstname': 'firstName',
  'last name': 'lastName',
  'last_name': 'lastName',
  'lastname': 'lastName',
  'email': 'email',
  'email address': 'email',
  'email_address': 'email',
  'e-mail': 'email',
  'primary email': 'email',
  'phone': 'phone',
  'phone number': 'phone',
  'phone_number': 'phone',
  'mobile': 'phone',
  'cell': 'phone',

  // Consultant profile
  'title': 'headline',
  'job title': 'headline',
  'job_title': 'headline',
  'designation': 'headline',
  'position': 'headline',
  'headline': 'headline',
  'skills': 'skills',
  'skill': 'skills',
  'skill set': 'skills',
  'technologies': 'skills',
  'tech stack': 'skills',
  'location': 'location',
  'city': 'location',
  'state': 'location',
  'work location': 'location',
  'work auth': 'workAuth',
  'work authorization': 'workAuth',
  'work_authorization': 'workAuth',
  'visa': 'workAuth',
  'visa status': 'workAuth',
  'visa_status': 'workAuth',
  'immigration status': 'workAuth',

  // Assignment / Rate
  'pay rate': 'payRate',
  'pay_rate': 'payRate',
  'payrate': 'payRate',
  'rate': 'payRate',
  'hourly rate': 'payRate',
  'bill rate': 'billRate',
  'bill_rate': 'billRate',
  'billrate': 'billRate',
  'client rate': 'billRate',
  'contract type': 'contractType',
  'contract_type': 'contractType',
  'employment type': 'contractType',
  'w2/c2c': 'contractType',
  'start date': 'startDate',
  'start_date': 'startDate',
  'startdate': 'startDate',
  'end date': 'endDate',
  'end_date': 'endDate',
  'enddate': 'endDate',
  'client': 'clientName',
  'client name': 'clientName',
  'client_name': 'clientName',
  'vendor': 'vendorName',
  'vendor name': 'vendorName',
  'project': 'projectName',
  'project name': 'projectName',
  'engagement': 'projectName',
  'available from': 'availableFrom',
  'available_from': 'availableFrom',
  'availability': 'availableFrom',
  'available date': 'availableFrom',
}

/**
 * Maps source columns to Etyme target fields using header normalization
 * and fuzzy matching. Returns a mapping with confidence scores.
 *
 * Confidence:
 *   1.0 — exact alias match
 *   0.85 — partial/fuzzy match (flagged)
 *   0.0 — no match (unmapped)
 */
/**
 * Map a spreadsheet's columns onto Etyme fields.
 *
 * `sheetName` is optional and matters more than it looks. Real uploads
 * to this project arrived as "Tier 1 Prime Vendors (Indians)" beside
 * "Tier 1 American Prime Vendors", and a sheet headed "DESI CLIENTS".
 * The rows in those files are ordinary business contacts and are fine;
 * it is the grouping that has no lawful use, and a sheet name is the
 * grouping written down. Importing it without comment would make it
 * ours and hand a plaintiff a document that explains itself.
 */
export function mapColumns(headers: string[], sheetName?: string): MappingResult {
  const mappings: ColumnMapping[] = []
  const unmapped: string[] = []
  const warnings: string[] = []
  const refused: string[] = []
  const usedTargets = new Set<string>()

  if (sheetName && sortsByOrigin(sheetName)) {
    refused.push(originRefusal(sheetName))
  }

  for (const header of headers) {
    if (sortsByOrigin(header)) {
      // Nothing in Etyme records national origin, so there is no field
      // for this to land in even if somebody wanted one.
      refused.push(originRefusal(header))
      continue
    }
    const normalized = header.toLowerCase().trim().replace(/[_\-]+/g, ' ')

    // Exact alias match
    if (FIELD_ALIASES[normalized]) {
      const target = FIELD_ALIASES[normalized]
      if (usedTargets.has(target)) {
        warnings.push(`Multiple columns map to "${target}": "${header}" is a duplicate`)
        mappings.push({ sourceColumn: header, targetField: null, confidence: 0, flagged: true })
        unmapped.push(header)
        continue
      }
      usedTargets.add(target)
      mappings.push({ sourceColumn: header, targetField: target, confidence: 1.0, flagged: false })
      continue
    }

    // Partial match: check if any alias is a substring
    let bestMatch: string | null = null
    let bestConfidence = 0
    for (const [alias, target] of Object.entries(FIELD_ALIASES)) {
      if (usedTargets.has(target)) continue
      if (normalized.includes(alias) || alias.includes(normalized)) {
        const similarity = Math.min(normalized.length, alias.length) / Math.max(normalized.length, alias.length)
        if (similarity > bestConfidence) {
          bestConfidence = similarity
          bestMatch = target
        }
      }
    }

    if (bestMatch && bestConfidence >= 0.5) {
      usedTargets.add(bestMatch)
      const conf = Math.round(bestConfidence * 100) / 100
      mappings.push({
        sourceColumn: header,
        targetField: bestMatch,
        confidence: Math.min(conf, 0.85), // cap at 0.85 for fuzzy matches
        flagged: true, // < 0.9 = flagged per BUILD.md
      })
    } else {
      mappings.push({ sourceColumn: header, targetField: null, confidence: 0, flagged: true })
      unmapped.push(header)
    }
  }

  return { mappings, unmapped, warnings, refused }
}

/**
 * Validate and coerce values based on the target field type.
 */
export function parseValue(field: string, raw: string): { value: any; issue: string | null } {
  if (!raw || raw.trim() === '') {
    return { value: null, issue: null }
  }

  const trimmed = raw.trim()

  switch (field) {
    case 'payRate':
    case 'billRate': {
      const num = parseFloat(trimmed.replace(/[,$]/g, ''))
      if (isNaN(num)) return { value: null, issue: `Invalid rate: "${trimmed}"` }
      if (num < 0) return { value: null, issue: `Negative rate: ${num}` }
      return { value: Math.round(num), issue: null }
    }

    case 'startDate':
    case 'endDate':
    case 'availableFrom': {
      const d = new Date(trimmed)
      if (isNaN(d.getTime())) return { value: null, issue: `Invalid date: "${trimmed}"` }
      return { value: d.toISOString(), issue: null }
    }

    case 'skills': {
      // Split comma or semicolon-separated skills
      const skills = trimmed.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
      return { value: skills, issue: skills.length === 0 ? 'No skills parsed' : null }
    }

    case 'contractType': {
      const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_')
      const valid = ['W2', 'C2C', '1099', 'C2H_W2', 'CDD', 'FIXED_TERM', 'LIMITED_COMPANY', 'UMBRELLA', 'PAYE']
      if (valid.includes(upper)) return { value: upper, issue: null }
      return { value: trimmed, issue: `Unknown contract type: "${trimmed}". Expected: ${valid.join(', ')}` }
    }

    case 'workAuth': {
      const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_')
      const valid = ['US_CITIZEN', 'GC', 'H1B', 'OPT', 'GBP_SW', 'EAD', 'TN', 'L1']
      if (valid.includes(upper)) return { value: upper, issue: null }
      return { value: trimmed, issue: `Unknown work authorization: "${trimmed}"` }
    }

    default:
      return { value: trimmed, issue: null }
  }
}

/**
 * Parse a row using the column mapping, returning parsed fields and issues.
 */
export function parseRow(
  row: Record<string, string>,
  mappings: ColumnMapping[]
): { parsed: Record<string, any>; issues: string[] } {
  const parsed: Record<string, any> = {}
  const issues: string[] = []

  for (const mapping of mappings) {
    if (!mapping.targetField) continue

    const rawValue = row[mapping.sourceColumn]
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      // Required fields
      if (['name', 'email'].includes(mapping.targetField)) {
        issues.push(`Missing required field: ${mapping.targetField}`)
      }
      continue
    }

    const { value, issue } = parseValue(mapping.targetField, String(rawValue))
    if (value !== null) {
      parsed[mapping.targetField] = value
    }
    if (issue) {
      issues.push(issue)
    }
  }

  // Combine firstName + lastName if no full name
  if (!parsed.name && (parsed.firstName || parsed.lastName)) {
    parsed.name = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ')
    delete parsed.firstName
    delete parsed.lastName
  }

  return { parsed, issues }
}

// ═════════════════════════════════════════════════════════════════════
// THE TRADE'S WORDS ON THE REVIEW, AND WHAT A COMMIT WILL WRITE
// ═════════════════════════════════════════════════════════════════════
//
// The onboarding walk of 2026-10-27, at an integrator: the review's
// columns read CONTRACTTYPE and STARTDATE over ISO timestamps, the commit
// asked through a browser pop-up about "INTERNAL visibility", and two W2
// rows became bench listings nobody had agreed to. A person reads the
// field in their own words, a date the way every page prints one, and
// what the commit will write before it writes it.

/** Each field as a column heading a recruiter or HR would write. */
export const FIELD_WORDS: Record<string, string> = {
  name: 'Name', firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone',
  headline: 'Title', skills: 'Skills', location: 'Location', workAuth: 'Work authorization',
  availableFrom: 'Available from', payRate: 'Pay rate', billRate: 'Bill rate',
  startDate: 'Start date', endDate: 'End date', contractType: 'Contract type',
  clientName: 'Client', vendorName: 'Supplier', projectName: 'Project',
}

/** A field's heading: its words, or the field as a sentence-case phrase where it has none. */
export function fieldWords(field: string): string {
  if (FIELD_WORDS[field]) return FIELD_WORDS[field]
  const spaced = field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const CONTRACT_WORDS: Record<string, string> = {
  W2: 'W2', C2C: 'Corp-to-corp', '1099': '1099', C2H_W2: 'Contract to hire (W2)', CDD: 'CDD',
  FIXED_TERM: 'Fixed term', LIMITED_COMPANY: 'Limited company', UMBRELLA: 'Umbrella', PAYE: 'PAYE',
}

const AUTH_WORDS: Record<string, string> = {
  US_CITIZEN: 'US citizen', GC: 'Green card', H1B: 'H-1B', OPT: 'OPT', GBP_SW: 'UK skilled worker',
  EAD: 'EAD', TN: 'TN', L1: 'L-1',
}

/** A parsed cell as the review prints it. Dates as every page prints them; codes in words. */
export function cellWords(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.join(', ')
  if (field === 'startDate' || field === 'endDate' || field === 'availableFrom') {
    try { return formatDay(String(value)) ?? String(value) } catch { return String(value) }
  }
  if (field === 'contractType') return CONTRACT_WORDS[String(value)] ?? String(value)
  if (field === 'workAuth') return AUTH_WORDS[String(value)] ?? String(value)
  if (field === 'payRate' || field === 'billRate') return `$${Number(value).toLocaleString('en-US')}/hr`
  return String(value)
}

/**
 * Whether a row is the importing firm's own employee.
 *
 * A W2 row at a firm that employs people — an integrator, a supplier, a
 * bench firm — is somebody it pays on its own payroll. You do not ask
 * your own W2 for a bench listing: the employment is the consent
 * (CLAUDE.md, "Who sells and who buys"). A client's W2 rows are its
 * suppliers' people, never its own, and a contract-to-hire is a
 * contractor until the hire.
 */
export function isOwnEmployeeRow(parsed: Record<string, unknown>, companyKind: string): boolean {
  return parsed.contractType === 'W2' && companyKind !== 'CLIENT'
}

export interface ImportPlan {
  employees: number
  contractors: number
  skipped: number
  /** One sentence the page shows above its one button. */
  says: string
  /** The button's own words. */
  button: string
}

/** What committing these rows will write, said before anything is written. */
export function importPlan(rows: { parsed: Record<string, unknown> }[], companyKind: string): ImportPlan {
  let employees = 0, contractors = 0, skipped = 0
  for (const r of rows) {
    if (!r.parsed.name && !r.parsed.email) skipped++
    else if (isOwnEmployeeRow(r.parsed, companyKind)) employees++
    else contractors++
  }
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const parts: string[] = []
  if (employees) parts.push(`${n(employees, 'person goes', 'people go')} on your payroll as your own employee${employees === 1 ? '' : 's'} (W2), with no bench listing`)
  if (contractors) {
    parts.push(
      `${n(contractors, 'person is', 'people are')} added to your records and asked to join your bench; ` +
      `nobody outside your firm sees them until each says yes, and you send each ask from Bench`,
    )
  }
  if (skipped) parts.push(`${n(skipped, 'row has', 'rows have')} no name and no email and ${skipped === 1 ? 'is' : 'are'} skipped`)
  const total = employees + contractors
  return {
    employees, contractors, skipped,
    says: total === 0 ? 'No row has a name or an email, so nothing can be imported.' : `${parts.join('. ')}.`,
    button: total === 0 ? 'Nothing to import' : `Import ${n(total, 'person', 'people')}`,
  }
}
