import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: '◻' },
  { label: 'Consultants', href: '/dashboard/consultants', icon: '◻' },
  { label: 'Requirements', href: '/dashboard/requirements', icon: '◻' },
  { label: 'Assignments', href: '/dashboard/assignments', icon: '◻' },
  { label: 'Timesheets', href: '/dashboard/timesheets', icon: '◻' },
  { label: 'Invoices', href: '/dashboard/invoices', icon: '◻' },
  { label: 'Rolloff', href: '/dashboard/rolloff', icon: '◻' },
] as const

const NAV_SECONDARY = [
  { label: 'Settings', href: '/dashboard/settings', icon: '◻' },
  { label: 'Automation Log', href: '/dashboard/automation', icon: '◻' },
] as const

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex bg-etyme-ground">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-60 flex-col border-r border-etyme-border bg-white">
        <div className="p-5 border-b border-etyme-border">
          <Link href="/dashboard">
            <EtymeLogo size="md" />
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-etyme-muted">
            Core
          </p>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                         text-etyme-muted hover:text-etyme-ink hover:bg-etyme-ground
                         transition-colors font-medium"
            >
              {item.label}
            </Link>
          ))}

          <div className="pt-4">
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-etyme-muted">
              System
            </p>
            {NAV_SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href as any}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                           text-etyme-muted hover:text-etyme-ink hover:bg-etyme-ground
                           transition-colors font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-etyme-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-etyme-blue/10 flex items-center justify-center">
              <span className="text-xs font-bold text-etyme-blue">SM</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Sharath M.</p>
              <p className="text-xs text-etyme-muted truncate">Cloudepa</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-etyme-border bg-white">
          <EtymeLogo size="sm" />
          <button className="p-2 rounded-lg hover:bg-etyme-ground">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="p-6 md:p-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  )
}
