/**
 * The proposals agent's rules (record 124, plugin 5). Pure: no database, no
 * network, no model.
 *
 * What the agent may do with a bid a person recorded: read the requirements
 * text she pasted, say which of the firm's four kinds of piece each one
 * needs, draft the words from the firm's own record, and flag every
 * requirement the record does not answer. What it never does: state a rate,
 * name a person, write a compliance statement as the firm's own, sign, or
 * send. A person approves, and a person says it was sent.
 */

import { PIECE_KINDS } from './rules'
import { jsonIn } from '@/lib/skills/inline-keys'

export const PROPOSAL_AGENT = 'proposals-agent'
export const PROPOSAL_RULE = 'proposals-agent-v1'
export const PROPOSAL_RECORD = 'Proposal'
/** The task that asks a person for the yes on a finished draft. It sends nothing. */
export const PROPOSAL_REVIEW_KIND = 'PROPOSAL_REVIEW'
/** The task that reminds a seat of a piece it owes. One yes releases the whole task. */
export const PROPOSAL_CHASE_KIND = 'PROPOSAL_CHASE'
export const PROPOSAL_CHASE_TEMPLATE = 'proposal-piece-reminder'
/** The prompt log's purpose for a proposal draft. */
export const PROPOSAL_DRAFT_PURPOSE = 'PROPOSAL_DRAFT'
/** The most proposals one run looks at for one firm, oldest first. */
export const MAX_PROPOSALS_A_RUN = 10

export type PieceKind = (typeof PIECE_KINDS)[number]

export const PIECE_LABEL: Record<PieceKind, string> = {
  BENCH: 'Key personnel',
  COMPLIANCE: 'Compliance papers',
  RATES: 'Rate card',
  PAST_PERFORMANCE: 'Past performance',
}

/** Who owes each kind of piece, in the order the roles are tried; the Owner is the last fallback. */
export const PIECE_ROLES: Record<PieceKind, readonly string[]> = {
  BENCH: ['Recruiter', 'Account Manager'],
  COMPLIANCE: ['HR', 'Compliance Officer'],
  RATES: ['Account Manager', 'Finance'],
  PAST_PERFORMANCE: ['Account Manager'],
}

// ── Reading the pasted requirements ─────────────────────────────────

const CUE = /\b(shall|must|required?|provide|submit|include|demonstrate|describe|certif\w*|insurance|experience|references?|rates?|pric\w+|resumes?|personnel)\b/i
const BULLET = /^\s*(?:[-*•–]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+/i

/** The requirement lines in a pasted text: bullets, numbered lines, and sentences that say shall, must or provide. At most 60, each at most 300 characters. */
export function requirementLines(text: string | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const bulleted = BULLET.test(raw)
    const line = raw.replace(BULLET, '').replace(/\s+/g, ' ').trim()
    if (line.length < 12 || (!bulleted && !CUE.test(line))) continue
    const clipped = line.length > 300 ? `${line.slice(0, 297)}...` : line
    const key = clipped.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clipped)
    if (out.length >= 60) break
  }
  return out
}

/** Which kind of piece a requirement needs from the firm's record, or null where it is an answer only a person can write. */
export function pieceKindOf(line: string): PieceKind | null {
  if (/\b(rates?|pricing|prices?|cost proposal|hourly|fee schedule|labor categor\w+)\b/i.test(line)) return 'RATES'
  if (/\b(insurance|certif\w*|licen[cs]e\w*|registration|W-?9|good standing|bonds?|bonding|e-?verify|background check|drug|affidavit|attestation|debarment|conflict of interest|equal opportunity|small business|minority)\b/i.test(line)) return 'COMPLIANCE'
  if (/\b(past performance|references?|prior (work|experience|contracts?)|similar (work|projects?|contracts?)|experience)\b/i.test(line)) return 'PAST_PERFORMANCE'
  if (/\b(key personnel|staff(ing)?|resumes?|personnel|candidates?|bench|team members?|workforce|clearances?)\b/i.test(line)) return 'BENCH'
  return null
}

// ── The checker: which requirements the record does not answer ──────

export interface PieceFact { kind: string; label: string; haveIt: boolean; source?: string | null }
export type RequirementStatus = 'IN_HAND' | 'MISSING_PIECE' | 'A_PERSON_WRITES'
export interface RequirementRow { text: string; kind: PieceKind | null; status: RequirementStatus; says: string }

export interface ProposalCheck {
  /** Set-aside bids (record 132): the sentence that says the firm does not hold the certification the bid is set aside for, or null. Where it is set the proposal is never put up as ready. */
  ineligible: string | null
  rows: RequirementRow[]
  /** Requirements that need a piece the record does not hold yet. */
  missing: RequirementRow[]
  /** Requirements no piece answers: a person writes them. They never block an approval, and they are never hidden. */
  toWrite: RequirementRow[]
  /** Pieces on the proposal that are not in hand: the number the approval route refuses on. */
  missingPieces: number
  /** Said first when there is nothing to check. */
  nothingToCheck: string | null
}

