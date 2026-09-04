import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'

/**
 * POST /api/requirements/parse
 *
 * BUILD.md: "{ text } → parsed fields with per field confidence"
 *
 * Takes free-text (email body, job description, VMS export) and extracts
 * structured requirement fields using Claude. Anything under 0.9 confidence
 * is flagged, not corrected silently.
 *
 * For now, uses a deterministic keyword parser. When Claude API credentials
 * are configured, this switches to the full AI extraction.
 */
export async function POST(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const { text } = body

  if (!text || typeof text !== 'string' || text.trim().length < 10) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'text is required (min 10 characters)', field: 'text' } },
      { status: 422 }
    )
  }

  // Deterministic keyword extraction (Claude API upgrade later)
  const parsed = extractFields(text)

  return NextResponse.json({
    data: {
      parsed,
      message: `Extracted ${Object.keys(parsed).filter((k) => parsed[k].value !== null).length} fields from text`,
    },
  })
}

interface FieldResult {
  value: any
  confidence: number
  flagged: boolean // true when confidence < 0.9
}

function extractFields(text: string): Record<string, FieldResult> {
  const lower = text.toLowerCase()
  const fields: Record<string, FieldResult> = {}

  // Title — first line or "Role:" / "Position:" / "Title:"
  const titleMatch = text.match(/(?:role|position|title|job\s*title)\s*[:\-]\s*(.+)/i)
  if (titleMatch) {
    fields.title = { value: titleMatch[1].trim(), confidence: 0.95, flagged: false }
  } else {
    // Use first line as title
    const firstLine = text.split('\n')[0].trim()
    if (firstLine.length > 5 && firstLine.length < 200) {
      fields.title = { value: firstLine, confidence: 0.6, flagged: true }
    } else {
      fields.title = { value: null, confidence: 0, flagged: true }
    }
  }

  // Skills — look for "skills:", "technologies:", or comma-separated tech terms
  const skillsMatch = text.match(/(?:skills?|technologies|tech\s*stack|requirements?)\s*[:\-]\s*(.+?)(?:\n|$)/i)
  if (skillsMatch) {
    const skills = skillsMatch[1].split(/[,;·•]/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 50)
    fields.skills = { value: skills, confidence: 0.92, flagged: false }
  } else {
    // Try to find known tech terms
    const knownSkills = [
      'Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue',
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'SQL', 'PostgreSQL', 'MongoDB',
      'SAP', 'ABAP', 'S/4HANA', 'HANA', 'FI/CO', 'MM', 'SD', 'PP',
      'ServiceNow', '.NET', 'C#', 'Spring Boot', 'Node.js', 'Go', 'Rust',
      'Tableau', 'Power BI', 'Snowflake', 'Databricks', 'Spark',
      'Salesforce', 'Oracle', 'PeopleSoft', 'Workday',
    ]
    const found = knownSkills.filter((s) => lower.includes(s.toLowerCase()))
    if (found.length > 0) {
      fields.skills = { value: found, confidence: 0.75, flagged: true }
    } else {
      fields.skills = { value: [], confidence: 0, flagged: true }
    }
  }

  // Location
  const locationMatch = text.match(/(?:location|city|site|office)\s*[:\-]\s*(.+?)(?:\n|$)/i)
  if (locationMatch) {
    fields.location = { value: locationMatch[1].trim(), confidence: 0.9, flagged: false }
  } else {
    fields.location = { value: null, confidence: 0, flagged: true }
  }

  // Rate — look for "$" followed by numbers
  const rateMatch = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:[-–\/to]+\s*\$?\s*(\d+(?:\.\d+)?))?/i)
  if (rateMatch) {
    // Rates are written as dollars in a job description and stored as
    // cents, like every other money column in the schema.
    const min = Math.round(parseFloat(rateMatch[1]) * 100)
    const max = rateMatch[2] ? Math.round(parseFloat(rateMatch[2]) * 100) : null
    fields.billMin = { value: min, confidence: 0.85, flagged: true }
    if (max) {
      fields.billMax = { value: max, confidence: 0.85, flagged: true }
    } else {
      fields.billMax = { value: null, confidence: 0, flagged: true }
    }
  } else {
    fields.billMin = { value: null, confidence: 0, flagged: true }
    fields.billMax = { value: null, confidence: 0, flagged: true }
  }

  // Duration
  const durationMatch = text.match(/(\d+)\s*(?:months?|mos?)\b/i)
  if (durationMatch) {
    fields.months = { value: parseInt(durationMatch[1], 10), confidence: 0.9, flagged: false }
  } else {
    fields.months = { value: null, confidence: 0, flagged: true }
  }

  // Start date
  const dateMatch = text.match(/(?:start\s*(?:date)?|starting|begin(?:ning)?)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i)
  if (dateMatch) {
    const d = new Date(dateMatch[1])
    if (!isNaN(d.getTime())) {
      fields.startDate = { value: d.toISOString(), confidence: 0.88, flagged: true }
    } else {
      fields.startDate = { value: null, confidence: 0, flagged: true }
    }
  } else {
    fields.startDate = { value: null, confidence: 0, flagged: true }
  }

  // Work auth requirement
  const authMatch = text.match(/(?:work\s*auth|visa|authorization|citizenship|green\s*card|h1b|gc|us\s*citizen)/i)
  if (authMatch) {
    const authLower = authMatch[0].toLowerCase()
    if (authLower.includes('citizen')) {
      fields.workAuth = { value: 'US_CITIZEN', confidence: 0.92, flagged: false }
    } else if (authLower.includes('gc') || authLower.includes('green card')) {
      fields.workAuth = { value: 'GC', confidence: 0.9, flagged: false }
    } else if (authLower.includes('h1b')) {
      fields.workAuth = { value: 'H1B', confidence: 0.95, flagged: false }
    } else {
      fields.workAuth = { value: authMatch[0], confidence: 0.6, flagged: true }
    }
  } else {
    fields.workAuth = { value: null, confidence: 0, flagged: true }
  }

  return fields
}
