import { Sidebar } from '@/components/shell/sidebar'
import { Header } from '@/components/shell/header'

/**
 * Authenticated dashboard shell — sidebar + header + content.
 *
 * CLAUDE.md design system:
 *   "Shell — sticky header (logo + org + role), sidebar nav with
 *    section groups (Sell / Procure / Operate / Grow), mobile pill nav"
 *
 * Warm canvas, ink, one blue, clay for attention.
 * The prototype palette — not the slate palette.
 */

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex bg-etyme-canvas">
      {/* Sidebar — desktop only */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-[1200px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
