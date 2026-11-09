/**
 * A file exported from Active Directory on a company's own servers, read
 * as the directory (founder, 2026-11-09: "Can it be integrated or imported
 * from Active Directory"). The columns, in Active Directory's own names or
 * the plain ones: name, email, department, manager (the manager's email),
 * officeLocation, country, jobTitle. Pure: no database, no network.
 */

export interface DirectoryPerson {
  name: string
  email: string
  department: string | null
  /** The manager's email. */
  manager: string | null
  officeLocation: string | null
  country: string | null
  jobTitle: string | null
}

export const DIRECTORY_COLUMNS = ['name', 'email', 'department', 'manager', 'officeLocation', 'country', 'jobTitle'] as const
type Column = (typeof DIRECTORY_COLUMNS)[number]

/** Each column and the headers that mean it, Active Directory's and Entra ID's names included. */
const HEADERS: Record<Column, string[]> = {
  name: ['name', 'displayname', 'display name', 'full name', 'cn'],
  email: ['email', 'mail', 'e-mail', 'email address', 'userprincipalname', 'user principal name', 'upn'],
  department: ['department', 'dept'],
  manager: ['manager', 'manager email', 'manager mail', 'managermail', 'manager e-mail'],
  officeLocation: ['officelocation', 'office location', 'office', 'physicaldeliveryofficename', 'location', 'site'],
  country: ['country', 'c', 'co', 'countrycode', 'country code'],
  jobTitle: ['jobtitle', 'job title', 'title'],
}

/** RFC 4180 rows: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

export type CsvRead = { ok: true; people: DirectoryPerson[]; skipped: string[] } | { ok: false; says: string }

const MAX_ROWS = 20_000
const clean = (x: string | undefined) => {
  const v = (x ?? '').trim()
  return v ? v : null
}
/** "CN=Dana Whitcombe,OU=…" is how Active Directory writes a manager; an email is how Entra ID writes one. */
const managerOf = (x: string | null) => (x && x.includes('@') ? x.toLowerCase() : null)

export function readDirectoryCsv(text: string): CsvRead {
  if (!text || !text.trim()) return { ok: false, says: 'The file is empty. Export your users from Active Directory as a CSV and choose it again.' }
  const rows = parseCsvRows(text)
  if (rows.length < 2) return { ok: false, says: 'The file has a header and no people. Export your users with their department and manager, then choose it again.' }
  if (rows.length - 1 > MAX_ROWS) return { ok: false, says: `The file has ${rows.length - 1} people; one import reads up to ${MAX_ROWS.toLocaleString('en-US')}. Split it by department.` }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const at = Object.fromEntries(DIRECTORY_COLUMNS.map((c) => [c, header.findIndex((h) => HEADERS[c].includes(h))])) as Record<Column, number>
  if (at.email < 0) return { ok: false, says: 'The file has no email column. People are matched to their seats by email only, so the import needs one (email or mail).' }
  if (at.department < 0 && at.manager < 0 && at.officeLocation < 0) return { ok: false, says: 'The file has no department, manager or office column, so there is no structure to read. Export department and manager with each user.' }

  const people: DirectoryPerson[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  rows.slice(1).forEach((r, i) => {
    const get = (c: Column) => (at[c] >= 0 ? clean(r[at[c]]) : null)
    const email = get('email')?.toLowerCase() ?? null
    if (!email || !email.includes('@')) { skipped.push(`Row ${i + 2} has no email, so it is not read.`); return }
    if (seen.has(email)) { skipped.push(`Row ${i + 2} repeats ${email}; the first row for it is read.`); return }
    seen.add(email)
    people.push({
      name: get('name') ?? email,
      email,
      department: get('department'),
      manager: managerOf(get('manager')),
      officeLocation: get('officeLocation'),
      country: get('country'),
      jobTitle: get('jobTitle'),
    })
  })
  return { ok: true, people, skipped }
}
