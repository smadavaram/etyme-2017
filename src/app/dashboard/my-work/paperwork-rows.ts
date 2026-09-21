/**
 * What a worker's paperwork page shows, as arithmetic.
 *
 * ── Why this file exists ──
 *
 * Every chase letter this system sends a worker ends "Upload it from
 * your Paperwork page." Helena Marsh opened hers and read three
 * documents she already holds and nothing else — because
 * `/api/me/papers` returned what was on her file and never what was
 * being asked of her, under a subtitle that promised both. So the
 * letters pointed at a page that could not show the thing the letter
 * was about.
 *
 * The page now shows four kinds of row, and the difference between them
 * is the whole point:
 *
 *   OWED     — a document a line or an order requires of her that she
 *              does not hold. Something to act on.
 *   REQUEST  — somebody has actually asked, in a packet. Answered at
 *              the link it came with.
 *   DOCUMENT — a paper sent to her for signature. Answered here.
 *   HELD     — on her file already, with the day it runs out. Read,
 *              never answered.
 *
 * ── What is deliberately not decided here ──
 *
 * Nothing in this file knows what a document *is*. It reads labels,
 * sentences and two booleans off a payload that `etyme-regulatory`
 * computes from `DocumentRequirement`. A taxonomy of skills, a list of
 * document kinds or a rule that only makes sense for software would be
 * wrong here: an ICU travel nurse's state registration and a validation
 * engineer's clean-room induction are the same row.
 *
 * Pure. No database, no fetch, no clock beyond the day handed in.
 */

export type PaperRowKind = 'OWED' | 'REQUEST' | 'DOCUMENT' | 'HELD'

/**
 * What `myPapers` calls an outstanding row.
 *
 * `etyme-regulatory` landed it as `OUTSTANDING` while this was being
 * written; the screen calls the same thing `OWED`, and the one line
 * below is the whole translation. Both names are read, so neither
 * domain has to wait for the other.
 */
const OUTSTANDING_KINDS = ['OWED', 'OUTSTANDING']

/** One row as the screen draws it. */
export interface PaperRow {
  id: string
  kind: PaperRowKind
  /** What it is, in the words she would use. */
  name: string
  /** Who asked, or who issued it. */
  askedBy: string
  /** Where it came from, as a sentence. Null where nobody said. */
  from: string | null
  /** What is true about it now — "Still needed", "Runs out in 24 days". */
  word: string
  /**
   * What happens if it does not arrive, in words. Null on a row where
   * nothing happens — something already on file is not a consequence.
   */
  consequence: string | null
  /** What is hers to do. Null means nothing is. */
  todo: 'sign' | 'upload' | 'open' | null
  /** Where she answers it, where that is somewhere else. */
  link: string | null
  /** The id the answer is posted against, where a request exists. */
  askId: string | null
  needsSignature: boolean
  /** True where a lapse or an absence stops the work. */
  stopsWork: boolean
  waived: boolean
  /** Why it was waived and by whom. Never a bare "waived". */
  waivedSays: string | null
  runsOutOn: string | null
}

/**
 * The shape this page was written against, 2026-09-21.
 *
 * `etyme-regulatory` owns `/api/me/papers` and `lib/document-request`,
 * and landed the requirement read the same afternoon: `myPapers` now
 * emits a fourth kind, `OUTSTANDING`, carrying `stopsWork`, `waived`,
 * the sentence that says who asked, and an id of `owed:<type key>`.
 * Two arrangements are accepted so neither domain waits on the other —
 * those rows inside `papers`, or an `owed` array beside it — and the
 * fields below are the union.
 */
export interface OwedItem {
  /** The type key — I9_EVERIFY, RN_LICENSE, a client's own invention. */
  key: string
  /** What it is called, as she would say it. Never the key. */
  label?: string | null
  /** "Required by Cavanaugh Glassworks's order PO-2026-1." */
  says?: string | null
  /** The firm or person that owes it, where the line names one. */
  owedByName?: string | null
  /** True where not having it stops the work. `stopsWork` is accepted too. */
  blocks?: boolean
  stopsWork?: boolean
  waived?: boolean
  waivedSays?: string | null
  /** A DocInstance to answer against, where one exists. */
  askId?: string | null
  /** A packet link, where the ask came as one. */
  link?: string | null
  needsSignature?: boolean
}