/** Flag every requirement the record does not answer. Pure; the same answer the agent saves its state from and the screen draws. */
export function checkProposal(lines: readonly string[], pieces: readonly PieceFact[], eligibility?: { eligible: boolean; says: string | null }): ProposalCheck {
  const rows: RequirementRow[] = lines.map((text) => {
    const kind = pieceKindOf(text)
    if (!kind) return { text, kind, status: 'A_PERSON_WRITES' as const, says: 'No piece answers this. A person writes it.' }
    const of = pieces.filter((p) => p.kind === kind)
    if (of.length > 0 && of.every((p) => p.haveIt)) return { text, kind, status: 'IN_HAND' as const, says: `In hand: ${of.map((p) => p.source?.trim() || p.label).join('; ')}.` }
    return { text, kind, status: 'MISSING_PIECE' as const, says: `Needs ${PIECE_LABEL[kind].toLowerCase()}: not in the record yet.` }
  })
  const missingPieces = pieces.filter((p) => !p.haveIt).length
  return {
    ineligible: eligibility && !eligibility.eligible ? eligibility.says : null,
    rows,
    missing: rows.filter((r) => r.status === 'MISSING_PIECE'),
    toWrite: rows.filter((r) => r.status === 'A_PERSON_WRITES'),
    missingPieces,
    nothingToCheck: lines.length === 0 && pieces.length === 0 ? 'No requirements were pasted and no pieces are named, so there is nothing to check yet.' : null,
  }
}

/** The state the agent moves a proposal to after a check. Never approved, never sent. */
export function stateAfterCheck(c: ProposalCheck): 'DRAFT' | 'NEEDS_PIECES' | 'READY_FOR_PERSON' {
  // A bid set aside for a certification the firm does not hold is never put up as eligible (record 132).
  if (c.ineligible) return 'NEEDS_PIECES'
  if (c.nothingToCheck) return 'DRAFT'
  return c.missingPieces > 0 ? 'NEEDS_PIECES' : 'READY_FOR_PERSON'
}

/** The kinds the requirements name that the proposal holds no piece for: the agent adds each as a missing piece. */
export function piecesToAdd(lines: readonly string[], pieces: readonly { kind: string }[]): PieceKind[] {
  const have = new Set(pieces.map((p) => p.kind))
  const out: PieceKind[] = []
  for (const l of lines) {
    const k = pieceKindOf(l)
    if (k && !have.has(k) && !out.includes(k)) out.push(k)
  }
  return out
}

// ── What the record says about the firm ─────────────────────────────

export interface ProposalFacts {
  firm: string
  /** Most common first. Skills of people who agreed to be listed on the firm's bench. */
  skills: string[]
  /** People who agreed to be listed. A count, never a name. */
  people: number
  /** The firm's own sell lines. A count. */
  engagements: number
  /** Distinct clients across them. A count, never a name. */
  clients: number
  /** The legal entity the bid is made in: Company.legalName, entered by the Owner. Null or absent where nobody entered it. No name is written in code. */
  legalName?: string | null
  /** Certifications held today (record 132): the one reader's `claimableNames`. Absent reads as none. Only these may ever be claimed. */
  held?: readonly string[]
}

