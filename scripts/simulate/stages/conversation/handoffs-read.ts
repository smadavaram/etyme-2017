/**
 * How the handoffs station reads what a seat was told, as plain
 * arithmetic over answers and rows, with no server and no database, so a
 * unit test can hold every rule the station judges a greeting by
 * (`__tests__/invariants/simulation-handoffs.test.ts`).
 *
 * Owned by conversation, beside the station that uses it.
 */

// ── The greeting as text ───────────────────────────────────────────────

/** Keys whose strings are addresses or ids, never words a person reads. */
const NOT_WORDS = new Set(['href', 'id', 'approvalId', 'entityId', 'conversationId', 'personId', 'sheetId', 'timesheetId', 'invoiceId', 'act', 'action', 'kind', 'tone', 'stage', 'currency'])

/** Every sentence a person reads in an answer, in order, one per string. */
export function wordsOf(answer: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown, key: string | null) => {
    if (v == null) return
    if (typeof v === 'string') {
      if (key && NOT_WORDS.has(key)) return
      if (v.trim()) out.push(v.trim())
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, key)
      return
    }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k)
    }
  }
  walk(answer, null)
  return out
}

/** The whole greeting as one string, for "does it name her". */
export function textOf(answer: unknown): string {
  return wordsOf(answer).join('\n')
}

/**
 * The greeting cut into the pieces a person reads as one thing: the
 * opening line, the recommendation, each card, each held bill and each
 * line under them. A name and its due day sit in one piece, so "whose
 * week, and by when" is asked of the piece that names her.
 */
export function blocksOf(answer: any): string[] {
  if (!answer || typeof answer !== 'object') return []
  const out: string[] = []
  if (typeof answer.says === 'string') out.push(answer.says)
  if (answer.recommend) out.push(textOf(answer.recommend))
  for (const k of ['queue', 'items', 'held', 'cards', 'more', 'tail']) {
    const list = answer[k]
    if (Array.isArray(list)) for (const x of list) out.push(textOf(x))
  }
  if (answer.papers) out.push(textOf(answer.papers))
  return out.filter(Boolean)
}

/** Whether a name is said, matched whole and without regard to case. */
export function names(text: string, name: string): boolean {
  const n = name.trim()
  if (!n) return false
  return text.toLowerCase().includes(n.toLowerCase())
}

/**
 * Whether a text carries the thing a notice is about, the way a person
 * would say it. The thing is read off the notice's body ("the week of Aug
 * 23–29"), and a title that names it in its own grammar — "Anjali Mehta's
 * week of Aug 23–29 is yours to accept" — carries it, though it never says
 * "the week of". So a leading article is not required, and for a week the
 * dates alone are enough. An en dash and a hyphen between dates are one
 * mark (full simulation run, 2026-10-20).
 */
export function carries(text: string, what: string): boolean {
  const flat = (x: string) => x.replace(/\s*[–-]\s*/g, '–')
  const t = flat(text)
  const w = flat(what.trim())
  if (!w) return false
  if (names(t, w)) return true
  const bare = w.replace(/^(the|a|an)\s+/i, '')
  if (bare.length >= 3 && names(t, bare)) return true
  const dates = /\bweek (?:of )?(.+)$/i.exec(bare)?.[1]?.trim()
  return !!dates && /\d/.test(dates) && names(t, dates)
}

// ── The count the greeting leads with ──────────────────────────────────

const WORD_NUMBERS: Record<string, number> = {
  no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
}

/**
 * The number the greeting's first line says needs this seat: "Five
 * things need you…" is 5, "Nothing needs you today" is 0. Null where the
 * line does not lead with a count (a seat whose queue could not be read
 * says what the twin asked instead), so a mismatch is never invented.
 */
export function countSaid(says: unknown): number | null {
  if (typeof says !== 'string') return null
  const s = says.trim()
  if (/^Nothing needs you\b/i.test(s)) return 0
  const m = /^(\d+|[A-Za-z]+) things? needs? you\b/i.exec(s)
  if (!m) return null
  const w = m[1].toLowerCase()
  return /^\d+$/.test(w) ? Number(w) : WORD_NUMBERS[w] ?? null
}

// ── "Since you last looked" ────────────────────────────────────────────

export const SINCE = 'Since you last looked:'

/** The lines under "Since you last looked", up to the next line that is not one of them (the closing line). */
export function sinceLines(lines: readonly string[], closing: readonly string[]): string[] {
  const at = lines.findIndex((l) => l === SINCE)
  if (at < 0) return []
  const out: string[] = []
  for (const l of lines.slice(at + 1)) {
    if (closing.includes(l)) break
    out.push(l)
  }
  return out
}

/**
 * Machine talk a first screen may not say (CLAUDE.md, 2026-10-19): a
 * count in brackets, a countdown where a day belongs, an enum, a clock
 * at midnight, the test thread. Returns the reason, or null for a line a
 * person would say.
 */
