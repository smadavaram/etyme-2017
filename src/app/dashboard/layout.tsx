import { Suspense } from 'react'
import { Header } from '@/components/shell/header'
import { DashboardShell } from './shell'
import { SessionProvider } from '@/components/session-provider'
import { DemoBanner } from '@/components/demo-banner'

/**
 * Authenticated dashboard shell — sidebar + header + content.
 *
 * CLAUDE.md design system:
 *   "Shell — sticky header (logo + org + role), sidebar nav with
 *    section groups, mobile pill nav"
 *
 * Navigation adapts to company type:
 *   Vendor → Today → Sell → Talent → Operate → Grow
 *   Client → Program → Governance
 *
 * Warm canvas, ink, one blue, clay for attention.
 * The prototype palette — not the slate palette.
 *
 * force-dynamic: dashboard pages are always authenticated and use
 * useSearchParams — never statically rendered.
 */
export const dynamic = 'force-dynamic'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <div className="min-h-screen flex bg-etyme-canvas">
        {/* Sidebar — desktop only, adapts to the caller's company */}
        <div className="hidden md:block">
          <Suspense>
            <DashboardShell />
          </Suspense>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          <Suspense>
            <Header />
          </Suspense>

          {/* Says demo on every screen. Silent for a real company. */}
          <DemoBanner />

          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="max-w-[1200px] mx-auto">
              <Suspense>
                {children}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </SessionProvider>
  )
}