/** What the record holds for a kind of piece: the words to keep as its source, or null where it holds nothing. Rates and compliance papers are never read from the record: a person says where they are. */
export function sourceFromRecord(kind: string, f: ProposalFacts): string | null {
  if (kind === 'BENCH' && f.people > 0) return `${f.people} ${f.people === 1 ? 'person' : 'people'} on the bench agreed to be listed (counted from the record)`
  if (kind === 'PAST_PERFORMANCE' && f.engagements > 0) return `${f.engagements} ${f.engagements === 1 ? 'engagement' : 'engagements'} on the record`
  return null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The two paragraphs a model may write, as the rules write them from the same facts. */
export function paragraphsFromRules(f: ProposalFacts): { capability: string; pastWork: string } {
  const top = f.skills.slice(0, 5)
  const capability = top.length > 0
    ? `${f.firm} supplies contract staff in ${top.join(', ')}.`
    : 'The record holds no skills yet, so a person writes this section.'
  const pastWork = f.engagements > 0
    ? `${f.firm} has ${plural(f.engagements, 'engagement', 'engagements')} on its record${f.clients > 0 ? ` with ${plural(f.clients, 'client', 'clients')}` : ''}. A person adds the references.`
    : 'No engagements are on the firm’s record yet, so a person writes this section.'
  return { capability, pastWork }
}

export interface DraftInput {
  title: string
  buyer: string | null
  dueAt: Date | null
  facts: ProposalFacts
  capability: string
  pastWork: string
  check: ProposalCheck
  /** Set-aside bids: the sentence that says the firm is not eligible yet, put in the draft so a person reads it first. */
  setAside?: string | null
}

/**
 * The whole draft, as plain words. The model never writes the requirement lines, the rates or the people: the rules do.
 * The requirement lines carry no status: a status goes stale the day a piece arrives, so the screen and the card read it live from `checkProposal`.
 */
export function composeDraft(i: DraftInput): string {
  const due = i.dueAt ? `, due ${i.dueAt.toISOString().slice(0, 10)}` : ''
  const people = i.facts.people > 0
    ? `${plural(i.facts.people, 'person', 'people')} on the firm’s bench agreed to be listed. No names appear here: a person asks each one before a name goes into this bid.`
    : 'Nobody on the firm’s bench has agreed to be listed, so a person writes this section.'
  const reqs = i.check.rows.length === 0
    ? ['No requirements were pasted. A person adds them.']
    : i.check.rows.map((r) => `- ${r.text}`)
  return [
    `# ${i.title}`,
    `Prepared for ${i.buyer ?? 'the agency'}${due}. A draft for a person to read and edit. Nothing here has been sent.`,
    '',
    '## Who we are',
    i.capability,
    '',
    '## Past performance',
    i.pastWork,
    '',
    '## Key personnel',
    people,
    '',
    '## Pricing',
    'The draft states no rate. A person adds the firm’s rates.',
    '',
    ...certificationSection(i.facts, i.setAside ?? null),
    REQUIREMENTS_HEADING,
    ...reqs,
  ].join('\n')
}

/**
 * The bidding entity and the certifications the record holds today (record 132).
 * Only a certification held today, with its certificate on file and in date, is named.
 * Nothing about ownership is said here: that is the Owner's attestation, and a person adds it.
 */
export function certificationSection(f: ProposalFacts, setAside: string | null): string[] {
  const held = f.held ?? []
  return [
    '## Bidding entity',
    f.legalName?.trim() ? `Entity: ${f.legalName.trim()}` : 'The legal entity name is not set. The Owner enters it on the Certifications panel, and a person adds it here.',
    '',
    '## Certifications',
    held.length > 0 ? `Held today: ${held.join(', ')}` : 'No certification is held on the record, so this draft claims none.',
    ...(setAside ? [setAside] : []),
    '',
  ]
}

/** The certifications this draft claims, as named on its "Held today:" line. */
export function claimedCertifications(draft: string): string[] {
  const m = draft.match(/^Held today: (.+)$/m)
  return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : []
}

/** What a draft claims that the record does not hold today: one sentence each. Empty means it claims nothing it may not. Pure. */
export function certificationClaimProblems(draft: string, heldNow: readonly string[]): string[] {
  return claimedCertifications(draft).filter((c) => !heldNow.includes(c)).map((c) => `The draft claims ${c}, which the record does not hold today.`)
}

export const REQUIREMENTS_HEADING = '## Requirements the buyer set'

/** The two paragraphs a model may have written: what stands between "Who we are" and "Key personnel". The title and the buyer's own requirement lines are never part of them. */
export function paragraphsOf(draft: string): { capability: string; pastWork: string } | null {
  const a = draft.indexOf('## Who we are\n'), b = draft.indexOf('\n\n## Past performance\n'), c = draft.indexOf('\n\n## Key personnel')
  if (a < 0 || b < a || c < b) return null
  return { capability: draft.slice(a + '## Who we are\n'.length, b), pastWork: draft.slice(b + '\n\n## Past performance\n'.length, c) }
}

// ── What a model's paragraphs must pass before they are used ────────

const CURRENCY = /[$€£₹]\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|dollars?)\b/i
/** A statement the firm would be making to a public buyer about itself. Compliance copy is a person's, never an agent's. */
const COMPLIANCE_CLAIM = /\b(certified|certification|licensed|insured|insurance|bonded|compliant|compliance|SOC ?2|ISO ?\d+|FedRAMP|registered|debarred|small business|minority|woman-owned|veteran-owned|8\(a\)|HUBZone)\b/i

/** Names a \b cannot see, because they end in a bracket, plus the diversity words (record 132). */
const DIVERSITY_CLAIM = /(?<![\w])(?:MBE|WBE|8\s?\(a\)|HUB\s?zone)(?![\w])|\b(?:minority|women|woman|veteran)[- ]owned\b|\bdiversity[- ]certified\b/i

const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''))

