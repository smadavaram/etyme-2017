import { getNavForKind, type CompanyKind } from '@/lib/nav-table'

/**
 * Which filter chips Needs attention offers, and what it says on an empty
 * book. Pure: no database, no React.
 *
 * The one-person firm's page offered "Job requests", "Rolloff",
 * "Submissions", "To paper" and "To start" — five chips for work her
 * firm can never have — and on day one said only "Check back later"
 * (sign-up walk, round three, item 13). A chip is a door onto a kind of
 * work, so it is offered where the reader's own menu has the page that
 * work comes from, read off lib/nav-table, the same answer the sidebar
 * draws. A chip with something under it is always offered: an item is
 * never hidden behind a filter the reader cannot pick.
 */

export type DecisionType =
  | 'TIMESHEET_APPROVAL'
  | 'REQUISITION_APPROVAL'
  | 'EXPENSE_APPROVAL'
  | 'ROLLOFF_ACTION'
  | 'SUBMISSION_REVIEW'
  | 'CONTRACT_PAPERING'
  | 'CONTRACT_START'
  | 'INVOICE_OVERDUE'

export type TypeFilter = 'all' | DecisionType

export interface Chip {
  key: TypeFilter
  label: string
  count: number
}

/**
 * The pages each kind of work comes from. Papering and starting follow
 * an award, and an award is made on a submission, so a firm with no
 * Submissions page has nothing to paper or start.
 */
export const CHIP_PAGES: Readonly<Record<DecisionType, readonly string[]>> = {
  TIMESHEET_APPROVAL: ['/dashboard/timesheets'],
  REQUISITION_APPROVAL: ['/dashboard/requisitions', '/dashboard/requirements'],
  EXPENSE_APPROVAL: ['/dashboard/expenses'],
  ROLLOFF_ACTION: ['/dashboard/rolloff'],
  SUBMISSION_REVIEW: ['/dashboard/submissions'],
  CONTRACT_PAPERING: ['/dashboard/submissions'],
  CONTRACT_START: ['/dashboard/submissions'],
  INVOICE_OVERDUE: ['/dashboard/invoices', '/dashboard/ar'],
}

const LABELS: ReadonlyArray<[DecisionType, string]> = [
  ['TIMESHEET_APPROVAL', 'Timesheets'],
  ['REQUISITION_APPROVAL', 'Job requests'],
  ['EXPENSE_APPROVAL', 'Expenses'],
  ['ROLLOFF_ACTION', 'Rolloff'],
  ['SUBMISSION_REVIEW', 'Submissions'],
  ['CONTRACT_PAPERING', 'To paper'],
  ['CONTRACT_START', 'To start'],
  ['INVOICE_OVERDUE', 'Bills'],
]

export interface ChipReader {
  kind: CompanyKind | null | undefined
  isConsultant: boolean
  worker?: boolean
  permissions?: readonly string[] | null
  seatedAtClient?: string | null
}

/** Every href on the reader's own menu. */
export function menuHrefs(reader: ChipReader): Set<string> {
  return new Set(
    getNavForKind(reader.kind ?? null, reader.isConsultant, {
      worker: reader.worker,
      permissions: reader.permissions,
      seatedAtClient: reader.seatedAtClient,
    })
      .flatMap((s) => s.items)
      .map((i) => i.href.split('?')[0])
  )
}

/**
 * The chips to draw: "All", then each kind of work whose page is on the
 * reader's menu or which has something waiting.
 */
export function chipsFor(
  reader: ChipReader,
  counts: Readonly<Record<string, number>>,
  total: number
): Chip[] {
  const menu = menuHrefs(reader)
  const chips: Chip[] = [{ key: 'all', label: 'All', count: total }]
  for (const [key, label] of LABELS) {
    const count = counts[key] ?? 0
    if (count > 0 || CHIP_PAGES[key].some((h) => menu.has(h))) chips.push({ key, label, count })
  }
  return chips
}

/**
 * What an empty book says. A one-person firm is told the first step in
 * one sentence: the contract she already has is recorded under
 * Contracts, or the page fills when a firm puts her forward. Everybody
 * else keeps the line they had.
 */
export interface EmptyBook {
  lead: string
  says: string
  /** Where the first step is, where there is one. */
  href: string | null
  action: string | null
}

export const SOLO_FIRST_STEP =
  'If a client or a firm already gave you a contract, record it under Contracts; otherwise this fills when a firm puts you forward for a job.'

export function emptyBook(kind: CompanyKind | null | undefined, mayRecord: boolean): EmptyBook {
  if (kind === 'CONSULTANT_CORP') {
    return {
      lead: 'Nothing needs you yet.',
      says: SOLO_FIRST_STEP,
      href: mayRecord ? '/dashboard/contracts?new=1' : null,
      action: mayRecord ? 'Record your contract' : null,
    }
  }
  return {
    lead: 'All clear.',
    says: 'Nothing needs your attention right now. Check back later.',
    href: null,
    action: null,
  }
}
