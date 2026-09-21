import { Suspense } from 'react'
import { Header } from '@/components/shell/header'
import { DashboardShell } from './shell'
import { SessionProvider, type SessionSeat } from '@/components/session-provider'
import { DemoBanner } from '@/components/demo-banner'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { deniedFor, type Denied } from '@/lib/denied'
import { DeniedScreen } from '@/components/denied'
import { ownPageFor } from '@/lib/portfolio-data'
import { seatFor } from '@/lib/program-seat'
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

/**
 * The client desk this firm is acting at, if any.
 *
 * Asked here for the same reason `readerIsAWorker` is: the shell draws a
 * menu before any fetch comes back, and this is a database read. A
 * program office holding a live seat reads the client's book on every
 * money page (`lib/money/seated-books`) and was still being shown its
 * own menu over it — Demand and Supply above somebody else's workforce.
 *
 * Never throws. No seat means the menu is the firm's own, which is the
 * shell as it was yesterday rather than a blank app.
 */
async function deskHeldAtAClient(): Promise<SessionSeat | null> {
  try {
    const { caller } = await getCallerContext()
    if (!caller?.company) return null
    const seat = await seatFor(caller, null)
    if (!seat) return null
    return {
      clientId: seat.clientCompany.id,
      clientName: seat.clientCompany.name,
      roleName: seat.role?.name ?? null,
      // The client's own role decides what the office may do, so the
      // menu is filtered by the client's permissions and never by the
      // office's. A seat is exactly the desk it was granted.
      permissions: seat.role?.permissions ?? [],
    }
  } catch {
    return null
  }
}

/**
 * Can the app seat whoever is reading this at all?
 *
 * Asked once, here, rather than thirty times in thirty pages. Every
 * dashboard page is inside this layout, so a caller with no seat is
 * refused before a sidebar, a heading or a button is drawn.
 *
 * Before this, nothing asked. The layout drew the whole shell for
 * anybody, each page fetched, each fetch came back 401, and the result
 * was the app rendered around a hole: a consultant's menu, "Cross-vendor
 * tenure at …." with a literal ellipsis, five stats at zero, an "Add
 * consultant" button, and "Not authenticated" in the table body. Four
 * wrongs, and none of them fixable in one page, because every page had
 * the same one.
 *
 * `getCallerContext` is the one door — it is what every API route asks,
 * and it already writes the sentence for each way a seat can be missing.
 * Reading its refusal body rather than answering the question a second
 * way is the point: the page and the route cannot then disagree about
 * who is seated.
 *
 * Never throws. If the lookup itself fails — the database is down — the
 * shell is drawn as it was and the pages surface their own errors, which
 * is an outage, not a refusal, and must not be dressed as one.
 */
async function whyNotSeated(): Promise<Denied | null> {
  try {
    const { caller, error } = await getCallerContext()
    if (caller) return null
    const body = await error.json().catch(() => ({}) as any)
    return deniedFor({
      code: String(body?.error?.code ?? 'DENIED'),
      message: String(body?.error?.message ?? ''),
    })
  } catch {
    return null
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Asked before the other two, and alone: a caller the app cannot seat
  // gets one sentence and nothing else, so there is no menu to decide
  // the shape of and no company name to fail to resolve.
  const denied = await whyNotSeated()
  if (denied) return <DeniedScreen denied={denied} />

  const [worker, seat] = await Promise.all([readerIsAWorker(), deskHeldAtAClient()])

  return (
    <SessionProvider worker={worker} seat={seat}>
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
