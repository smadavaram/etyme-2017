/**
 * Who may come in through which door, by the company's sign-in policy.
 *
 * The founder, 2026-11-11 (CLAUDE.md, "Enterprise identity"): a client and
 * a larger company sign their people in through their own directory and
 * nothing else; a small team is invite-only; an Owner may choose hybrid,
 * where invited people on public addresses are seated with limits.
 *
 * Pure: every answer here is read from facts the caller loaded, so each
 * door can be read as a sentence without a database (lib/identity/read
 * loads the facts and writes the ledger row).
 *
 * ── The doors ────────────────────────────────────────────────────────
 *
 * Every way a person reaches a seat. DIRECTORY is the company's own
 * identity provider (built in the second stage of pass 1); every other door
 * is Etyme's or a provider's consumer sign-in.
 *
 * ── No policy is today's behavior ────────────────────────────────────
 *
 * A company with no policy row and no directory reads OPEN and every door
 * answers as it did before 2026-11-11. A company with a directory and no
 * row reads directory-only (the founder: "A company with a directory
 * defaults to directory-only until its Owner chooses otherwise").
 */

export const SIGN_IN_MODES = ['SSO_ONLY', 'INVITE_ONLY', 'HYBRID'] as const
export type SignInMode = (typeof SIGN_IN_MODES)[number]

/** A mode, or OPEN where nothing is set: today's behavior. */
export type EffectiveMode = SignInMode | 'OPEN'

export const DOORS = [
  'PASSWORD',
  'EMAIL_LINK',
  'GOOGLE_SOCIAL',
  'MICROSOFT_SOCIAL',
  /** LinkedIn's sign-in: for workers and one-person firms only (2026-11-11). */
  'LINKEDIN',
  'VERIFY_TOKEN',
  'CLAIM_LINK',
  'STAFF_BOOTSTRAP',
  'INVITE',
  'DIRECTORY',
  /** Joining a company because the email is on its verified domain. */
  'DOMAIN_JOIN',
] as const
export type Door = (typeof DOORS)[number]

/** A door a person signs in through, as opposed to one that seats them. */
export const SIGN_IN_DOORS: readonly Door[] = ['PASSWORD', 'EMAIL_LINK', 'GOOGLE_SOCIAL', 'MICROSOFT_SOCIAL', 'LINKEDIN', 'VERIFY_TOKEN', 'DIRECTORY']

/** What the reader knows about one company's sign-in. */
export interface CompanyPolicy {
  companyId: string
  companyName: string
  /** The mode its Owner set, or null where nobody set one. */
  mode: SignInMode | null
  /** The issuers of its directories that are turned on. */
  issuers: readonly string[]
}

export function effectiveMode(p: CompanyPolicy | null | undefined): EffectiveMode {
  if (!p) return 'OPEN'
  if (p.mode) return p.mode
  return p.issuers.length > 0 ? 'SSO_ONLY' : 'OPEN'
}

export interface DoorQuestion {
  door: Door
  /** The address coming in, lowercased. */
  email: string
  /**
   * The company that owns a verified domain the address is on, if any.
   * Its policy governs the address at every sign-in door.
   */
  domainCompany: CompanyPolicy | null
  /** The company the door seats the person at, where the door seats. */
  target?: CompanyPolicy | null
  /** The issuer that vouched for the person, on the DIRECTORY door. */
  issuer?: string | null
  /** Whether the address is a consumer provider's (gmail.com and the rest). */
  publicAddress: boolean
}

export type DoorVerdict =
  | { allowed: true; policy: EffectiveMode; companyId: string | null }
  | { allowed: false; policy: SignInMode; companyId: string; companyName: string; says: string }

/** The sentence every refused door says for a directory-only company. */
export function directoryOnlySays(companyName: string): string {
  return `${companyName} signs its people in through your company's directory only. Use the directory sign-in your company gave you; there is no other way in.`
}

function refuse(p: CompanyPolicy, mode: SignInMode, says: string): DoorVerdict {
  return { allowed: false, policy: mode, companyId: p.companyId, companyName: p.companyName, says }
}

/**
 * Allowed, or refused with the sentence the person reads.
 *
 * Read in this order, and the first refusal wins:
 *  1. the company whose verified domain the address is on, at a sign-in
 *     door: directory-only refuses every door but its own directory;
 *  2. the company the door seats them at: directory-only refuses every
 *     door that is not its directory (an invitation only for an address on
 *     its own domain, who will then sign in through the directory);
 *     invite-only refuses a join by domain; hybrid refuses a public address
 *     a join by domain.
 *
 * There is no break-glass. Not for support, not for an Admin, not for
 * Superadmin: the staff bootstrap and a claim link are doors like any
 * other.
 */
