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

/**
 * The heading a row is read under.
 *
 * Not the same thing as its kind, and that was a real bug: a document
 * she had already sent sat under "Still needed from you" over a blurb
 * saying "Send one in", which asks her to act on something she has
 * already acted on. A heading is where a person looks before they read
 * the row, so the heading says what the row says.
 */
export type PaperSection = 'OWED' | 'SENT' | 'DOCUMENT' | 'REQUEST' | 'HELD'

/** In reading order: what she must do, what is with them, then the file. */
export const SECTIONS: { key: PaperSection; title: string; blurb: string }[] = [
  { key: 'OWED', title: 'Still needed from you',
    blurb: 'Documents your placements require that are not on your file yet. Send one in and whoever asked for it is told; they record whether it is accepted.' },
  { key: 'SENT', title: 'Sent, waiting to be checked',
    blurb: 'You have sent these. Nothing more is needed from you until somebody has looked at them — and they are not on your file until they do.' },
  { key: 'DOCUMENT', title: 'Sent to you to sign',
    blurb: 'Papers somebody sent you. You answer these here.' },
  { key: 'REQUEST', title: 'Asked for',
    blurb: 'Somebody has opened a request. You answer these at the link it came with.' },
  { key: 'HELD', title: 'On your file',
    blurb: 'What we already hold about you, and the day each one runs out.' },
]

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
  /** What to name when asking for a request to be opened. */
  documentTypeKey: string | null
  /**
   * Where to ask for somewhere to send it, when nobody has asked yet.
   * Null on a waived row and on one she has already sent — neither
   * wants anything from her.
   */
  openAskAt: string | null
  needsSignature: boolean
  /** True where a lapse or an absence stops the work. */
  stopsWork: boolean
  waived: boolean
  /** Why it was waived and by whom. Never a bare "waived". */
  waivedSays: string | null
  /**
   * She has sent it and nobody has checked it yet.
   *
   * Not on file — a check still running holds nothing — and not owed by
   * her either. Asking a worker again the next morning for the paper
   * sitting in somebody's queue is how she learns the page is not worth
   * reading.
   */
  awaiting: boolean
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
  /**
   * The route says a paper for THIS row arrived and nobody has checked
   * it. Never inferred — see `isAwaiting`.
   */
  received?: boolean
  status?: string
  /** The type to name when opening a request. */
  documentTypeKey?: string | null
  /**
   * The route that opens a request for it, where one can be opened —
   * `/api/me/papers`. Null where nothing is wanted from her.
   */
  openAskAt?: string | null
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
  status?: string
  received?: boolean
  documentTypeKey?: string | null
  openAskAt?: string | null
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
  if (isAwaiting(item)) return 'Sent — waiting for somebody to check it'
  return 'Still needed'
}

/**
 * Sent, and with somebody else.
 *
 * Said by the route, never inferred by this screen.
 *
 * For one day this read the ABSENCE of somewhere to send it as proof
 * that it had been sent — `!link && !askId && !openAskAt` — so "nobody
 * can send this" and "this has been sent" were the same shape. On the
 * re-walk an NDA nobody had ever touched read "Sent — waiting for
 * somebody to check it. Nothing more is needed from you", which is a
 * compliance fact this screen invented. Two states that mean opposite
 * things must not share a signal, and a screen must not decide a fact
 * the route did not send it.
 */
export function isAwaiting(item: OwedItem): boolean {
  return item.received === true || item.status === 'AWAITING_REVIEW'
}

/**
 * What happens if it does not arrive, in words rather than in a code.
 *
 * The refusal at the door says "Priya cannot start without an I-9". The
 * person who has to fix it should read the same fact in the first
 * person, before anybody is refused anything.
 */
