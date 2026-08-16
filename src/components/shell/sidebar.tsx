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
}

type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI'

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
      { label: 'Invitations', href: '/dashboard/invitations', icon: '✉' },
      { label: 'Requirements', href: '/dashboard/requirements', icon: '◈' },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Sell Contracts', href: '/dashboard/contracts?side=sell', icon: '▤' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠' },
    ],
  },
  {
    label: 'Talent',
    items: [
      { label: 'Bench', href: '/dashboard/bench', icon: '◎' },
      { label: 'Candidates', href: '/dashboard/consultants', icon: '◌' },
      { label: 'Training', href: '/dashboard/training', icon: '◪' },
      { label: 'Buy Contracts', href: '/dashboard/contracts?side=buy', icon: '▥' },
    ],
  },
  {
    label: 'Operate',
    items: [
      { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦' },
      { label: 'Invoices', href: '/dashboard/invoices', icon: '▧' },
      { label: 'Expenses', href: '/dashboard/expenses', icon: '◫' },
      { label: 'Payroll', href: '/dashboard/payroll', icon: '▩' },
      { label: 'Automation', href: '/dashboard/automation', icon: '⚙' },
      { label: 'Compliance', href: '/dashboard/compliance', icon: '◆' },
      { label: 'Blacklist', href: '/dashboard/blacklist', icon: '⊘' },
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻' },
      { label: 'Companies', href: '/dashboard/companies', icon: '▣' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { label: 'Reports', href: '/dashboard/reports', icon: '▨' },
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
      { label: 'Candidates', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Placements', href: '/dashboard/contracts', icon: '▤' },
      { label: 'Ending soon', href: '/dashboard/rolloff', icon: '⚠' },
      { label: 'Worked here before', href: '/dashboard/alumni', icon: '◎' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'Org view', href: '/dashboard/program/org', icon: '⬢' },
      { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦' },
      { label: 'Invoices', href: '/dashboard/invoices', icon: '▧' },
      { label: 'Expenses', href: '/dashboard/expenses', icon: '◫' },
      { label: 'Compliance', href: '/dashboard/compliance', icon: '◆' },
      { label: 'Tenure', href: '/dashboard/tenure', icon: '▩' },
    ],
  },
]

/**
 * MSP and GSI both sit on the supply side of a placement, so they take
 * the vendor nav until their own sections are specified (Phase 3/4).
 */
function getNavForKind(kind: CompanyKind): NavSection[] {
  switch (kind) {
    case 'CLIENT': return CLIENT_NAV
    case 'MSP':
    case 'GSI':
    case 'VENDOR':
    default:       return VENDOR_NAV
  }
}

export function Sidebar({
  companyKind = 'VENDOR',
  companyName,
  companyLabel,
  pending = false,
}: {
  companyKind?: CompanyKind
  companyName?: string
  companyLabel?: string
  /** Session still loading — render the frame without nav items so the
   *  wrong company's navigation never flashes on screen. */
  pending?: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sections = pending ? [] : getNavForKind(companyKind)

  // For client view, the "dashboard" link is /dashboard/program
  const dashboardHref = companyKind === 'CLIENT' ? '/dashboard/program' : '/dashboard'

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
            {section.items.map((item) => {
              // Handle hrefs with query params (e.g. /dashboard/contracts?side=sell)
              const [itemPath, itemQuery] = item.href.split('?')
              const active = item.href === dashboardHref
                ? pathname === dashboardHref
                : itemQuery
                  ? pathname.startsWith(itemPath) && searchParams.get(itemQuery.split('=')[0]) === itemQuery.split('=')[1]
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.label}
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
