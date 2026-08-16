import type { CompanyKind } from '@/components/session-provider'

/**
 * Page framing per company type.
 *
 * CLAUDE.md, design system:
 *   "Eyebrow labels are company-type-specific... A client company would
 *    see the same data under different section labels. The eyebrow, nav
 *    section, and page subtitle must adapt to the viewer's company type —
 *    the underlying data and pages are shared, the framing is not."
 *
 * The pages themselves are shared: the same contracts table serves a
 * vendor tracking what they bill and a client reviewing who is on site.
 * Only the words change. A client reading "What you bill clients" on
 * their own placements list is being shown someone else's business.
 */

export interface PageFraming {
  eyebrow: string
  title: string
  subtitle: string
}

/** Every page whose framing differs between a supplier and a buyer. */
export type PageKey =
  | 'contracts.sell'
  | 'contracts.buy'
  | 'requirements'
  | 'submissions'
  | 'rolloff'
  | 'timesheets'
  | 'invoices'
  | 'expenses'
  | 'consultants'

const VENDOR: Record<PageKey, PageFraming> = {
  'contracts.sell': {
    eyebrow: 'Sell',
    title: 'Sell Contracts',
    subtitle: 'What you bill clients. Revenue side — track active engagements, pending verifications, and upcoming rolloffs.',
  },
  'contracts.buy': {
    eyebrow: 'Procure',
    title: 'Buy Contracts',
    subtitle: 'What you pay for talent. Cost side — bench payments, internal contracts, and vendor agreements.',
  },
  requirements: {
    eyebrow: 'Sell',
    title: 'Requirements',
    subtitle: 'Open demand. Match consultants, distribute to your network, and track submissions.',
  },
  submissions: {
    eyebrow: 'Sell',
    title: 'Submissions',
    subtitle: 'Consultants you have put forward. Track them from submitted through to placement.',
  },
  rolloff: {
    eyebrow: 'Sell',
    title: 'Rolloff',
    subtitle: 'Contracts approaching their end date. Claim one to own the offboarding and redeployment.',
  },
  timesheets: {
    eyebrow: 'Operate',
    title: 'Timesheets',
    subtitle: 'Billable hours against sell contracts. Submit, review, and approve — with anomaly detection for flagged entries.',
  },
  invoices: {
    eyebrow: 'Operate',
    title: 'Invoices',
    subtitle: 'What you have billed and what is outstanding. Track ageing and record payments.',
  },
  expenses: {
    eyebrow: 'Operate',
    title: 'Expenses',
    subtitle: 'Travel, equipment, and training. Client-billable items flow through to invoices.',
  },
  consultants: {
    eyebrow: 'Talent',
    title: 'Candidates',
    subtitle: 'Your talent pool. Skills, availability, work authorisation, and bench tier.',
  },
}

const CLIENT: Record<PageKey, PageFraming> = {
  'contracts.sell': {
    eyebrow: 'Program',
    title: 'Placements',
    subtitle: 'Everyone working at your sites, across every vendor. Rates, end dates, and where they sit.',
  },
  'contracts.buy': {
    eyebrow: 'Program',
    title: 'Placements',
    subtitle: 'Everyone working at your sites, across every vendor.',
  },
  requirements: {
    eyebrow: 'Program',
    title: 'Open roles',
    subtitle: 'Roles you have opened to your vendors. Track how many candidates each has drawn.',
  },
  submissions: {
    eyebrow: 'Program',
    title: 'Candidates',
    subtitle: 'People your vendors have put forward. Shortlist, interview, and place.',
  },
  rolloff: {
    eyebrow: 'Program',
    title: 'Ending soon',
    subtitle: 'Contractors whose assignments end shortly. Decide to extend, backfill, or release.',
  },
  timesheets: {
    eyebrow: 'Governance',
    title: 'Timesheets',
    subtitle: 'Hours worked at your sites, awaiting your approval. Flagged entries are shown first.',
  },
  invoices: {
    eyebrow: 'Governance',
    title: 'Invoices',
    subtitle: 'What your vendors have billed you, and what is outstanding.',
  },
  expenses: {
    eyebrow: 'Governance',
    title: 'Expenses',
    subtitle: 'Billable expenses raised against work at your sites, awaiting your approval.',
  },
  consultants: {
    eyebrow: 'Program',
    title: 'Contractors',
    subtitle: 'People working at your sites. Skills, work authorisation, and tenure.',
  },
}

/**
 * MSP and GSI sit on the supply side of a placement, so they read the
 * vendor framing until their own wording is specified (Phase 3/4).
 */
export function pageFraming(kind: CompanyKind, page: PageKey): PageFraming {
  return kind === 'CLIENT' ? CLIENT[page] : VENDOR[page]
}
