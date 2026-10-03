/**
 * Changing a requirement after it is out.
 *
 * A published requirement was locked: "cannot be edited underneath the
 * suppliers". Right instinct, wrong size. A client does change the
 * description after release — a line about the team, a skill that was
 * missing — and locking it forced a cancel-and-re-raise, which lost the
 * thread and every submission on it.
 *
 * The founder's rule: words change freely, with every supplier who
 * received it told what changed; money goes back through approval.
 *
 *   WORDS   title, description, skills, location, needed by,
 *           justification, the panel — say it, tell the suppliers
 *   MONEY   rate band, months, headcount, budget, hours a week — the
 *           checks run again; if anything routes, it waits on the desk
 *           that owns it, and the suppliers are told it is paused
 *
 * Nothing changes on a requirement that is filled, cancelled or put
 * away. Pure, so it reads as tests.
 */

export type WordField =
  | 'title' | 'description' | 'skills' | 'location' | 'neededBy' | 'justification' | 'interviewers'
export type MoneyField = 'billMin' | 'billMax' | 'months' | 'headcount' | 'budgetCents' | 'hoursPerWeek'
export type Field = WordField | MoneyField

export const WORDS: readonly WordField[] = ['title', 'description', 'skills', 'location', 'neededBy', 'justification', 'interviewers']
export const MONEY: readonly MoneyField[] = ['billMin', 'billMax', 'months', 'headcount', 'budgetCents', 'hoursPerWeek']

export interface Change {
  field: Field
  from: unknown
  to: unknown
}

/** The fields that actually differ, in the order given. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
  const out: Change[] = []
  for (const field of [...WORDS, ...MONEY] as Field[]) {
    if (!(field in after)) continue
    const from = before[field] ?? null
    const to = after[field] ?? null
    if (JSON.stringify(from) === JSON.stringify(to)) continue
    out.push({ field, from, to })
  }
  return out
}

export function classify(changes: Change[]): { words: Change[]; money: Change[] } {
  return {
    words: changes.filter((c) => (WORDS as readonly string[]).includes(c.field)),
    money: changes.filter((c) => (MONEY as readonly string[]).includes(c.field)),
  }
}

export interface RowState {
  status: string
  approvalState: string
  archivedAt?: Date | string | null
}

export interface Verdict {
  allowed: boolean
  /** The money moved on a published requirement: run the checks again. */
  reapprove: boolean
  /** Suppliers who received it are told. Only once it is out. */
  tellSuppliers: boolean
  reason: string
}

/**
 * Whether these changes may be made to this requirement, and what follows.
 */
export function mayChange(row: RowState, changes: Change[]): Verdict {
  const { words, money } = classify(changes)
  if (row.archivedAt || row.status === 'FILLED') {
    return { allowed: false, reapprove: false, tellSuppliers: false, reason: 'This one is filled and put away. Raise a new requirement.' }
  }
  if (row.status === 'CANCELLED') {
    return { allowed: false, reapprove: false, tellSuppliers: false, reason: 'This one was cancelled. Raise a new requirement.' }
  }
  if (changes.length === 0) {
    return { allowed: false, reapprove: false, tellSuppliers: false, reason: 'Nothing changed.' }
  }
  // Not out yet: change anything, tell nobody. A draft, or one an
  // approver handed back, or one still waiting on a desk.
  if (row.status !== 'OPEN' || row.approvalState === 'PENDING_APPROVAL' || row.approvalState === 'CHANGES_REQUESTED') {
    return { allowed: true, reapprove: false, tellSuppliers: false, reason: 'Changed before it went out.' }
  }
  // Published.
  if (money.length > 0) {
    return {
      allowed: true, reapprove: true, tellSuppliers: true,
      reason: `${said(money)} — the money moved, so it goes back through approval. Suppliers are told it is paused.`,
    }
  }
  return { allowed: true, reapprove: false, tellSuppliers: true, reason: `${said(words)} — suppliers are told.` }
}

const LABEL: Record<Field, string> = {
  title: 'the title', description: 'the description', skills: 'the skills', location: 'the location',
  neededBy: 'the date needed', justification: 'the justification', interviewers: 'the panel',
  billMin: 'the rate band', billMax: 'the rate band', months: 'the duration', headcount: 'the headcount',
  budgetCents: 'the budget', hoursPerWeek: 'the hours a week',
}

/** "Changed the description and the skills" — one sentence, no field names. */
export function said(changes: Change[]): string {
  const labels = Array.from(new Set(changes.map((c) => LABEL[c.field])))
  if (labels.length === 0) return 'Nothing changed'
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  return `Changed ${list}`
}

/**
 * The notice a supplier reads. Who, what, and whether to keep working it.
 */
export function noticeForSuppliers(input: { who: string; title: string; changes: Change[]; paused: boolean }): { title: string; body: string } {
  const { words, money } = classify(input.changes)
  const what = said([...words, ...money]).replace(/^Changed /, '')
  return {
    title: input.paused ? `${input.title} is paused while the money is re-approved` : `${input.title} has changed`,
    body: input.paused
      ? `${input.who} changed ${what}. Hold submissions until it is approved again — you will be told.`
      : `${input.who} changed ${what}. Submissions already in stand; check new ones against it.`,
  }
}