/** The reasons a model's paragraphs may not be used, one sentence each. Empty means they may. Pure. */
export function draftProblems(paragraphs: { capability: string; pastWork: string }, facts: ProposalFacts): string[] {
  const text = `${paragraphs.capability}\n${paragraphs.pastWork}`
  const problems: string[] = []
  if (!paragraphs.capability.trim() || !paragraphs.pastWork.trim()) problems.push('A paragraph came back empty.')
  if (CURRENCY.test(text)) problems.push('It states an amount of money, and a draft never states a rate or a price.')
  if (COMPLIANCE_CLAIM.test(text) || DIVERSITY_CLAIM.test(text)) problems.push('It makes a compliance statement as the firm’s own, which only a person writes.')
  const allowed = new Set([String(facts.people), String(facts.engagements), String(facts.clients), ...numbersIn(`${facts.firm} ${facts.skills.join(' ')}`)])
  const stray = numbersIn(text).filter((n) => !allowed.has(n))
  if (stray.length > 0) problems.push(`It uses a number the record does not hold: ${[...new Set(stray)].join(', ')}.`)
  return problems
}

/**
 * What the agent does with a model's answer: the two paragraphs where they
 * pass every rule above, else the rules' own, with the sentence that says why.
 * `text` is null where the model gave nothing. Pure; the agent and its evals read this one door.
 */
export function acceptAnswer(text: string | null, facts: ProposalFacts): { paragraphs: { capability: string; pastWork: string }; by: 'MODEL' | 'RULES'; problems: string[] } {
  const fallback = paragraphsFromRules(facts)
  if (text === null) return { paragraphs: fallback, by: 'RULES', problems: [] }
  const j = jsonIn(text) as { capability?: unknown; pastWork?: unknown } | null
  const wrote = { capability: typeof j?.capability === 'string' ? j.capability.trim() : '', pastWork: typeof j?.pastWork === 'string' ? j.pastWork.trim() : '' }
  const problems = j ? draftProblems(wrote, facts) : ['The answer could not be read as two paragraphs.']
  return problems.length === 0 ? { paragraphs: wrote, by: 'MODEL', problems } : { paragraphs: fallback, by: 'RULES', problems }
}

export const DRAFT_SYSTEM = [
  'You write two short paragraphs for a public-sector proposal, for a person to read and edit.',
  'Use only the facts given. Do not state any rate, price or amount of money. Do not name any person.',
  'Do not say the firm is certified, licensed, insured, registered or compliant: a person writes those statements.',
  'Each paragraph is at most 60 words, in plain English, in sentences of about fifteen words.',
  'Answer with JSON only: {"capability": "...", "pastWork": "..."}.',
].join('\n')

export function draftPrompt(f: ProposalFacts, title: string, buyer: string | null): string {
  return [
    `Proposal: ${title}${buyer ? ` for ${buyer}` : ''}`,
    `Firm: ${f.firm}`,
    `Skills of people on its bench who agreed to be listed: ${f.skills.length ? f.skills.slice(0, 10).join(', ') : 'none on the record'}`,
    `People who agreed to be listed: ${f.people}`,
    `Engagements on the firm's record: ${f.engagements}, with ${f.clients} clients`,
  ].join('\n')
}

// ── The reminder a seat reads ───────────────────────────────────────

export function reminderLetter(i: { firm: string; seatName: string; title: string; dueAt: Date | null; pieces: readonly string[]; link: string }): { subject: string; text: string } {
  const due = i.dueAt ? ` The proposal is due ${i.dueAt.toISOString().slice(0, 10)}.` : ''
  return {
    subject: `Waiting on you: ${i.pieces.length === 1 ? 'a piece' : 'pieces'} for the proposal ${i.title}`,
    text: [
      `Hello ${i.seatName},`,
      '',
      `${i.firm} is putting together a proposal for ${i.title}, and ${i.pieces.length === 1 ? 'one piece is' : 'some pieces are'} waiting on you:`,
      ...i.pieces.map((p) => `- ${p}`),
      due.trim(),
      '',
      `Open the proposal, say where each piece is, and it moves on: ${i.link}`,
      '',
      'This reminder was drafted by the proposals agent and sent after a person at your firm said yes to it. Nothing has been sent to the agency.',
    ].filter((l, k, a) => !(l === '' && a[k - 1] === '')).join('\n'),
  }
}

/** The question on the card that asks for the yes. Twelve words at most. */
export function reviewQuestion(title: string): string {
  const t = title.trim().split(/\s+/).slice(0, 7).join(' ')
  return `Approve the proposal for ${t}?`
}

/** The proof under that card. Pure. */
export function reviewProof(i: { draft: string; check: ProposalCheck }): string {
  const open = i.check.toWrite.length
  return [
    open > 0 ? `${open} ${open === 1 ? 'requirement needs' : 'requirements need'} an answer only a person can write. They are listed in the draft.` : 'Every requirement is answered from the record.',
    'Saying yes approves the draft. Nothing goes to the agency: after you approve, you send it yourself and mark it sent.',
    '',
    i.draft,
  ].join('\n')
}
