import { sign, read, baseUrl } from '@/lib/signed-link'
import type { TermsShown } from '@/lib/bench-filter'

/**
 * The link a consultant opens to answer a vendor who wants to market
 * them.
 *
 * ── Why a link and not a login ───────────────────────────────────────
 *
 * A consultant on a vendor's bench has no seat. No `Context` row, no
 * password, nothing to sign in with — they are a record somebody else
 * created, not a user. That is fine and mostly correct: a working
 * contractor already has accounts on six vendor portals and adoption of
 * a seventh is close to zero.
 *
 * It stops being fine the moment their answer is required for anything.
 * `BenchListing.state` now starts at INVITED and only the consultant
 * moves it, and without a way to answer that is not consent — it is a
 * deadlock. Every new listing would be permanently unsubmittable.
 *
 * So the invitation carries its own authority, the way `/packet` and
 * `/reply` already do. One signed link, one question, no account.
 *
 * ── Why it does not act on the click ─────────────────────────────────
 *
 * The link opens a page with two buttons; the buttons do the work. Mail
 * security scanners follow every link in a message before the person
 * ever sees it, and a GET that accepted a bench listing on their behalf
 * would be triggered by a spam filter rather than by them — which is
 * precisely the fake consent this whole mechanism exists to prevent.
 */

export interface InviteToken {
  listingId: string
}

/** `BENCH_INVITE`, so a reply token cannot be posted here instead. */
const KIND = 'BENCH_INVITE'

export function signInvite(listingId: string): string {
  return sign(KIND, [listingId])
}

export function readInvite(token: string | undefined | null): InviteToken | null {
  const parts = read(KIND, token)
  if (!parts || !parts[0]) return null
  return { listingId: parts[0] }
}

/**
 * The link itself, or empty where it cannot be built.
 *
 * Empty rather than broken: no signing secret, or nothing saying where
 * this deployment lives. A message with a link to nowhere is worse than
 * one with no link, because the person tries it.
 */
export function inviteUrl(listingId: string): string {
  const base = baseUrl()
  if (!base) return ''
  try {
    return `${base}/bench-invite/${signInvite(listingId)}`
  } catch {
    return ''
  }
}

/**
 * What the vendor's invitation says.
 *
 * In the vendor's name, never ours — a consultant on two benches never
 * learns that from us, and the moment a vendor suspects
 * disintermediation the benches stop being uploaded.
 *
 * It says what being on a bench actually means, because most people
 * asked this question have no idea and the ones who do have been burned
 * by a vendor submitting them somewhere without asking.
 *
 * ── It promises only what the listing does ──────────────────────────
 *
 * It said "we will ask you before every single submission". The listing
 * a yes creates has "ask me first" off unless the person ticks it, so
 * the email promised a protection the default does not give (tester,
 * 2026-09-30). It now says what a yes lets the firm do, and that the
 * person can choose to be asked first on the page the link opens.
 *
 * ── It names the pay terms, or says there are none ──────────────────
 *
 * A firm may state how it would engage somebody and what it would pay
 * (`termsShown` in lib/bench-filter), and the page the link opens asks
 * the person to agree them with the yes (2026-10-06). An email that
 * said nothing about them would let the yes carry a term the person
 * first met one click later. So the email says the terms in the firm's
 * own voice, or says plainly that none were stated and a yes agrees
 * only to being put forward. Optional, so a caller that has not read
 * the listing's terms yet still sends the honest second sentence.
 */
export function inviteText(o: {
  personName: string
  vendorName: string
  url: string
  terms?: TermsShown | null
}): { subject: string; body: string } {
  const first = o.personName.trim().split(/\s+/)[0]
  const terms = o.terms
    ? `If you say yes, you also agree our pay terms: ${o.terms.rate}, ${o.terms.words.replace('its ', 'our ')}, when we place you. `
    : `We have not stated any pay terms yet, so saying yes agrees only that we may put you forward. `
  return {
    subject: `${o.vendorName} would like to put you forward for contract work`,
    body:
      `Hi ${first} — ${o.vendorName} here.\n\n` +
      `We would like to add you to our bench, which means we can put you forward ` +
      `for contract jobs. Nothing happens until you say yes. ` +
      terms +
      `On the page below you can ` +
      `also ask us to check with you before we send you to a client we have not sent ` +
      `you to before, and you can take this back whenever you like.\n\n` +
      `Say yes or no here — no password, no account:\n${o.url}\n\n` +
      `If you would rather not, saying no is the end of it. We will not ask again.`,
  }
}

// ── Telling the firm ──────────────────────────────────────────────────

/**
 * Tell the firm that asked what the person answered — in the app and by
 * email, to whoever sent the invitation and every desk that puts people
 * forward (`whoHearsTheAnswer`, `answerNotice` in lib/bench-consent).
 *
 * One call, used by both doors a person answers from: the link in the
 * invitation and their own "Who has you" page. Fire-and-forget like every
 * notification; a slow mail provider never holds up the answer itself.
 *
 * Who sent the invitation is read off the log the invitation wrote
 * (`requestedBy` or `createdBy` in its payload), because the listing has
 * no column for it. Where no log names anybody, the desks alone hear it.
 */
export async function tellTheFirm(o: {
  listingId: string
  companyId: string
  subjectPersonId: string
  personName: string
  said: 'ACCEPT' | 'DECLINE'
  note?: string | null
  askFirst?: boolean | null
  stayDays?: number | null
}): Promise<string[]> {
  const { prisma } = await import('@/lib/db')
  const { notify } = await import('@/lib/notify')
  const { answerNotice, whoHearsTheAnswer } = await import('@/lib/bench-consent')

  const [logs, seats] = await Promise.all([
    prisma.automationLog.findMany({
      where: {
        companyId: o.companyId,
        action: { in: ['BENCH_LISTING_REQUESTED', 'CONSULTANT_CREATED'] },
        payload: { path: ['listingId'], equals: o.listingId },
      },
      select: { payload: true },
      orderBy: { at: 'desc' },
      take: 1,
    }).catch(() => []),
    prisma.context.findMany({
      where: { companyId: o.companyId, revokedAt: null, suspendedAt: null, roleId: { not: null } },
      select: { personId: true, role: { select: { permissions: true } } },
    }),
  ])
  const payload = (logs[0]?.payload ?? {}) as Record<string, unknown>
  const invitedBy =
    (typeof payload.requestedBy === 'string' && payload.requestedBy) ||
    (typeof payload.createdBy === 'string' && payload.createdBy) ||
    null

  const listeners = whoHearsTheAnswer({
    invitedBy,
    seats: seats.map((s) => ({ personId: s.personId, permissions: s.role?.permissions ?? [] })),
    subjectPersonId: o.subjectPersonId,
  })
  const said = answerNotice(o)
  for (const personId of listeners) {
    void notify({
      personId,
      companyId: o.companyId,
      // The column is a string and the bell already knows BENCH; the
      // helper's union has not caught up with it (conversation's).
      type: 'BENCH' as never,
      title: said.title,
      body: said.body,
      entityId: o.listingId,
      // The in-app row is written first and always; EMAIL asks for it
      // to leave the building as well.
      channel: 'EMAIL',
    })
  }
  return listeners
}
