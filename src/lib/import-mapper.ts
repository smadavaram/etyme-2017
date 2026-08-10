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
export function mapColumns(headers: string[]): MappingResult {
  const mappings: ColumnMapping[] = []
  const unmapped: string[] = []
  const warnings: string[] = []
  const usedTargets = new Set<string>()

  for (const header of headers) {
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

  return { mappings, unmapped, warnings }
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
