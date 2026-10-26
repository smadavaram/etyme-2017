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

import { formatDay } from '@/lib/format-date'
import { questionOf } from '@/lib/document-request'

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
export type PaperSection = 'OWED' | 'QUESTION' | 'ASKED' | 'DOCUMENT' | 'REQUEST' | 'SENT' | 'DONE' | 'HELD'

/**
 * In reading order: what she must do, what is with them, then the file.
 *
 * Each heading says what the rows under it ask of her (the screen walk,
 * 2026-10-22). "Sent to you to sign" sat over a résumé she was asked to
 * send and over the two questions a firm asks before any offer, so she
 * read "sign" over things nobody wanted signed, and a paper she had
 * already answered stayed under a heading asking her to act.
 */
export const SECTIONS: { key: PaperSection; title: string; blurb: string }[] = [
  { key: 'OWED', title: 'Still needed from you',
    blurb: 'Your placements need these, and they are not on your file yet. Send one in and whoever asked is told. They decide if it is accepted.' },
  { key: 'QUESTION', title: 'Questions to answer',
    blurb: 'A firm asks these before any offer. Type your answer here. No document is asked for yet.' },
  { key: 'ASKED', title: 'Asked of you',
    blurb: 'A firm asked you to send these. Send each one here, and they are told.' },
  { key: 'DOCUMENT', title: 'Sent to you to sign',
    blurb: 'A firm sent you these papers to sign. Sign them here.' },
  { key: 'REQUEST', title: 'Asked for, with a link',
    // Drawn per firm by `requestsByFirm`, which names who sent each link.
    // This line is only the fallback for a row whose firm the route did
    // not name, and it says so without inventing "a firm".
    blurb: 'These came with a link. Answer each one at its link.' },
  { key: 'SENT', title: 'Sent, waiting to be checked',
    blurb: 'You sent these. Nothing more is needed from you until somebody checks them. They go on your file once checked.' },
  { key: 'DONE', title: 'Answered',
    blurb: 'You answered, signed or sent these. Whoever asked has them.' },
  { key: 'HELD', title: 'On your file',
    blurb: 'What is on your file now, and the day each one runs out.' },
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
  /**
   * What is hers to do. Null means nothing is. `answer` is a question a
   * firm asks before any offer, in place of a document it may not ask
   * for yet: she types the answer, and it is sent as her signed answer.
   */
  todo: 'sign' | 'upload' | 'open' | 'answer' | null
  /** The question, in full, where the row is one. Null on a document. */
  question: string | null
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
    question: null,
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
    // And the day it ran out, where it did: the line at the top of Your
    // work says "ran out on Oct 16", from the route's own date.
    return { ...row, word: (p.word ?? '').trim() || row.word, runsOutOn: p.runsOutOn ?? null }
  }
  const kind = (p.kind === 'REQUEST' || p.kind === 'HELD') ? p.kind : 'DOCUMENT'
  // One of the two questions that stand in for a document a firm may not
  // ask for before an offer (lib/document-stages `insteadAsk`). She
  // answers it in words; signing it blank would answer nothing.
  const q = kind === 'DOCUMENT' ? questionOf(p.name ?? '') : null
  const todo = q && p.todo === 'sign' ? 'answer' : (p.todo ?? null)
  return {
    id: p.id ?? '',
    kind,
    name: p.name ?? readable({ label: p.label, key: p.key }),
    askedBy: p.askedBy ?? '',
    from: (p.why ?? '')?.trim() || null,
    word: q ? (todo ? 'Not answered yet' : 'Answered') : (p.word ?? ''),
    // Something already on file has no consequence attached to it, and a
    // sentence about what would happen if it were missing, printed under
    // a document that is not missing, reads as a threat about nothing.
    consequence: null,
    todo,
    question: q?.question ?? null,
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
  if (row.kind === 'DOCUMENT') {
    // Read by what it asks of her, never by the table it came from.
    if (!row.todo) return 'DONE'
    if (row.todo === 'answer') return 'QUESTION'
    if (row.todo === 'upload') return 'ASKED'
    return 'DOCUMENT'
  }
  return row.kind
}

/**
 * The links she was sent, grouped by the firm that sent them, each with
 * its own line: "Halcyon Talent sent you a link for this." A worker who
 * reads "a firm sent you a link" cannot tell which email to look for, and
 * the route already says who asked (`askedBy`). Firms in the order their
 * first row arrived; rows kept in their own order. A row whose firm the
 * route did not name is grouped apart and never given a made-up name.
 */
