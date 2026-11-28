/**
 * Matching content to a firing and its segment, and drafting the push by
 * rules (record 135). Pure.
 *
 * The content is one of three kinds, all read from the firm's own record:
 * a course, a team offer (a pod), and outcome proof (how many people
 * finished a course, shown only above the count floor). A firing says who
 * the push is for (`AIMS`); the saved segment of that role is the matched
 * segment. Where no content fits, or no saved segment fits, there is no
 * push, and the firing says so.
 */

import { OUTCOME_PROOF_FLOOR, type Detection, type TripwireKind } from './tripwire-rules'
import type { SegmentDefinition, SegmentRole } from './segment-rules'
import { bodyRefusal, subjectRefusal } from './batch-rules'
import { hotListWordsRefusal } from './offer-rules'

export const CONTENT_KINDS = ['COURSE', 'POD_OFFER', 'OUTCOME_PROOF'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]
export const CONTENT_LABELS: Record<ContentKind, string> = { COURSE: 'A course', POD_OFFER: 'A team offer', OUTCOME_PROOF: 'Outcome proof' }

/** Who each tripwire is for, and what is offered them, in the order tried. */
export const AIMS: Record<TripwireKind, readonly { role: SegmentRole; kinds: readonly ContentKind[] }[]> = {
  POD_CAPACITY_OPENED: [{ role: 'CLIENT', kinds: ['POD_OFFER'] }],
  ENGAGEMENT_ENDING: [{ role: 'CLIENT', kinds: ['POD_OFFER', 'OUTCOME_PROOF'] }],
  COHORT_COMPLETED: [{ role: 'CLIENT', kinds: ['OUTCOME_PROOF'] }, { role: 'CANDIDATE', kinds: ['COURSE'] }],
  JOB_UNFILLED: [{ role: 'CANDIDATE', kinds: ['COURSE'] }],
  BENCH_SKILL_MATCHES_DEMAND: [{ role: 'CLIENT', kinds: ['POD_OFFER', 'OUTCOME_PROOF'] }],
  REPEAT_VISITS: [], // decided by who came back: see `aimsFor`
  COMPLETION_SHARED: [{ role: 'CLIENT', kinds: ['OUTCOME_PROOF'] }],
  CLIENT_CONTRACT_ENDING: [{ role: 'CLIENT', kinds: ['POD_OFFER', 'OUTCOME_PROOF'] }],
}

/** Who a firing is for. A repeat visit is for the kind of person who came back, and about the page she came back to. */
export function aimsFor(d: Detection): readonly { role: SegmentRole; kinds: readonly ContentKind[] }[] {
  if (d.kind !== 'REPEAT_VISITS') return AIMS[d.kind]
  const kind: ContentKind = d.page?.pageKind === 'POD' ? 'POD_OFFER' : 'COURSE'
  return [{ role: d.visitor?.personId ? 'CANDIDATE' : 'CLIENT', kinds: [kind] }]
}

export interface SavedSegment { id: string; name: string; def: SegmentDefinition }

/** The saved segment a firing is pushed to: the oldest of the right role whose skills, where it names any, share one with the firing. Null where none fits. Pure. */
export function matchSegment(role: SegmentRole, skills: readonly string[], segments: readonly SavedSegment[]): SavedSegment | null {
  const want = new Set(skills.map((s) => s.toLowerCase()))
  const fits = segments.filter((s) => s.def.role === role && (s.def.skills.length === 0 || want.size === 0 || s.def.skills.some((k) => want.has(k))))
  return [...fits].sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
}

export interface CourseFact { id: string; title: string; description: string | null; trackKey: string | null; completions: number }
export interface PodFact { id: string; name: string; description: string | null; skills: readonly string[]; openSeats: number }
export interface ContentPool { courses: readonly CourseFact[]; pods: readonly PodFact[] }

export interface Content { kind: ContentKind; ref: string; title: string; facts: string[] }
export type ContentRead = { ok: true; content: Content } | { ok: false; says: string }

const overlap = (text: string, skills: readonly string[]) => skills.filter((s) => text.toLowerCase().includes(s.toLowerCase()))

