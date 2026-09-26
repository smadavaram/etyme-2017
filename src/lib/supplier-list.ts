/**
 * Reading a client's own vendor list.
 *
 * The demand side does not arrive alone. A client running contract staff
 * already has six or twelve suppliers, an MSA with each, and a habit of
 * emailing all of them at once. Etyme is worth nothing to that client
 * until those suppliers are reachable inside it — and asking each vendor
 * to sign up first is asking the client to do our selling for us, one
 * phone call at a time.
 *
 * So: one box. Paste the distribution list out of Outlook, paste the
 * supplier tab of a spreadsheet, paste six signature blocks. Every firm
 * in it becomes a supplier the client can send a role to today, whether
 * or not that firm has ever heard of us.
 *
 * ── Why the parsing is deliberately dumb ─────────────────────────────
 *
 * Same reason as `lead-reader`. A procurement manager pasting a vendor
 * list wants the list back in the same second, and a row that is 80%
 * right and editable beats one that is 95% right and arrives after a
 * round trip. Nothing is destructive: the raw line is kept on every row,
 * so a better reader can be run over the same paste later.
 *
 * ── The one thing it will not guess ──────────────────────────────────
 *
 * A supplier's identity. Where the only thing on a line is a gmail
 * address, we do not invent a company name from the local part —
 * "ravi.menon@gmail.com" is a person, and a supplier record called
 * "Ravi Menon" that later turns out to be Cloudepa Systems is a mess
 * somebody has to unpick by hand. It comes back needing a name.
 */

/**
 * Providers that tell you nothing about which firm somebody works for.
 *
 * The OAuth tenant is the authority on a company's domain (CLAUDE.md);
 * this list is only ever used to decide whether a domain is worth
 * reading a company name out of.
 */
const CONSUMER = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'mail.com', 'zoho.com', 'yandex.com', 'rediffmail.com',
])

/** Words that end a company name rather than belonging to a person's. */
const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|gmbh|pvt|private|plc|llp|co|company|group|solutions|systems|technologies|technology|consulting|consultancy|staffing|talent|partners|services|softech|infotech|labs|global)\b\.?$/i

export interface SupplierRow {
  /** The firm. Null where the paste never said and the domain cannot say. */
  company: string | null
  /** Who at the firm. Optional — plenty of lists are addresses only. */
  contactName: string | null
  email: string
  /** The registrable part of the address, or null for a consumer provider. */
  domain: string | null
  /** The line it came from, kept whole. */
  line: string
  /** What it could not work out, said plainly rather than left blank. */
  needs: string[]
}

export interface SupplierRead {
  rows: SupplierRow[]
  /** Addresses seen more than once, collapsed. */
  duplicates: number
  /** Lines that had no address in them at all. */
  skipped: string[]
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/**
 * Read a pasted list into suppliers.
 *
 * One row per address, one supplier per firm. Two contacts at the same
 * company are two rows and one supplier, which is what a client means
 * when they paste an account manager and a delivery lead from the same
 * firm — not two vendors who happen to share a domain.
 */
export function readSupplierList(raw: string): SupplierRead {
  const seen = new Set<string>()
  const rows: SupplierRow[] = []
  const skipped: string[] = []
  let duplicates = 0

  for (const line of splitLines(raw)) {
    const found = line.match(EMAIL)
    if (!found) {
      // Header rows, section titles and the odd stray word. Reported
      // rather than swallowed, because a client who pasted forty lines
      // and got twelve suppliers back needs to know where the rest went.
      if (line.trim().length > 0) skipped.push(line.trim())
      continue
    }

    const email = found[0].toLowerCase()
    if (seen.has(email)) {
      duplicates++
      continue
    }
    seen.add(email)

    rows.push(readOne(line, email))
  }

  return { rows, duplicates, skipped }
}

/** One line, one supplier contact. */
export function readOne(line: string, email: string): SupplierRow {
  const domain = companyDomain(email)
  const rest = withoutTheAddress(line, email)
  const { company, contactName } = readNames(rest, domain)

  const needs: string[] = []
  if (!company) {
    needs.push(
      domain === null
        ? 'Personal address — say which firm this is.'
        : 'No company name on this line.'
    )
  }

  return { company, contactName, email, domain, line: line.trim(), needs }
}

/**
 * The part of an address that identifies a firm.
 *
 * Null for a consumer provider, which is the honest answer: gmail.com
 * identifies nobody, and treating it as a company domain would merge
 * every small supplier in the list into one.
 */
export function companyDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const host = email.slice(at + 1).toLowerCase()
  return CONSUMER.has(host) ? null : host
}

/**
 * A company name from a domain, where there is nothing better.
 *
 * "cloudepa.com" → "Cloudepa". "vertex-talent.io" → "Vertex Talent". It
 * is a guess and it is shown to somebody who can correct it in one
 * keystroke, which is the only reason it is allowed to guess at all.
 */
