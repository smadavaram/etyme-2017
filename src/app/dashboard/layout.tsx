import { Suspense } from 'react'
import { Header } from '@/components/shell/header'
import { DashboardShell } from './shell'
import { SessionProvider, type SessionSeat } from '@/components/session-provider'
import { DemoBanner } from '@/components/demo-banner'
import { SetupReminder } from '@/components/setup-reminder'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { deniedFor, type Denied } from '@/lib/denied'
import { DeniedScreen } from '@/components/denied'
import { ownPageFor } from '@/lib/portfolio-data'
import { seatFor } from '@/lib/program-seat'
import { prisma } from '@/lib/db'
import { demoCompanyFor } from '@/lib/demo-company'
import { yourTermsHref } from '@/lib/your-terms'
import { rungsToFile } from '@/lib/consultant-portfolio'

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
 * Where this person agrees their own terms, while a placement of theirs
 * reads "Awarded, terms pending" — offered as "Your terms" under "You".
 * The notification was the only way to the page.
 *
 * Never throws. A failed read means no link, which is the menu as it was.
 */
async function readersTermsHref(): Promise<string | null> {
  try {
    const email = await getSessionEmail()
    if (!email) return null
    const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true } })
    if (!person) return null
    return await yourTermsHref(person.id)
  } catch {
    return null
  }
}

/**
 * Is the company this person is signed in at a made-up one?
 *
 * Asked here, on the server, so "Demo" is in front of the company's name
 * on the first paint rather than a fetch later. The rule — who is seated
 * there, not what it is called — is lib/demo-company's. Never throws: a
 * failed read is "not a demo", so a real company can never be labeled
 * one by an outage.
 */
async function companyIsADemo(): Promise<boolean> {
  try {
    const { caller } = await getCallerContext()
    return await demoCompanyFor(caller?.company?.id)
  } catch {
    return false
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

/**
 * Does this person have a live line to file a week on?
 *
 * The + button's "New timesheet" is offered only then (sign-up walk,
 * round six, problem 7: Karthik Menon's only line ended Aug 31 and the
 * button still offered him a new week). The answer is the filing door's
 * own, `rungsToFile` in lib/consultant-portfolio — in progress, or ended
 * inside the final-week grace — so the button and the form cannot
 * disagree about which lines take hours.
 *
 * Never throws. A failed read means no "New timesheet" on the + button;
 * the week is still filed from Your work.
 */
async function readerFilesAWeek(): Promise<boolean> {
  try {
    const email = await getSessionEmail()
    if (!email) return false
    const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true } })
    if (!person) return false
    const lines = await prisma.sellContract.findMany({
      where: { personId: person.id },
      select: { id: true, personId: true, companyId: true, clientCompanyId: true, state: true, startDate: true, endDate: true },
    })
    const today = new Date().toISOString().slice(0, 10)
    return rungsToFile(
      lines.map((c) => ({
        id: c.id, personId: c.personId, companyId: c.companyId, clientCompanyId: c.clientCompanyId, state: c.state,
        startDate: c.startDate.toISOString().slice(0, 10),
        endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
      })),
      today
    ).length > 0
  } catch {
    return false
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

  const [worker, seat, demo, termsHref, filesAWeek] = await Promise.all([
    readerIsAWorker(), deskHeldAtAClient(), companyIsADemo(), readersTermsHref(), readerFilesAWeek(),
  ])

  return (
    <SessionProvider worker={worker} seat={seat} demo={demo} termsHref={termsHref} filesAWeek={filesAWeek}>
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
              {/* One line while setup has steps owed; silent otherwise. */}
              <SetupReminder />
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
