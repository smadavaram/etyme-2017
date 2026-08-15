'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EtymeMark } from '@/components/logo'
/**
 * Sidebar navigation — from CLAUDE.md design system.
 *
 * Navigation per company type:
 *   Vendor     → Today → Sell → Procure → Operate → Grow
 *   Consultant → You → Grow
 *   GSI        → Deliver → Supply → Operate
 *   Client     → Program → Governance
 *
 * Phase 1: Vendor view (the primary user).
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
      { label: 'Requirements', href: '/dashboard/requirements', icon: '◈' },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Sell Contracts', href: '/dashboard/contracts', icon: '▤' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠' },
    ],
  },
  {
    label: 'Procure',
    items: [
      { label: 'Bench', href: '/dashboard/bench', icon: '◎' },
      { label: 'Candidates', href: '/dashboard/consultants', icon: '◌' },
      { label: 'Buy Contracts', href: '/dashboard/contracts', icon: '▥' },
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
    ],
  },
  {
    label: 'Grow',
    items: [
      { label: 'Training', href: '/dashboard/training', icon: '◪' },
      { label: 'Reports', href: '/dashboard/reports', icon: '▨' },
    ],
  },
  {
    label: 'Client view',
    items: [
      { label: 'Program', href: '/dashboard/program', icon: '◉' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

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
        {VENDOR_NAV.map((section) => (
          <div key={section.label} className="mb-1">
            <div className="eyebrow px-2 pt-5 pb-1.5">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
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
        <div className="text-[11px] font-medium text-etyme-ink truncate">
          Cloudepa Inc.
        </div>
        <div className="text-[10px] text-etyme-faint">
          Vendor · US IT
        </div>
      </div>
    </aside>
  )
}