/** The content of one kind that fits the skills a firing carries. Where it carries none, the first by name. Pure. */
export function pickContent(kind: ContentKind, skills: readonly string[], pool: ContentPool, pageRef?: string): ContentRead {
  if (kind === 'POD_OFFER') {
    const pods = pool.pods.filter((p) => (pageRef ? p.id === pageRef : true))
    const fit = skills.length ? pods.filter((p) => p.skills.some((s) => skills.includes(s.toLowerCase()))) : pods
    const pod = [...fit].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0]
    if (!pod) return { ok: false, says: skills.length ? 'No team of yours has those skills, so there is no team offer to send.' : 'You have no team to offer yet.' }
    return { ok: true, content: { kind, ref: pod.id, title: pod.name, facts: [pod.name, ...pod.skills, `${pod.openSeats}`] } }
  }
  const courses = pool.courses.filter((c) => (pageRef ? c.id === pageRef : true))
  const fit = skills.length ? courses.filter((c) => overlap(`${c.title} ${c.description ?? ''}`, skills).length > 0) : courses
  if (kind === 'COURSE') {
    const c = [...fit].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))[0]
    if (!c) return { ok: false, says: skills.length ? 'No course of yours covers those skills, so there is no course to offer.' : 'You have no course to offer yet.' }
    return { ok: true, content: { kind, ref: c.id, title: c.title, facts: [c.title] } }
  }
  // Outcome proof: a count of people who finished, and only where enough of them did to be a figure.
  const proved = fit.filter((c) => c.completions >= OUTCOME_PROOF_FLOOR).sort((a, b) => b.completions - a.completions || a.title.localeCompare(b.title))[0]
  if (!proved) {
    const most = Math.max(0, ...fit.map((c) => c.completions))
    return { ok: false, says: `Outcome proof needs at least ${OUTCOME_PROOF_FLOOR} people who finished one course. The most so far is ${most}, so no figure is shown.` }
  }
  return { ok: true, content: { kind, ref: proved.id, title: proved.title, facts: [proved.title, `${proved.completions}`] } }
}

export interface Draft { subject: string; body: string }

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The push drafted by rules, from the content's own facts: no price, no name of a person, no web address. Pure. */
export function draftByRules(firm: string, d: Detection, c: Content, proofCount?: number): Draft {
  switch (c.kind) {
    case 'COURSE':
      return {
        subject: clean(`A course from ${firm}: ${c.title}`),
        body: `${firm} runs ${c.title}.${d.skills.length ? ` It covers ${d.skills.slice(0, 4).join(', ')}.` : ''}\n\nIf it fits what you are working towards, the page below has the lessons and how to start.`,
      }
    case 'POD_OFFER':
      return {
        subject: clean(`A team from ${firm}: ${c.title}`),
        body: `${firm} has a team ready: ${c.title}.${d.skills.length ? ` It works in ${d.skills.slice(0, 4).join(', ')}.` : ''}\n\nIf you have work that needs a small team, the page below says what the team does and how it is set up.`,
      }
    case 'OUTCOME_PROOF':
      return {
        subject: clean(`${proofCount ?? ''} people finished ${c.title} with ${firm}`.trim()),
        body: `${proofCount} people finished ${c.title} with ${firm}. That is the count on our own record, nothing rounded.\n\nIf you hire for this kind of work, the page below shows what the course covers.`,
      }
  }
}

/** Whether words are fit to send, as a letter's own rules read them. A sentence where not. Pure. */
export function draftRefusal(dr: Draft): string | null {
  return subjectRefusal(dr.subject) ?? bodyRefusal(dr.body) ?? hotListWordsRefusal(`${dr.subject}\n${dr.body}`)
}

/** Capitalised words in the middle of a sentence that are not words the firm or the content gave: a name nobody supplied. Pure. */
function unknownNames(words: string, known: readonly string[]): string[] {
  const ok = new Set(known.join(' ').toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [])
  const out: string[] = []
  const re = /(^|[.!?]\s+|\n\s*)?\b([A-Z][a-z][a-z'’-]*)/g
  for (let m = re.exec(words); m; m = re.exec(words)) {
    if (m[1] !== undefined || m.index === 0) continue // the first word of a sentence is capitalised anyway
    if (!ok.has(m[2].toLowerCase())) out.push(m[2])
  }
  return out
}

/**
 * Whether a model's draft may be used: it passes the letter's own rules, every
 * number in it is one of the facts it was given, and it names nobody the firm
 * and the content did not give (`known`: the firm's name and the content's own
 * words). Anything else, the rules write the push.
 */
export function modelDraftOk(dr: Draft, facts: readonly string[], known: readonly string[] = []): boolean {
  if (draftRefusal(dr)) return false
  const nums = new Set(facts.join(' ').match(/\d+/g) ?? [])
  if (!(`${dr.subject} ${dr.body}`.match(/\d+/g) ?? []).every((n) => nums.has(n))) return false
  return unknownNames(`${dr.subject}\n${dr.body}`, [...facts, ...known]).length === 0
}

/** The page a letter's tracked link leads to, by content kind. Pure. */
export function pageOf(c: { kind: ContentKind; ref: string }, firmSlug: string, trackKey: string | null): { pageKind: 'COURSE' | 'POD'; pageRef: string; path: string } {
  if (c.kind === 'POD_OFFER') return { pageKind: 'POD', pageRef: c.ref, path: `/site/${firmSlug}` }
  return { pageKind: 'COURSE', pageRef: c.ref, path: trackKey ? `/learn/${firmSlug}/${trackKey}` : `/learn/${firmSlug}` }
}