/** Anything `myPapers` returns. Read loosely on purpose — it is not ours. */
interface LoosePaper {
  id?: string
  kind?: string
  name?: string
  label?: string
  askedBy?: string
  why?: string | null
  says?: string | null
  word?: string
  todo?: 'sign' | 'upload' | 'open' | null
  link?: string | null
  askId?: string | null
  needsSignature?: boolean
  stopsWork?: boolean
  blocks?: boolean
  waived?: boolean
  waivedSays?: string | null
  runsOutOn?: string | null
  dueOn?: string | null
  key?: string
}

/** A key read on a screen is a bug. A label with no label is not one. */
function readable(item: { label?: string | null; key?: string }): string {
  const label = (item.label ?? '').trim()
  if (label) return label.charAt(0).toUpperCase() + label.slice(1)
  // No label came back. The key is the only honest thing left, and it is
  // said as a phrase rather than shouted as an enum.
  const key = (item.key ?? '').trim()
  if (!key) return 'A document'
  const words = key.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The word an outstanding row shows.
 *
 * A waived item is not outstanding and never reads as though it were.
 * It stays on the list — Addendum E: a waived item stays, marked, with
 * the reason and the name — and says it is not hers to find.
 */
export function owedWord(item: OwedItem): string {
  if (item.waived) return 'Waived — not needed from you'
  return 'Still needed'
}

/**
 * What happens if it does not arrive, in words rather than in a code.
 *
 * The refusal at the door says "Priya cannot start without an I-9". The
 * person who has to fix it should read the same fact in the first
 * person, before anybody is refused anything.
 */
export function owedConsequence(item: OwedItem): string | null {
  if (item.waived) {
    return item.waivedSays?.trim()
      ? item.waivedSays.trim()
      : 'Somebody has waived this. It is not counted against you.'
  }
  if (item.blocks ?? item.stopsWork) {
    return 'Without this you cannot start work, and a placement already running is stopped.'
  }
  return 'This will not stop you working. You will be asked for it until it is on file.'
}

/** Where it came from, as a sentence. Null where nobody said, never invented. */
export function owedFrom(item: OwedItem): string | null {
  const says = (item.says ?? '').trim()
  return says || null
}

/**
 * Where a worker answers an outstanding item.
 *
 * Three honest answers and no fourth. Where a packet carries it, the
 * link. Where a document was sent for signature or upload, this page.
 * Where a requirement exists and nobody has opened a request against it,
 * there is nothing to post to — and offering an upload box that posts
 * into the air would be worse than saying so.
 */
export function owedTodo(item: OwedItem): 'sign' | 'upload' | 'open' | null {
  if (item.waived) return null
  if (item.link) return 'open'
  if (item.askId) return item.needsSignature ? 'sign' : 'upload'
  return null
}

/**
 * The sentence over a group nobody can act on yet.
 *
 * Said once for the group rather than under every row: repeated on each
 * line it reads as three separate problems when it is one missing door.
 */
export const NO_DOOR_YET =
  'No one has opened a request for these yet, so there is nowhere to upload them here — ' +
  'send each to whoever asked for it and it will appear on this page once they record it.'

function rowFromOwed(item: OwedItem): PaperRow {
  const todo = owedTodo(item)
  return {
    id: item.askId ?? `owed:${item.key}`,
    kind: 'OWED',
    name: readable(item),
    askedBy: (item.owedByName ?? '').trim() || 'You',
    from: owedFrom(item),
    word: owedWord(item),
    consequence: owedConsequence(item),
    todo,
    link: item.link ?? null,
    askId: item.askId ?? null,
    needsSignature: !!item.needsSignature,
    stopsWork: !!(item.blocks ?? item.stopsWork),
    waived: !!item.waived,
    waivedSays: item.waivedSays ?? null,
    runsOutOn: null,
  }
}

function rowFromPaper(p: LoosePaper): PaperRow {
  if (OUTSTANDING_KINDS.includes(p.kind ?? '')) {
    // An outstanding row's id is `owed:<type key>` — a requirement, not
    // a document — so there is nothing at /api/documents/:id to post
    // to. The payload asks for an upload button anyway; the row keeps
    // its honesty instead and says where to send it. When a door exists
    // the id stops being a requirement and the button comes back on its
    // own.
    const requirementOnly = (p.id ?? '').startsWith('owed:') || !p.id
    const row = rowFromOwed({
      key: p.key ?? (p.id ?? '').replace(/^owed:/, ''),
      label: p.label ?? p.name ?? null,
      says: p.says ?? p.why ?? null,
      owedByName: p.askedBy ?? null,
      blocks: p.blocks,
      stopsWork: p.stopsWork,
      waived: p.waived,
      waivedSays: p.waivedSays ?? null,
      askId: requirementOnly ? null : (p.askId ?? p.id ?? null),
      link: p.link ?? null,
      needsSignature: p.needsSignature,
    })
    // The route's own word for the row, where it sent one. It knows
    // whether the one on file ran out or was never filed at all, and
    // this file does not.
    return { ...row, word: (p.word ?? '').trim() || row.word }
  }
  const kind = (p.kind === 'REQUEST' || p.kind === 'HELD') ? p.kind : 'DOCUMENT'
  return {
    id: p.id ?? '',
    kind,
    name: p.name ?? readable({ label: p.label, key: p.key }),
    askedBy: p.askedBy ?? '',
    from: (p.why ?? '')?.trim() || null,
    word: p.word ?? '',
    // Something already on file has no consequence attached to it, and a
    // sentence about what would happen if it were missing, printed under
    // a document that is not missing, reads as a threat about nothing.
    consequence: null,
    todo: p.todo ?? null,
    link: p.link ?? null,
    askId: null,
    needsSignature: !!p.needsSignature,
    stopsWork: !!p.stopsWork,
    waived: false,
    waivedSays: null,
    runsOutOn: p.runsOutOn ?? null,
  }
}

/**
 * Every row on the page, from whatever the route sent.
 *
 * Outstanding first, then what has been asked, then what is on file —
 * a page that opens on what is finished makes somebody scroll to find
 * their work. Within the outstanding group, what stops the work first.
 */
export function paperRows(payload: { papers?: unknown; owed?: unknown } | null | undefined): PaperRow[] {
  const papers = Array.isArray(payload?.papers) ? (payload!.papers as LoosePaper[]) : []
  const owed = Array.isArray(payload?.owed) ? (payload!.owed as OwedItem[]) : []

  const rows = [...papers.map(rowFromPaper), ...owed.map(rowFromOwed)]

  // The same requirement can arrive twice where the route sends it both
  // ways round. The row is one document either way.
  const seen = new Set<string>()
  const once = rows.filter((r) => {
    const id = `${r.kind}:${r.id}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  // Grouped, and within a group left exactly as it arrived. `myPapers`
  // already sorts what stops the work to the top and a waived row below
  // it; sorting again here would be two domains deciding one order, and
  // the second one would win silently.
  const order: Record<PaperRowKind, number> = { OWED: 0, DOCUMENT: 1, REQUEST: 2, HELD: 3 }
  return once
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (order[a.r.kind] - order[b.r.kind]) || (a.i - b.i))
    .map((x) => x.r)
}

/** What she actually has to do something about. A waiver is not one. */
export function outstanding(rows: PaperRow[]): PaperRow[] {
  return rows.filter((r) => (r.kind === 'OWED' && !r.waived) || (r.kind !== 'HELD' && !!r.todo))
}

/**
 * The sentence at the top of the page.
 *
 * Four states and each is a different sentence, because "nothing is
 * outstanding" shown as an empty list under a promise is the bug this
 * page is being fixed for. A worker with nothing owed is told so.
 */
export function paperworkHeadline(rows: PaperRow[]): string {
  const todo = outstanding(rows)
  if (todo.length === 0) {
    if (rows.length === 0) return 'Nothing is on your file yet, and nobody is asking you for anything.'
    return 'Nothing is being asked of you. Everything below is on file.'
  }
  const blocking = todo.filter((r) => r.stopsWork).length
  const n = `${todo.length} ${todo.length === 1 ? 'document is' : 'documents are'} still needed from you`
  if (blocking === 0) return `${n}.`
  if (blocking === todo.length) {
    return `${n}, and ${todo.length === 1 ? 'it stops' : 'they stop'} you working until ${todo.length === 1 ? 'it arrives' : 'they arrive'}.`
  }
  return `${n}. ${blocking} of them ${blocking === 1 ? 'stops' : 'stop'} you working until ${blocking === 1 ? 'it arrives' : 'they arrive'}.`
}

/** How many count against her. A waived item never does. */
export function countedAgainst(rows: PaperRow[]): number {
  return outstanding(rows).length
}