export function decideDoor(q: DoorQuestion): DoorVerdict {
  const dom = q.domainCompany
  const domMode = effectiveMode(dom)
  if (dom && domMode === 'SSO_ONLY') {
    if (q.door !== 'DIRECTORY' && q.door !== 'INVITE') return refuse(dom, 'SSO_ONLY', directoryOnlySays(dom.companyName))
    if (q.door === 'DIRECTORY' && !(q.issuer && dom.issuers.includes(q.issuer))) {
      return refuse(dom, 'SSO_ONLY', `That directory is not ${dom.companyName}'s. Sign in through ${dom.companyName}'s own directory.`)
    }
  }

  const t = q.target ?? null
  const tMode = effectiveMode(t)
  if (t && tMode === 'SSO_ONLY') {
    const onItsDomain = dom?.companyId === t.companyId
    if (q.door === 'INVITE') {
      if (!onItsDomain) {
        return refuse(t, 'SSO_ONLY',
          `${t.companyName} signs in through its company's directory only, so ${q.email} cannot be invited. Add the person in your company's directory instead.`)
      }
    } else if (q.door === 'DIRECTORY') {
      if (!(q.issuer && t.issuers.includes(q.issuer))) {
        return refuse(t, 'SSO_ONLY', `That directory is not ${t.companyName}'s. Sign in through ${t.companyName}'s own directory.`)
      }
    } else {
      return refuse(t, 'SSO_ONLY', directoryOnlySays(t.companyName))
    }
  }
  if (t && tMode === 'INVITE_ONLY' && q.door === 'DOMAIN_JOIN') {
    return refuse(t, 'INVITE_ONLY', `${t.companyName} lets people in by invitation only. Ask an Owner or Admin there to invite you.`)
  }
  if (t && tMode === 'HYBRID' && q.door === 'DOMAIN_JOIN' && q.publicAddress) {
    return refuse(t, 'HYBRID', `${t.companyName} seats people on a public address by invitation only. Ask an Owner or Admin there to invite you.`)
  }

  const governing = t ?? dom
  return { allowed: true, policy: effectiveMode(governing), companyId: governing?.companyId ?? null }
}

// ── A live session, on every request ──────────────────────────────────

export interface SessionFacts {
  /** The door the session was signed in through; null for one minted before 2026-11-11. */
  door: Door | null
  issuer: string | null
  /** The session version the token carries; absent reads 0. */
  tokenVersion: number | null | undefined
  /** The person's current session version; absent reads 0. */
  personVersion: number | null | undefined
}

/**
 * Whether a live session still stands. A session whose version is behind
 * the person's was ended ("sign out everywhere", a directory that disabled
 * them); a session whose door the address's own company no longer allows
 * was signed in before the policy changed. Either is refused on the next
 * request.
 */
export function sessionStands(s: SessionFacts, domainCompany: CompanyPolicy | null, email: string): { stands: true } | { stands: false; says: string; ended: boolean } {
  if ((s.tokenVersion ?? 0) < (s.personVersion ?? 0)) {
    return { stands: false, ended: true, says: 'Your sessions were ended. Sign in again.' }
  }
  if (domainCompany && effectiveMode(domainCompany) === 'SSO_ONLY') {
    const v = decideDoor({ door: s.door ?? 'PASSWORD', email, domainCompany, issuer: s.issuer, publicAddress: false })
    if (!v.allowed) return { stands: false, ended: false, says: v.says }
  }
  return { stands: true }
}

/**
 * Whether this session may use a seat at this company. A directory-only
 * company's seat is used only by a session its own directory signed in,
 * whoever holds it and however they were seated.
 */
export function seatRefusal(seatCompany: CompanyPolicy | null, s: Pick<SessionFacts, 'door' | 'issuer'>): string | null {
  if (!seatCompany || effectiveMode(seatCompany) !== 'SSO_ONLY') return null
  if (s.door === 'DIRECTORY' && s.issuer && seatCompany.issuers.includes(s.issuer)) return null
  return directoryOnlySays(seatCompany.companyName)
}

/**
 * LinkedIn is a door for a worker and a one-person firm, never for a seat
 * at a company with colleagues (founder, 2026-11-11: "Only the workers and
 * solopreneurs can have Gmail or LinkedIn login. Rest would be Microsoft,
 * Google enterprise or Okta login"). A worker's own seat holds no company;
 * a one-person firm is a CONSULTANT_CORP. Every other company's seat is
 * refused to a LinkedIn session, in a sentence that says the way in.
 */