export function machineTalk(line: string): string | null {
  if (/\(\s*\d+\s+times?\s*\)/i.test(line)) return 'a count in brackets'
  if (/—\s*in \d+ days?\b/i.test(line)) return 'a countdown where a day belongs'
  if (/\b[A-Z]{2,}_[A-Z_]{2,}\b/.test(line)) return 'an enum name'
  if (/\b12:00 AM\b/.test(line)) return 'a midnight clock'
  if (/^Event created\b/i.test(line)) return '"Event created"'
  if (/please ignore/i.test(line)) return 'a test message'
  if (/\bposition\(s\)/.test(line)) return '"position(s)"'
  return null
}

/**
 * What a notice is about, from its own body, where the body names it in
 * front of " — ": "Data engineer — 1 position(s) in Tualatin" is "Data
 * engineer". Null where the body does not lead with a subject.
 */
export function subjectOf(body: string | null | undefined): string | null {
  const b = (body ?? '').trim()
  const i = b.indexOf(' — ')
  if (i <= 0) return null
  let s = b.slice(0, i).trim()
  // "Technical, round 1, for Data engineer. 3 times offered": the thing is what it is for.
  const f = / for (.+?)(?:\.\s|\.$|$)/.exec(s)
  if (f) s = f[1].trim()
  return s.length >= 3 && s.length <= 120 ? s : null
}

/** A hold's reason, from the body the hold route writes: "X put bill N on hold: <reason>. Nothing is paid…". */
export function holdReasonOf(body: string | null | undefined): string | null {
  const m = /on hold:\s*(.+?)\.\s*Nothing is paid/i.exec(body ?? '')
  return m ? m[1].trim() : null
}

// ── Who was told what, how many times ──────────────────────────────────

export interface NoticeRow {
  id: string
  personId: string
  personName: string
  type: string
  title: string
  body: string
  entityId: string | null
  channel: string
  deliveryState: string
  /** client, supplier, integrator, MSP, one-person firm, worker */
  party: string
  createdAt: Date
}

/**
 * The same thing told to the same person more than once: the same kind,
 * title, body and thing. `alike` is the other failure: different news
 * under one title, so a reader's list shows the same line three times
 * ("New submission for Data engineer", three candidates, none named).
 */
export function toldTwice(rows: readonly NoticeRow[]): { personName: string; party: string; title: string; body: string; times: number; alike: boolean }[] {
  const group = (key: (r: NoticeRow) => string) => {
    const by = new Map<string, NoticeRow[]>()
    for (const r of rows) {
      const k = key(r)
      const list = by.get(k)
      if (list) list.push(r)
      else by.set(k, [r])
    }
    return [...by.values()].filter((l) => l.length > 1)
  }
  const same = group((r) => `${r.personId}\u0000${r.type}\u0000${r.title}\u0000${r.body}\u0000${r.entityId ?? ''}`)
  const sameIds = new Set(same.flat().map((r) => r.id))
  const alike = group((r) => `${r.personId}\u0000${r.type}\u0000${r.title}`)
    .map((l) => l.filter((r) => !sameIds.has(r.id)))
    .filter((l) => new Set(l.map((r) => r.body)).size > 1)
  return [
    ...same.map((l) => ({ personName: l[0].personName, party: l[0].party, title: l[0].title, body: l[0].body, times: l.length, alike: false })),
    ...alike.map((l) => ({ personName: l[0].personName, party: l[0].party, title: l[0].title, body: l[0].body, times: l.length, alike: true })),
  ].sort((a, b) => Number(a.alike) - Number(b.alike) || b.times - a.times)
}

/** Outbound messages by channel, kind and the party that received them. */
export function outboundBy(rows: readonly NoticeRow[]): { channel: string; type: string; party: string; messages: number; people: number }[] {
  const by = new Map<string, NoticeRow[]>()
  for (const r of rows) {
    const key = `${r.channel}\u0000${r.type}\u0000${r.party}`
    const list = by.get(key)
    if (list) list.push(r)
    else by.set(key, [r])
  }
  return [...by.values()]
    .map((l) => ({ channel: l[0].channel, type: l[0].type, party: l[0].party, messages: l.length, people: new Set(l.map((r) => r.personId)).size }))
    .sort((a, b) => b.messages - a.messages)
}

/** A candidate is reachable on email only: a Teams message to a worker reaches nobody. */
export function teamsToWorkers(rows: readonly NoticeRow[]): NoticeRow[] {
  return rows.filter((r) => r.party === 'worker' && r.channel === 'TEAMS')
}

// ── Timings ────────────────────────────────────────────────────────────

/** Nearest-rank percentile; null for none. The same rule the ledger uses. */
export function pct(ms: readonly number[], p: number): number | null {
  if (ms.length === 0) return null
  const s = [...ms].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * s.length)
  return s[Math.min(s.length, Math.max(1, rank)) - 1]
}
