import { Suspense } from 'react'
import { Header } from '@/components/shell/header'
import { DashboardShell } from './shell'
import { SessionProvider } from '@/components/session-provider'
import { DemoBanner } from '@/components/demo-banner'
import { getSessionEmail } from '@/lib/api-context'
import { ownPageFor } from '@/lib/portfolio-data'
import { prisma } from '@/lib/db'

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

/**
 * Is the person reading this somebody the work is about?
 *
 * Asked here, on the server, because the shell needs the answer before
 * it draws a menu and /api/me cannot give it — the question is not "what
 * kind of seat is this" but "is there a placement, a submission or a
 * contract with this person's name on it", which is a database read.
 *
 * `ownPage` is supply's, and it is deliberately reused rather than
 * answered a second way here: it already decides this for the person's
 * own page, and two answers to one question drift. It keys on the work
 * rather than on employment for the reason its own docblock gives —
 * every staffer of every firm holds an EMPLOYEE context, so a client's
 * bookkeeper would otherwise be offered a worker's menu.
 *
 * Never throws. A failed read means the menu is drawn without the "You"
 * section, which is the shell as it was yesterday, and not a blank app.
 */
async function readerIsAWorker(): Promise<boolean> {
  try {
    const email = await getSessionEmail()
    if (!email) return false
    const person = await prisma.person.findUnique({
      where: { primaryEmail: email },
      select: { id: true },
    })
    if (!person) return false
    return (await ownPageFor(person.id)).ok
  } catch {
    return false
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const worker = await readerIsAWorker()

  return (
    <SessionProvider worker={worker}>
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
