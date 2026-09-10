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
        {/* Sidebar — the rail, from md up. Below that the same navigation
            slides in from the ☰ in the header (components/shell/mobile-nav). */}
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

          {/* overflow-x-clip, not hidden: clip makes no scroll container,
              so sticky rows inside still work. It is there so that one
              page with one element wider than a phone clips that element
              rather than making the whole screen — header, ☰, the lot —
              scroll sideways, which is what every phone screenshot showed. */}
          <main className="flex-1 overflow-x-clip p-4 sm:p-6 md:p-8">
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