export function linkedInSeatRefusal(door: Door | null, seatCompany: { name: string; kind: string } | null | undefined): string | null {
  if (door !== 'LINKEDIN' || !seatCompany) return null
  if (seatCompany.kind === 'CONSULTANT_CORP') return null
  return `LinkedIn sign-in is for workers and one-person firms. Sign in to ${seatCompany.name} through your company's directory, or with Microsoft, Google or your email and password where ${seatCompany.name} allows it.`
}

/**
 * Directory only locks out everybody who is not signed in through the
 * directory, the Owner choosing it included. So it is chosen only from a
 * session that company's own directory signed in: the Owner proves the
 * door works for them before every other door closes.
 */
export function directoryOnlyLockout(args: { to: SignInMode; door: Door | null; issuer: string | null; issuers: readonly string[]; companyName: string }): string | null {
  if (args.to !== 'SSO_ONLY') return null
  if (args.door === 'DIRECTORY' && args.issuer && args.issuers.includes(args.issuer)) return null
  return `Sign in to ${args.companyName} through your company's directory once, then choose directory only. Otherwise it would sign you out with no way back in.`
}

// ── An invited public-address seat at a hybrid company ────────────────

/**
 * What a seat on a public address (Gmail and the rest) never holds at a
 * hybrid company, whatever its role says: money and signing acts. The
 * founder, 2026-11-11: "no money or signing acts (paying, sending bills,
 * bank checks, agreements, awards, payroll)".
 *
 *   invoices.issue          sending a bill
 *   payments.record         paying, and recording a payment
 *   payroll.run, .approve   payroll
 *   orders.raise            committing money to a firm
 *   rates.write             setting what is paid
 *   requirements.write      awarding (the award route asks for it)
 *   assignments.write       writing and extending a placement's contract
 *   assignments.terminate   ending one
 *   timesheets.approve      signing hours, which is what a bill is priced on
 *   vendors.manage          approving a supplier, and its bank check
 */
export const PUBLIC_SEAT_WITHHELD = [
  'invoices.issue',
  'payments.record',
  'payroll.run',
  'payroll.approve',
  'orders.raise',
  'rates.write',
  'requirements.write',
  'assignments.write',
  'assignments.terminate',
  'timesheets.approve',
  'vendors.manage',
] as const

/** Whether a seat is the limited kind: a public address at a hybrid company. */
export function isLimitedPublicSeat(seatCompany: CompanyPolicy | null, publicAddress: boolean): boolean {
  return publicAddress && effectiveMode(seatCompany) === 'HYBRID'
}

/**
 * The permissions a seat actually holds once the limit is applied. A role
 * holding everything (`*`) is spelled out first, so the limit takes away
 * exactly the acts named and nothing else.
 */
export function narrowForPublicSeat(held: readonly string[], all: readonly string[]): string[] {
  const out = held.includes('*') ? [...all] : [...held]
  return out.filter((p) => p !== '*' && !(PUBLIC_SEAT_WITHHELD as readonly string[]).includes(p))
}

// ── Who changes the mode ──────────────────────────────────────────────

/**
 * Only the company's own Owner sets the mode; an Admin may read it. A
 * directory-only mode needs a directory that is turned on, or nobody could
 * sign in at all, the Owner included.
 */
export function mayChangeMode(args: { roleName: string | null; to: SignInMode; issuers: readonly string[]; companyName: string }): { ok: true } | { ok: false; status: number; says: string } {
  if (args.roleName !== 'Owner') {
    return { ok: false, status: 403, says: `Only an Owner of ${args.companyName} changes how its people sign in. An Admin may read it.` }
  }
  if (args.to === 'SSO_ONLY' && args.issuers.length === 0) {
    return {
      ok: false, status: 422,
      says: `Connect your company's directory and turn it on first. With no directory, directory-only would let nobody sign in to ${args.companyName}, you included.`,
    }
  }
  return { ok: true }
}

/** The mode in a sentence, for the settings route and the ledger. */
export function modeSays(mode: EffectiveMode, companyName: string): string {
  switch (mode) {
    case 'SSO_ONLY':
      return `${companyName}'s people sign in through your company's directory. No separate Etyme password.`
    case 'INVITE_ONLY':
      return `People join ${companyName} by invitation, and sign in with Google, Microsoft or an email and password.`
    case 'HYBRID':
      return `${companyName}'s people sign in through your company's directory, and an Owner or Admin may invite people on public addresses, who cannot pay, bill, sign or award.`
    case 'OPEN':
      return `Nothing is set: people on ${companyName}'s verified domain join by signing in, and anybody may be invited.`
  }
}
