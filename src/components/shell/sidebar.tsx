'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { EtymeMark } from '@/components/logo'
/**
 * Sidebar navigation — from CLAUDE.md design system.
 *
 * Navigation per company type:
 *   Vendor     → Today → Sell → Talent → Operate → Grow
 *   Consultant → You → Grow
 *   GSI        → Deliver → Supply → Operate
 *   Client     → Program → Governance
 *
 * Phase 1 ships both Vendor and Client views.
 * href is typed as `string` because most pages are not yet built —
 * Next.js typedRoutes would reject them. Tighten when pages exist.
 */

type NavSection = {
  label: string
  items: NavItem[]
}

type NavItem = {
  label: string
  href: string
  icon: string  // emoji for now; SVG icons later
  badge?: number
  /**
   * Optional sub-heading inside a section. Operate had grown to 22 flat
   * links with nothing between them — a founder note ("too many
   * organized links") traced to exactly this section. This groups the
   * same links under three quiet sub-labels rather than inventing new
   * top-level sections, which would drift from the nav CLAUDE.md pins
   * per company type.
   */
  group?: string
}

type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

const VENDOR_NAV: NavSection[] = [
  {
    label: 'Today',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '◉' },
      { label: 'Notifications', href: '/dashboard/notifications', icon: '⦿' },
      { label: 'Conversations', href: '/dashboard/conversations', icon: '💬' },
      { label: 'Decisions', href: '/dashboard/decisions', icon: '⬡' },
    ],
  },
  {
    label: 'Sell',
    items: [
      { label: 'Leads', href: '/dashboard/leads', icon: '⌁' },
      { label: 'Invitations', href: '/dashboard/invitations', icon: '✉' },
      { label: 'Requirements', href: '/dashboard/requirements', icon: '◈' },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      // The supplier's side of the same rows: what they have been asked
      // to confirm, and for whom.
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      { label: 'Sell Contracts', href: '/dashboard/contracts?side=sell', icon: '▤' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠' },
    ],
  },
  {
    label: 'Talent',
    items: [
      { label: 'Bench', href: '/dashboard/bench', icon: '◎' },
      { label: 'Candidates', href: '/dashboard/consultants', icon: '◌' },
      { label: 'Keeping the bench honest', href: '/dashboard/texts', icon: '✆' },
      { label: 'Training', href: '/dashboard/training', icon: '◪' },
      { label: 'Buy Contracts', href: '/dashboard/contracts?side=buy', icon: '▥' },
    ],
  },
  {
    label: 'Operate',
    items: [
      // High in the list on purpose. It is a queue, not a report, and a
      // report is something somebody has to think to ask for.
      { label: 'Loose ends', href: '/dashboard/loose-ends', icon: '⛓' },
      { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦', group: 'Money' },
      { label: 'Invoices', href: '/dashboard/invoices', icon: '▧', group: 'Money' },
      // Next to Invoices deliberately: same money, different question.
      // One is what we sent, the other is what came back.
      { label: 'Money owed to us', href: '/dashboard/ar', icon: '◧', group: 'Money' },
      // The other half of the same question. One screen says who owes us,
      // this one says who is funding whom while everybody waits.
      { label: 'Who is financing whom', href: '/dashboard/ap', icon: '◨', group: 'Money' },
      { label: 'Purchase orders', href: '/dashboard/purchase-orders', icon: '▤', group: 'Money' },
      { label: 'Expenses', href: '/dashboard/expenses', icon: '◫', group: 'Money' },
      { label: 'Payroll', href: '/dashboard/payroll', icon: '▩', group: 'Money' },
      { label: 'Check the checker', href: '/dashboard/checks', icon: '⊙', group: 'Checks & compliance' },
      { label: 'Automation', href: '/dashboard/automation', icon: '⚙', group: 'Checks & compliance' },
      { label: 'Compliance', href: '/dashboard/compliance', icon: '◆', group: 'Checks & compliance' },
      { label: 'Documents asked for', href: '/dashboard/packets', icon: '◱', group: 'Checks & compliance' },
      // The two directions belong adjacent. A vendor spends as much time
      // being screened as screening, and only one of those had a screen.
      { label: 'Being screened', href: '/dashboard/outbound-pack', icon: '◲', group: 'Checks & compliance' },
      { label: 'Blacklist', href: '/dashboard/blacklist', icon: '⊘', group: 'Checks & compliance' },
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻', group: 'Checks & compliance' },
      { label: 'Companies', href: '/dashboard/companies', icon: '▣', group: 'Admin' },
      // The rolodex. A staffing business is a rolodex with invoicing
      // attached, and this is finally the rolodex.
      { label: 'Who we work with', href: '/dashboard/contacts', icon: '☎', group: 'Admin' },
      // Five onboardings, derived live from what exists.
      { label: 'Getting set up', href: '/dashboard/onboarding', icon: '☑', group: 'Admin' },
      // The journal out to their books, and the statement back against ours.
      { label: 'Your books, their books', href: '/dashboard/integrations', icon: '⇄', group: 'Admin' },
      { label: 'Who can do what', href: '/dashboard/access', icon: '⚿', group: 'Admin' },
      { label: 'Settings', href: '/dashboard/settings', icon: '⚙', group: 'Admin' },
      { label: 'Load a spreadsheet', href: '/dashboard/data', icon: '⤓', group: 'Admin' },
    ],
  },
  {
    label: 'Grow',
    items: [
      // Gated on margin.read — a Recruiter role deliberately cannot see
      // what a placement earns.
      { label: 'What we made', href: '/dashboard/profitability', icon: '◑' },
      { label: 'Reports', href: '/dashboard/reports', icon: '▨' },
      // A scorecard the supplier cannot see is a blacklist with better
      // manners. It decides who gets the next role, so it is not a
      // secret from the firm it is about.
      { label: 'How clients see you', href: '/dashboard/my-standing', icon: '◈' },
    ],
  },
]

// A consultant is a person, not a company. CLAUDE.md gives them
// "You → Grow" — their own work first, then what they could become.
//
// Grow is empty for now, on purpose. It used to point at "Training" —
// /dashboard/training — which is the vendor's own skill-gap analysis
// across a whole bench ("demand from open requirements vs supply from
// bench listings"), not a candidate's page. A consultant landing there
// saw every number at zero, because none of it was about them. A wrong
// link is worse than a missing section; this comes back once there is
// a real, candidate-scoped training screen to put here.
const CONSULTANT_NAV: NavSection[] = [
  {
    label: 'You',
    items: [
      { label: 'Your work', href: '/dashboard/my-work', icon: '◉' },
      // Not a separate "Your profile" link to /dashboard/consultants —
      // that is the vendor staff's bench-management screen, gated on
      // consultants.read, and a consultant hitting it saw a red
      // "You need consultants.read permission" where their own profile
      // should have been. /dashboard/my-page already IS the self-service
      // editor (headline, intro, skills) plus the public-page toggle;
      // having a second, broken link to a different page was the bug,
      // not a missing feature.
      { label: 'Your page', href: '/dashboard/my-page', icon: '◐' },
      { label: 'Who has you', href: '/dashboard/my-benches', icon: '◈' },
      { label: 'Notifications', href: '/dashboard/notifications', icon: '⦿' },
    ],
  },
]

const CLIENT_NAV: NavSection[] = [
  {
    label: 'Program',
    items: [
      { label: 'Dashboard', href: '/dashboard/program', icon: '◉' },
      { label: 'Requisitions', href: '/dashboard/requisitions', icon: '⊞' },
      { label: 'Open roles', href: '/dashboard/requirements', icon: '◈' },
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      // The one entry point for people, deliberately. This used to sit
      // next to a "Candidates" link to /dashboard/submissions — the raw,
      // one-row-per-submission feed — which is exactly what made the
      // same person look duplicated: four vendors submitting one human
      // rendered as four separate rows with four separate names. That
      // link is gone; every submission is still here, merged onto the
      // one person it belongs to and expandable per row.
      { label: 'People', href: '/dashboard/people', icon: '◍' },
      { label: 'Placements', href: '/dashboard/contracts', icon: '▤' },
      { label: 'Ending soon', href: '/dashboard/rolloff', icon: '⚠' },
      { label: 'Worked here before', href: '/dashboard/alumni', icon: '◎' },
      // The growth loop. A client arrives with twelve suppliers already
      // and an MSA with each; until those are reachable in here, none of
      // the rest of this nav has anything to work on.
      { label: 'Your suppliers', href: '/dashboard/suppliers', icon: '⬡' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'Org view', href: '/dashboard/program/org', icon: '⬢' },
      { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦' },
      { label: 'Invoices', href: '/dashboard/invoices', icon: '▧' },
      { label: 'Purchase orders', href: '/dashboard/purchase-orders', icon: '▤' },
      { label: 'Expenses', href: '/dashboard/expenses', icon: '◫' },
      { label: 'Compliance', href: '/dashboard/compliance', icon: '◆' },
      { label: 'Documents asked for', href: '/dashboard/packets', icon: '◱' },
      { label: 'Tenure', href: '/dashboard/tenure', icon: '▩' },
      // Only computable here. No supplier can work these out about
      // themselves — they cannot see what the other eleven did with the
      // same role — and no supplier's own numbers are ever bad.
      { label: 'Supplier scorecards', href: '/dashboard/scorecards', icon: '◈' },
      // Where a chain we can only see part of makes one person look like
      // two, and the tenure number quietly goes wrong.
      { label: 'Same person, twice?', href: '/dashboard/identity', icon: '⧉' },
      { label: 'Who can do what', href: '/dashboard/access', icon: '⚿' },
      { label: 'Settings', href: '/dashboard/settings', icon: '⚙' },
      { label: 'Load a spreadsheet', href: '/dashboard/data', icon: '⤓' },
    ],
  },
]

/**
 * MSP and GSI both sit on the supply side of a placement, so they take
 * the vendor nav until their own sections are specified (Phase 3/4).
 */
function getNavForKind(
  kind: CompanyKind | null | undefined,
  isConsultant: boolean
): NavSection[] {
  // A consultant is a context type, not an absent company. Somebody on a
  // vendor's bench HAS a company — that is what a bench is — and keying on
  // the company would show them their agency's payroll and buy contracts.
  if (isConsultant || !kind) return CONSULTANT_NAV
  switch (kind) {
    case 'CLIENT': return CLIENT_NAV
    case 'MSP':
    case 'GSI':
    // A company of one is a vendor with one person on the bench. It
    // sells, so it gets the seller's nav rather than a fifth shell
    // nobody asked for.
    case 'CONSULTANT_CORP':
    case 'VENDOR':
    default:       return VENDOR_NAV
  }
}

export function Sidebar({
  companyKind,
  companyName,
  companyLabel,
  isConsultant = false,
  pending = false,
}: {
  /** Absent for a consultant, who has no company. */
  companyKind?: CompanyKind | null
  companyName?: string
  companyLabel?: string
  /** True when this person is on a bench rather than of the company. */
  isConsultant?: boolean
  /** Session still loading — render the frame without nav items so the
   *  wrong company's navigation never flashes on screen. */
  pending?: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sections = pending ? [] : getNavForKind(companyKind, isConsultant)

  // For client view, the "dashboard" link is /dashboard/program
  const dashboardHref = isConsultant
    ? '/dashboard/my-work'
    : companyKind === 'CLIENT' ? '/dashboard/program' : '/dashboard'

  return (
    <aside className="w-[220px] flex-shrink-0 h-screen sticky top-0 flex flex-col
                      bg-etyme-surface border-r border-etyme-rule">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <EtymeMark size={28} />
        <span className="font-semibold text-sm tracking-[-0.02em] text-etyme-ink">
          etyme
        </span>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-1">
            <div className="eyebrow px-2 pt-5 pb-1.5">
              {section.label}
            </div>
            {section.items.map((item, i) => {
              // A sub-group header prints once, the moment its name first
              // differs from the item before it — not for every item that
              // carries it. This is what turns 22 flat links into three
              // named clusters without inventing a new top-level section.
              const priorGroup = i > 0 ? section.items[i - 1].group : undefined
              const showGroup = item.group !== undefined && item.group !== priorGroup

              // Handle hrefs with query params (e.g. /dashboard/contracts?side=sell)
              const [itemPath, itemQuery] = item.href.split('?')
              const active = item.href === dashboardHref
                ? pathname === dashboardHref
                : itemQuery
                  ? pathname.startsWith(itemPath) && searchParams.get(itemQuery.split('=')[0]) === itemQuery.split('=')[1]
                  : pathname.startsWith(item.href)
              return (
                <div key={item.label}>
                  {showGroup && (
                    <div className="px-2.5 pt-3 pb-1 text-[10px] font-medium uppercase
                                    tracking-[0.06em] text-etyme-faint">
                      {item.group}
                    </div>
                  )}
                  <Link
                    href={item.href as any}
                    className={`
                      flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px]
                      transition-colors
                      ${active
                        ? 'bg-etyme-canvas text-etyme-ink font-medium'
                        : 'text-etyme-muted hover:text-etyme-ink hover:bg-etyme-canvas/60'
                      }
                    `}
                  >
                    <span className="w-4 text-center text-[11px] opacity-60">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="ml-auto text-[10px] font-semibold text-etyme-attention
                                       bg-etyme-attention/10 px-1.5 py-0.5 rounded-full tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom — company info */}
      <div className="px-4 py-3 border-t border-etyme-rule">
        {pending ? (
          <>
            <div className="h-3 w-24 rounded bg-etyme-rule/60 animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-etyme-rule/40 animate-pulse mt-1.5" />
          </>
        ) : (
          <>
            <div className="text-[11px] font-medium text-etyme-ink truncate">
              {companyName ?? 'Cloudepa Inc.'}
            </div>
            <div className="text-[10px] text-etyme-faint">
              {companyLabel ?? (companyKind === 'CLIENT' ? 'Client · Enterprise' : 'Vendor · US IT')}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