export function owedConsequence(item: OwedItem): string | null {
  if (isAwaiting(item)) {
    return 'It is with them now. Nothing more is needed from you until they have looked at it.'
  }
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
 * For a day this returned null on everything nobody had opened a
 * request for, because there was no route that received a file against
 * a requirement and a button that posts to a 404 is worse than a
 * sentence. `etyme-regulatory` built the door the same evening, so the
 * answer is now yes on every row that wants anything: a packet has its
 * own link; a request already opened has an id to post against; and a
 * requirement with nobody asking yet has `openAskAt`, which opens one
 * and hands back the id. Two requests, one press.
 *
 * Null survives for the two rows that want nothing from her — waived,
 * and sent and waiting for somebody to check it.
 */
export function owedTodo(item: OwedItem): 'sign' | 'upload' | 'open' | null {
  if (item.waived) return null
  // Already with them. Offering to send it again is how one upload
  // becomes two and a worker stops believing the page.
  if (isAwaiting(item)) return null
  if (item.link) return 'open'
  if (item.askId) return item.needsSignature ? 'sign' : 'upload'
  if (item.openAskAt) return 'upload'
  return null
}

function rowFromOwed(item: OwedItem): PaperRow {
  const todo = owedTodo(item)
  return {
    id: item.askId ?? `owed:${item.key}`,
    kind: 'OWED',
    name: readable(item),
    // The route sends null here on purpose — the party that owes it on
    // her own page is her, and "Helena Marsh asked for Helena Marsh's
    // I-9" reads as though she asked herself.
    askedBy: (item.owedByName ?? '').trim(),
    from: owedFrom(item),
    word: owedWord(item),
    consequence: owedConsequence(item),
    todo,
    link: item.link ?? null,
    askId: item.askId ?? null,
    awaiting: isAwaiting(item),
    documentTypeKey: (item.documentTypeKey ?? item.key) || null,
    openAskAt: item.openAskAt ?? null,
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
      received: p.received,
      status: p.status,
      askId: requirementOnly ? null : (p.askId ?? p.id ?? null),
      link: p.link ?? null,
      needsSignature: p.needsSignature,
      documentTypeKey: p.documentTypeKey ?? null,
      openAskAt: p.openAskAt ?? null,
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
    documentTypeKey: null,
    openAskAt: null,
    needsSignature: !!p.needsSignature,
    stopsWork: !!p.stopsWork,
    waived: false,
    waivedSays: null,
    awaiting: false,
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

  // ── One document is one row ───────────────────────────────────────
  //
  // This deduped on kind and id together, which is not a dedupe at all
  // where the route knows about one document two ways: Helena's own
  // upload came back as a DOCUMENT saying "On file" and as an
  // OUTSTANDING saying "Sent — waiting for somebody to check it", and
  // both survived. She read the same paper twice, under two headings
  // that contradicted each other, one of them claiming somebody had
  // sent it to her.
  //
  // The id is the document. Where two rows carry one id, the one that
  // says what is owed wins, because the page's job is to tell her what
  // to do — and "on file" is the claim that would stop her doing it.
  //
  // An `owed:<KEY>` row is a requirement rather than a document and
  // carries an id no document can have, so nothing collapses into it
  // and two different requirements are two different ids. They are
  // never duplicates of anything.
  const best = new Map<string, PaperRow>()
  for (const r of rows) {
    const held = best.get(r.id)
    if (!held) best.set(r.id, r)
    else if (held.kind !== 'OWED' && r.kind === 'OWED') best.set(r.id, r)
  }
  const once = rows.filter((r) => best.get(r.id) === r)

  // Grouped, and within a group left exactly as it arrived. `myPapers`
  // already sorts what stops the work to the top and a waived row below
  // it; sorting again here would be two domains deciding one order, and
  // the second one would win silently.
  const order = Object.fromEntries(SECTIONS.map((s, i) => [s.key, i])) as Record<PaperSection, number>
  return once
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (order[sectionOf(a.r)] - order[sectionOf(b.r)]) || (a.i - b.i))
    .map((x) => x.r)
}

/**
 * Which heading a row is read under.
 *
 * A sent document is still an owed one by kind — it is not on her file
 * and it still counts as nothing — but it is not still needed FROM her,
 * and the heading is the part somebody reads first.
 */
export function sectionOf(row: PaperRow): PaperSection {
  if (row.kind === 'OWED') return row.awaiting ? 'SENT' : 'OWED'
  return row.kind
}

/** The rows under one heading, in the order they arrived. */
export function rowsInSection(rows: PaperRow[], section: PaperSection): PaperRow[] {
  return rows.filter((r) => sectionOf(r) === section)
}

/**
 * What she actually has to do something about.
 *
 * Neither a waiver nor a document already sent is one. Both stay on the
 * list and neither is counted against her: one because somebody
 * accepted its absence by name, the other because it is in a queue she
 * does not control.
 */
export function outstanding(rows: PaperRow[]): PaperRow[] {
  return rows.filter(
    (r) => (r.kind === 'OWED' && !r.waived && !r.awaiting) || (r.kind !== 'HELD' && !!r.todo)
  )
}

/** Sent, and waiting on somebody else. */
export function awaitingReview(rows: PaperRow[]): PaperRow[] {
  return rows.filter((r) => r.awaiting)
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
  const sent = awaitingReview(rows)
  // Said whenever there is one, because a worker who sent something
  // yesterday opens this page to find out whether it landed.
  const withThem = sent.length
    ? ` ${sent.length === 1 ? 'One more is' : `${sent.length} more are`} with them, waiting to be checked.`
    : ''
  if (todo.length === 0) {
    if (rows.length === 0) return 'Nothing is on your file yet, and nobody is asking you for anything.'
    if (sent.length) {
      return `Nothing is being asked of you. ${sent.length === 1 ? 'One document is' : `${sent.length} documents are`} ` +
        'with them, waiting to be checked.'
    }
    return 'Nothing is being asked of you. Everything below is on file.'
  }
  const blocking = todo.filter((r) => r.stopsWork).length
  const n = `${todo.length} ${todo.length === 1 ? 'document is' : 'documents are'} still needed from you`
  if (blocking === 0) return `${n}.${withThem}`
  if (blocking === todo.length) {
    return `${n}, and ${todo.length === 1 ? 'it stops' : 'they stop'} you working until ${todo.length === 1 ? 'it arrives' : 'they arrive'}.${withThem}`
  }
  return `${n}. ${blocking} of them ${blocking === 1 ? 'stops' : 'stop'} you working until ${blocking === 1 ? 'it arrives' : 'they arrive'}.${withThem}`
}

/** How many count against her. A waived item never does. */
export function countedAgainst(rows: PaperRow[]): number {
  return outstanding(rows).length
}