export function requestsByFirm(rows: PaperRow[]): { firm: string | null; says: string; rows: PaperRow[] }[] {
  const groups = new Map<string, PaperRow[]>()
  for (const r of rows) {
    const firm = (r.askedBy ?? '').trim()
    const list = groups.get(firm) ?? []
    list.push(r)
    groups.set(firm, list)
  }
  return [...groups.entries()].map(([firm, list]) => {
    const one = list.length === 1
    return {
      firm: firm || null,
      says: firm
        ? `${firm} sent you a link for ${one ? 'this' : 'these'}. Answer ${one ? 'it' : 'each one'} at its link.`
        : (SECTIONS.find((s) => s.key === 'REQUEST')!.blurb),
      rows: list,
    }
  })
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
 * What an empty paperwork section says, once, and nothing else.
 */
export const EMPTY_PAPERWORK = 'Nothing is on your file yet, and no document is asked of you.'

/**
 * The line under the heading, describing the list below it.
 *
 * Null when there is no list: a promise of "everything on your file"
 * over an empty file is a third way of saying there is nothing there.
 */
export function paperworkIntro(rows: PaperRow[]): string | null {
  if (rows.length === 0) return null
  return 'Everything on your file, with the day each one runs out, and what is still being asked of you.'
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
    // The one sentence an empty section says. It used to be said twice —
    // here, and again in a box under it in slightly different words — so
    // a worker with nothing on file read the same news two ways.
    if (rows.length === 0) return EMPTY_PAPERWORK
    if (sent.length) {
      return `Nothing is being asked of you. ${sent.length === 1 ? 'One document is' : `${sent.length} documents are`} ` +
        'with them, waiting to be checked.'
    }
    return 'Nothing is being asked of you. Everything below is on file.'
  }
  const blocking = todo.filter((r) => r.stopsWork).length
  // A question is counted as a question: "2 documents are still needed"
  // over two questions asks her for papers nobody wants yet.
  const questions = todo.filter((r) => r.todo === 'answer').length
  const papers = todo.length - questions
  const n = questions === 0
    ? `${papers} ${papers === 1 ? 'document is' : 'documents are'} still needed from you`
    : papers === 0
      ? `${questions === 1 ? 'One question is' : `${questions} questions are`} waiting for your answer`
      : `${papers} ${papers === 1 ? 'document' : 'documents'} and ${questions} ${questions === 1 ? 'question' : 'questions'} are still needed from you`
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

// ── What stops the work, said once at the top of Your work ────────────
//
// The founder, 2026-10-19: "Money and the week before paperwork that does
// not stop the work. A worker's first screen opens on her week and her
// pay, not on two upload buttons." So the paperwork section moved below
// the week and the money, and a paper that DOES stop the work keeps one
// line at the top of the page, above File your hours, in a sentence:
// "Your professional license (Wisconsin Board of Nursing) runs out in 24
// days. Your work stops if it lapses."
//
// Two sources, because the paperwork payload deliberately carries
// `stopsWork` only on a row she owes ("a document already held stops
// nothing by being held"). A held paper that runs out soon is a
// different fact — its lapse would stop the work — so `/api/me/work`
// reads it from her file and from the lines she is live on, through the
// one door that says what a line requires (`lib/document-requirements`).
// Nothing here knows what a license or a check is: a nurse's state
// registration and a welder's ticket are the same row.

/** A check that came back. Anything still running holds nothing. */
export const ACCEPTED_ON_FILE = ['CLEAR', 'CONDITIONAL']

/** The window the paperwork rows already call "Runs out in N days". */
export const RUNNING_OUT_DAYS = 60

/** One paper on her file, as the route reads it. */
export interface HeldOnFile {
  id: string
  /** The type key; matched against what her lines require, never shown. */
  key: string
  /** What it is called, as she would say it. */
  label: string
  /** Who issued it — the state board, the screening company. Null where nobody recorded one. */
  issuer: string | null
  status: string
  /**
   * The day it starts to count: its valid-from, else the day it was
   * issued. A license or a certificate that begins next month does not
   * cover this week, so a paper is in force only from this day.
   */
  validFrom: Date | string | null
  expiresAt: Date | string | null
}

/** One item a line she is live on requires, after the line and any waiver have had their say. */
export interface RequiredOfHer {
  key: string
  required: boolean
  /** Whether a lapse stops the work, on this line. */
  blocks: boolean
  waived: boolean
  owedBy: string
}

/**
 * A stopping paper on her file that does not cover her for long, or at all:
 *
 *   RUNS_OUT  in force today and runs out within sixty days, with nothing
 *             on file that takes over the day after
 *   NOT_YET   on file, but not in force until a later day, and nothing
 *             else covers her today
 *   RAN_OUT   every copy on file has run out, and nothing newer is on file
 */
export type StopState = 'RUNS_OUT' | 'NOT_YET' | 'RAN_OUT'

/** A paper on her file whose lapse stops the work, and where it stands. */
export interface RunningOut {
  id: string
  /** The type key, so two readings of one paper are said once. */
  key?: string
  state: StopState
  name: string
  issuer: string | null
  /** Whole days left on RUNS_OUT, counted the way the paperwork row counts them. 0 is today. */
  daysLeft: number | null
  /** The day it runs out (RUNS_OUT) or ran out (RAN_OUT). */
  runsOutOn: string | null
  /** The day it starts to count, on NOT_YET. */
  startsOn: string | null
}

function sentenceCase(s: string): string {
  const t = s.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'A document'
}

const DAY_MS = 86_400_000

function dayOrNull(d: Date | string | null): Date | null {
  if (!d) return null
  const x = new Date(d)
  return Number.isNaN(x.getTime()) ? null : x
}

/**
 * Which stopping papers on her file do not cover her well, from their start
 * and their end together.
 *
 * Only a paper that came back counts (a check still running holds
 * nothing), and only one required of her as blocking that nobody waived:
 * a paper no line and no license gate requires stops nothing, so it is
 * not said to. Per type, in order:
 *
 *  - A copy in force today — started on or before today, not yet ended —
 *    covers her. If none of them has an end, nothing is said. If the
 *    latest end is within sixty days and no copy on file starts by the day
 *    after it, she reads when it runs out.
 *  - With no copy in force, a copy that starts later is "not in force
 *    until" its first day: it does not cover this week.
 *  - With neither, the newest copy ran out.
 */
export function papersRunningOut(input: {
  held: HeldOnFile[]
  required: RequiredOfHer[]
  on: Date
}): RunningOut[] {
  const stops = new Set(
    input.required
      .filter((r) => r.required && r.blocks && !r.waived && r.owedBy === 'WORKER')
      .map((r) => r.key)
  )
  const byKey = new Map<string, HeldOnFile[]>()
  for (const h of input.held) {
    if (!ACCEPTED_ON_FILE.includes(h.status) || !stops.has(h.key)) continue
    byKey.set(h.key, [...(byKey.get(h.key) ?? []), h])
  }

  const on = input.on.getTime()
  // The same count `heldWord` makes for the row, so the line at the top
  // and the row below it never say two different numbers.
  const daysTo = (d: Date) => Math.ceil((d.getTime() - on) / DAY_MS)
  const out: RunningOut[] = []

  for (const [key, copies] of byKey) {
    const dated = copies.map((h) => ({ h, from: dayOrNull(h.validFrom), to: dayOrNull(h.expiresAt) }))
    const base = (h: HeldOnFile) => ({ id: h.id, key, name: sentenceCase(h.label), issuer: (h.issuer ?? '').trim() || null })

    const inForce = dated.filter((c) => (!c.from || c.from.getTime() <= on) && (!c.to || daysTo(c.to) >= 0))
    if (inForce.length > 0) {
      if (inForce.some((c) => !c.to)) continue
      const last = inForce.reduce((a, b) => (b.to!.getTime() > a.to!.getTime() ? b : a))
      const daysLeft = daysTo(last.to!)
      if (daysLeft > RUNNING_OUT_DAYS) continue
      // A renewal already on file that starts by the day after this one
      // ends keeps her covered, and nothing needs saying.
      const takesOver = dated.some((c) =>
        c !== last && c.from && c.from.getTime() > on &&
        c.from.getTime() <= last.to!.getTime() + DAY_MS &&
        (!c.to || c.to.getTime() > last.to!.getTime())
      )
      if (takesOver) continue
      out.push({ ...base(last.h), state: 'RUNS_OUT', daysLeft, runsOutOn: last.to!.toISOString(), startsOn: null })
      continue
    }

    const later = dated
      .filter((c) => c.from && c.from.getTime() > on)
      .sort((a, b) => a.from!.getTime() - b.from!.getTime())[0]
    if (later) {
      out.push({ ...base(later.h), state: 'NOT_YET', daysLeft: null, runsOutOn: null, startsOn: later.from!.toISOString() })
      continue
    }

    const ended = dated
      .filter((c) => c.to)
      .sort((a, b) => b.to!.getTime() - a.to!.getTime())[0]
    if (ended) {
      out.push({ ...base(ended.h), state: 'RAN_OUT', daysLeft: null, runsOutOn: ended.to!.toISOString(), startsOn: null })
    }
  }

  const rank: Record<StopState, number> = { RAN_OUT: 0, NOT_YET: 1, RUNS_OUT: 2 }
  return out.sort((a, b) =>
    rank[a.state] - rank[b.state] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || a.name.localeCompare(b.name)
  )
}

/** "Professional license" reads "your professional license"; "I-9" and "NDA" keep their capitals. */
function inSentence(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name
}

/**
 * The lines at the top of Your work: every paper that stops her work,
 * one sentence each, in the order the paperwork section reads them.
 *
 * A paper that does not stop the work is not here. It waits in the
 * paperwork section, below the week and the money, where its own row
 * says "This will not stop you working."
 */
export function workStops(input: { rows: PaperRow[]; runningOut?: RunningOut[] }): string[] {
  const out: string[] = []
  for (const r of input.rows) {
    if (r.kind !== 'OWED' || !r.stopsWork || r.waived || r.awaiting) continue
    const name = inSentence(r.name)
    const notYet = /not in force until (.+)$/i.exec(r.word)
    if (r.runsOutOn) {
      out.push(`Your ${name} ran out on ${formatDay(r.runsOutOn)}. Your work stops until a new one is on file.`)
    } else if (notYet) {
      out.push(`Your ${name} is not in force until ${notYet[1]}. Your work stops until then.`)
    } else {
      out.push(`Your ${name} is not on file. Your work stops without it.`)
    }
  }
  // A paper she owes that the paperwork section already says is the same
  // paper as one read from her file: said once, in the paperwork's words.
  const said = new Set(
    input.rows
      .filter((r) => r.kind === 'OWED' && r.stopsWork && !r.waived && !r.awaiting)
      .map((r) => r.name.toLowerCase())
  )
  for (const p of input.runningOut ?? []) {
    if (said.has(p.name.toLowerCase())) continue
    const what = `Your ${inSentence(p.name)}${p.issuer ? ` (${p.issuer})` : ''}`
    if (p.state === 'NOT_YET' && p.startsOn) {
      out.push(`${what} is not in force until ${formatDay(p.startsOn)}. Your work stops until then.`)
    } else if (p.state === 'RAN_OUT' && p.runsOutOn) {
      out.push(`${what} ran out on ${formatDay(p.runsOutOn)}. Your work stops until a new one is on file.`)
    } else if (p.state === 'RUNS_OUT' && p.daysLeft != null) {
      const when = p.daysLeft === 0 ? 'runs out today' : `runs out in ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`
      out.push(`${what} ${when}. Your work stops if it lapses.`)
    }
  }
  return [...new Set(out)]
}

// ── A license, renewed ────────────────────────────────────────────────
//
// The rule table (lib/attestation, regulatory) puts a license on file only
// with the board that issued it, its number on that board's register, and
// the day printed on it that it runs out. "Licensed" is not something
// anybody can check; a number on a register is. So the worker who sends a
// renewal is asked those three things beside the file, sent as fields to
// the upload route, which refuses a renewal without them. Any license: a state nursing registration, a
// pharmacist's, an electrician's, a driver's. Nothing here is software.

/** Whether a row asks for a license, read off its type key or its name. */
export function isLicenseRow(row: Pick<PaperRow, 'documentTypeKey' | 'name'>): boolean {
  return /licen[cs]e/i.test(row.documentTypeKey ?? '') || /licen[cs]e/i.test(row.name)
}

export interface LicenseFields {
  number: string
  /** The state, board or body that issued it. */
  issuedBy: string
  /** "YYYY-MM-DD", the new day it runs out, as printed. */
  expiresOn: string
}

/**
 * The three facts as the upload route takes them, as fields. The route
 * (`licenseRenewal` in lib/document-request, regulatory) decides whether
 * they are enough and says so in its own sentence; this screen shows that
 * sentence rather than a second rule of its own.
 */
export function licenseFieldsFor(f: LicenseFields): { licenseNumber: string; issuer: string; expiresAt: string } {
  return { licenseNumber: f.number.trim(), issuer: f.issuedBy.trim(), expiresAt: f.expiresOn.trim() }
}