export function nameFromDomain(domain: string): string {
  const stem = domain.split('.')[0]
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ── Small readers ─────────────────────────────────────────────────────

/**
 * Split a paste into lines.
 *
 * Newlines mostly, but a distribution list copied out of an Outlook To:
 * field arrives as one long semicolon-separated string, which would
 * otherwise read as a single supplier with a very strange name.
 */
export function splitLines(raw: string): string[] {
  return raw
    .split(/[\r\n]+/)
    .flatMap((l) => (l.split(';').length > 2 ? l.split(';') : [l]))
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/** The line with the address and its punctuation taken out. */
function withoutTheAddress(line: string, email: string): string {
  return line
    .replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
    .replace(/[<>()\[\]"']/g, ' ')
    .replace(/\s*[,;|\t]\s*/g, '\t')
    .trim()
}

/**
 * Which of the leftover words is the firm and which is the person.
 *
 * Two fields is the common shape and the order is not fixed — a
 * spreadsheet gives company then contact, a signature block gives contact
 * then company. A legal suffix settles it where there is one; otherwise
 * the field that matches the domain is the company, and failing both, the
 * first field is the company because that is how lists are usually
 * written.
 */
export function readNames(
  rest: string,
  domain: string | null
): { company: string | null; contactName: string | null } {
  const fields = rest
    .split('\t')
    .map((f) => f.replace(/\s+/g, ' ').trim())
    .filter((f) => f.length > 1 && /[A-Za-z]/.test(f))

  const fallback = domain ? nameFromDomain(domain) : null

  if (fields.length === 0) {
    return { company: fallback, contactName: null }
  }

  if (fields.length === 1) {
    // One name, and no way to tell a person from a firm except the
    // suffix and the domain. Where the domain names the firm, a lone
    // name is far more likely to be the person who was emailed.
    const only = fields[0]
    if (SUFFIX.test(only)) return { company: only, contactName: null }
    if (fallback && !looksLikeTheDomain(only, domain)) {
      return { company: fallback, contactName: only }
    }
    return { company: only, contactName: null }
  }

  const suffixed = fields.findIndex((f) => SUFFIX.test(f))
  if (suffixed >= 0) {
    return {
      company: fields[suffixed],
      contactName: fields.find((_, i) => i !== suffixed) ?? null,
    }
  }

  const matching = fields.findIndex((f) => looksLikeTheDomain(f, domain))
  if (matching >= 0) {
    return {
      company: fields[matching],
      contactName: fields.find((_, i) => i !== matching) ?? null,
    }
  }

  return { company: fields[0], contactName: fields[1] ?? null }
}

/** Whether a name is plausibly the firm the domain belongs to. */
function looksLikeTheDomain(name: string, domain: string | null): boolean {
  if (!domain) return false
  const stem = domain.split('.')[0].replace(/[-_]/g, '')
  const flat = name.toLowerCase().replace(/[^a-z]/g, '')
  return flat.length > 2 && (stem.includes(flat) || flat.includes(stem))
}

/**
 * What to say above the list once it has been read.
 *
 * The number that matters is how many firms, not how many addresses —
 * a client who pasted twenty rows and has twelve suppliers should be
 * told twelve, or they will think something was lost.
 */
export function listSentence(read: SupplierRead): string {
  const firms = new Set(
    read.rows.map((r) => r.domain ?? r.company?.toLowerCase() ?? r.email)
  ).size

  if (read.rows.length === 0) {
    return 'No email addresses in that. Paste a list with one address per line.'
  }

  const bits = [
    `${firms} ${firms === 1 ? 'supplier' : 'suppliers'}`,
    read.rows.length !== firms ? `${read.rows.length} contacts` : null,
    read.duplicates ? `${read.duplicates} repeated` : null,
    read.skipped.length ? `${read.skipped.length} ${read.skipped.length === 1 ? 'line' : 'lines'} with no address` : null,
  ].filter(Boolean)

  const needs = read.rows.filter((r) => r.needs.length > 0).length
  const tail = needs ? ` ${needs} ${needs === 1 ? 'needs' : 'need'} a company name before you can send.` : ''

  return `${bits.join(', ')}.${tail}`
}

/**
 * Whether a signed-in address may take possession of an invited company.
 *
 * The token alone is not enough. Invitations get forwarded, pasted into
 * group chats and left in shared inboxes, and a token that hands a
 * stranger a company — with its client relationships and its rates — is
 * a door with the key taped to it.
 *
 * So: the invited address itself, or a colleague on the same corporate
 * domain. Never two consumer addresses — a pair of strangers on gmail
 * are not colleagues, and treating them as such would make every
 * forwarded invitation claimable by anybody who saw it.
 */
export function mayClaim(signedInAs: string, invited: string): boolean {
  const a = signedInAs.trim().toLowerCase()
  const b = invited.trim().toLowerCase()
  if (a === b) return true

  const da = companyDomain(a)
  const db = companyDomain(b)
  return da != null && db != null && da === db
}
