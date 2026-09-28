/**
 * Filter with rules before you pay a model.
 *
 * The match engine took up to two hundred bench listings, deduplicated
 * them, and sent every one to the model in batches of twenty-five. Eight
 * calls per requirement, with one filter applied beforehand — "not already
 * submitted" — and nothing else.
 *
 * Everything else it needed to know first is arithmetic. Does this person
 * have any of the skills at all. Is their rate floor under the ceiling. Are
 * they free before the start date. Does their work authorization match. All
 * of that is string comparison and date comparison: free, instant, and
 * right every time.
 *
 * On a forty-person bench that is forty scored where fifteen were worth
 * scoring — roughly $53 a month becoming $140, which is the difference
 * between a business at 94% gross margin and one at 70%. On a two-hundred
 * person bench it is thirteen times worse.
 *
 * ── The rule that decides the shape of this file ─────────────────────
 *
 * Use code, not a model, wherever a rule will do. Save the model for the
 * one judgment that actually needs one — is this skill claim evidenced —
 * which is exactly what the match engine is for and exactly what these
 * rules are not.
 *
 * ── Why every drop says why ──────────────────────────────────────────
 *
 * A filter that silently removes people is indistinguishable from a filter
 * that is broken. Every drop carries its reason, the reasons are counted,
 * and the counts go on the screen — so "nobody matched" is answerable
 * without reading code.
 */

/** How many reach the model, unless somebody says otherwise. */
export const DEFAULT_SHORTLIST = 15

/**
 * How long after the start date somebody can still be worth showing.
 *
 * A consultant free two weeks after a role starts is often still placed —
 * start dates slip more often than benches do. Beyond a month they are a
 * different conversation.
 */
const LATE_GRACE_DAYS = 30

export interface Role {
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  startDate: Date | null
  workAuth?: string | null
}

export interface Candidate {
  personId: string
  name: string
  skills: string[]
  location: string | null
  workAuth: string | null
  /** The least they will work for, in cents per hour. */
  rateFloor: number | null
  availableFrom: Date | null
  /** Last time the person themselves confirmed any of this. */
  confirmedAt?: Date | null
}

export interface Kept {
  candidate: Candidate
  /** How many of the role's skills they plainly have. */
  skillHits: number
  /** Ordering hint, not a score. The score is the model's job. */
  rank: number
}

export interface Dropped {
  personId: string
  name: string
  /** One sentence, in words a recruiter would use. */
  because: string
  /** Grouped for counting: SKILLS · RATE · AVAILABILITY · WORK_AUTH · STALE */
  code: string
}

export interface Sifted {
  kept: Kept[]
  dropped: Dropped[]
  considered: number
  /** Said on the screen, so "nobody matched" is answerable. */
  summary: string
}

// ── The rules ─────────────────────────────────────────────────────────

/**
 * Skills, compared the cheap way.
 *
 * Not semantic — that is what the model is for. This only asks whether
 * there is any plain overlap at all, because somebody with none of the
 * named skills is not a borderline call the model needs to make.
 *
 * Substring both ways so "SAP FICO" matches "FICO" and "React" matches
 * "React.js". Crude on purpose: the cost of keeping one extra person is
 * one more row in a batch; the cost of dropping a real match is a
 * placement.
 */
export function skillHits(roleSkills: string[], theirs: string[]): number {
  if (roleSkills.length === 0) return 1 // nothing asked for, nothing to fail

  const mine = theirs.map(norm).filter(Boolean)
  let hits = 0

  for (const want of roleSkills.map(norm).filter(Boolean)) {
    if (mine.some((have) => have.includes(want) || want.includes(have))) hits++
  }
  return hits
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#/.]/g, '')
}

/**
 * Can they work at this rate.
 *
 * Their floor against the role's ceiling, and nothing subtler. A floor
 * above the ceiling is not a negotiation, it is a no — and finding that
 * out from a model costs money to be told what subtraction would have
 * said.
 *
 * Unknown floor stays in. A missing number is not a reason to lose
 * somebody, and half a bench has no rate recorded.
 */
export function rateWorks(role: Role, c: Candidate): boolean {
  if (c.rateFloor == null || role.billMax == null) return true
  return c.rateFloor <= role.billMax
}

/**
 * Are they free in time.
 *
 * Free before the start date, or within a month after it — start dates
 * slip more often than benches do. Unknown availability stays in.
 */
export function freeInTime(role: Role, c: Candidate): boolean {
  if (c.availableFrom == null || role.startDate == null) return true

  const latest = new Date(role.startDate)
  latest.setDate(latest.getDate() + LATE_GRACE_DAYS)
  return c.availableFrom <= latest
}

/**
 * Does the permit match.
 *
 * It no longer decides who is dropped, and that is the point.
 *
 * This used to return false on any mismatch and the caller removed the
 * person from the list without telling anybody. A role saying
 * "US citizens only" therefore erased every lawful permanent resident,
 * asylee, refugee and visa holder from a recruiter's bench, silently,
 * on the strength of a sentence somebody typed into an advert.
 *
 * In the United States that is citizenship-status discrimination under
 * INA §274B unless a law requires the restriction — and nothing here
 * records whether one does. Addendum E's own rule settles what to do
 * without that: BLOCK only where legally grounded, WARN everywhere
 * else. An ungrounded restriction is not grounded, so it warns.
 *
 * The mismatch is not lost. `lib/checks` surfaces it against the person,
 * where a recruiter sees it and decides, instead of never seeing them.
 * When Requirement carries a recorded lawful basis, this becomes a real
 * gate again by consulting `authDecision` — see lib/work-authorisation.
 */
export function authWorks(role: Role, c: Candidate): boolean {
  if (!role.workAuth) return true
  if (!c.workAuth) return true // unknown is not a no
  // Deliberately always true. Kept as a function, and kept called, so
  // the day a basis exists there is one place to change.
  return true
}

/**
 * Has anybody confirmed this record recently.
 *
 * A bench record says somebody is free at $78 and knows Java. That was
 * true three weeks ago; since then they took a contract or raised their
 * rate, and nobody updated it because updating records is nobody's job.
 * Scoring a stale record produces confident nonsense faster than a human
 * could produce it slowly.
 *
 * So an unconfirmed record is not dropped — that would hide the whole
 * bench on day one — it is pushed down the ranking, and the reason is
 * said out loud.
 */
export function staleness(c: Candidate, now: Date): number {
  if (!c.confirmedAt) return 999
  return Math.floor((now.getTime() - c.confirmedAt.getTime()) / 86400000)
}

// ── The sift ──────────────────────────────────────────────────────────

/**
 * Two hundred in, fifteen out, and a reason for every one of the other
 * hundred and eighty-five.
 */
export function sift(
  role: Role,
  candidates: Candidate[],
  opts: { shortlist?: number; now?: Date } = {}
): Sifted {
  const shortlist = opts.shortlist ?? DEFAULT_SHORTLIST
  const now = opts.now ?? new Date()

  const kept: Kept[] = []
  const dropped: Dropped[] = []

  for (const c of candidates) {
    const hits = skillHits(role.skills, c.skills)

    if (hits === 0) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'SKILLS',
        because: `none of ${role.skills.slice(0, 3).join(', ')}`,
      })
      continue
    }

    if (!rateWorks(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'RATE',
        because: `wants $${Math.round((c.rateFloor ?? 0) / 100)}, the role tops out at $${Math.round((role.billMax ?? 0) / 100)}`,
      })
      continue
    }

    if (!freeInTime(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'AVAILABILITY',
        because: `not free until ${c.availableFrom!.toISOString().slice(0, 10)}`,
      })
      continue
    }

    // No `continue` here any more. A work authorization mismatch is a
    // thing to show a recruiter, not a reason to make somebody vanish.
    if (!authWorks(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'WORK_AUTH',
        because: `role needs ${role.workAuth}, they are ${c.workAuth}`,
      })
      continue
    }

    kept.push({ candidate: c, skillHits: hits, rank: 0 })
  }

  // Order before cutting. More skills first; a fresher record wins a tie,
  // because between two equal people the one who answered a text last week
  // is the one who is actually there.
  kept.sort((a, b) => {
    if (b.skillHits !== a.skillHits) return b.skillHits - a.skillHits
    return staleness(a.candidate, now) - staleness(b.candidate, now)
  })
  kept.forEach((k, i) => (k.rank = i + 1))

  const overflow = kept.slice(shortlist)
  for (const o of overflow) {
    dropped.push({
      personId: o.candidate.personId,
      name: o.candidate.name,
      code: 'SHORTLIST',
      because: `ranked ${o.rank}, and only the top ${shortlist} are scored`,
    })
  }

  const final = kept.slice(0, shortlist)

  return {
    kept: final,
    dropped,
    considered: candidates.length,
    summary: summarize(candidates.length, final.length, dropped),
  }
}

/**
 * Said on the screen.
 *
 * "Nobody matched" is not an answer a recruiter can do anything with. This
 * says what went where, so the next move is obvious — widen the rate, drop
 * a skill, or accept a later start.
 */
export function summarize(considered: number, kept: number, dropped: Dropped[]): string {
  if (considered === 0) return 'Nobody on the bench yet.'

  const counts = new Map<string, number>()
  for (const d of dropped) counts.set(d.code, (counts.get(d.code) ?? 0) + 1)

  const said: string[] = []
  const label: Record<string, string> = {
    SKILLS: 'no overlapping skills',
    RATE: 'priced above the role',
    AVAILABILITY: 'not free in time',
    WORK_AUTH: 'wrong work authorization',
    SHORTLIST: 'ranked below the cut',
  }

  for (const code of ['SKILLS', 'RATE', 'AVAILABILITY', 'WORK_AUTH', 'SHORTLIST']) {
    const n = counts.get(code)
    if (n) said.push(`${n} ${label[code]}`)
  }

  if (kept === 0) {
    return `Nobody fits out of ${considered}: ${said.join(', ')}.`
  }

  return said.length > 0
    ? `${kept} of ${considered} worth scoring — ${said.join(', ')}.`
    : `${kept} of ${considered} worth scoring.`
}

// ── Reading the bench answer — one door ───────────────────────────────

/**
 * What `/api/bench` said, turned into rows.
 *
 * ── The bug this exists to stop coming back ──────────────────────────
 *
 * `/api/bench` answers `{ data: { tiers, totals } }`. Two screens read
 * that answer and each worked out the shape for itself. The bench page
 * read `data.tiers` and flattened it correctly. The training page read
 * `data.listings` — a key the route has never returned in its life — and
 * so received an empty array on every firm that ever existed. It then
 * reported "Bench consultants 0 with skills listed" over a bench of five
 * fully skilled people, and computed a skill gap from that zero.
 *
 * Nobody noticed because the failure was silent and confident. A missing
 * key in JavaScript is `undefined`, `undefined ?? []` is `[]`, and `[]`
 * counts to nought without complaint. So the one page in the product
 * about developing people reported that no consultant anywhere had a
 * skill, for every supplier, and looked like an honest empty state.
 *
 * Two rules follow, and they are why this is a function rather than four
 * lines in each page:
 *
 * **One door.** Every screen that reads the bench reads it here. Two
 * screens on one menu must not disagree about the same firm's bench, and
 * the only way to guarantee that is for them to ask the same code.
 *
 * **An answer that cannot be read is not an answer of zero.** Where the
 * shape is not what this understands, the reading fails and says so, and
 * the screen shows a sentence rather than a number. A plausible wrong
 * number is worse than a blank, because nobody audits good news.
 */
export interface BenchRow {
  /** The listing, which is what the row actually is. */
  listingId: string
  tier: 'RETAINED' | 'MARKETING'
  /** INVITED · GRANTED · DECLINED — whether they agreed to be marketed. */
  consent: string | null
  /**
   * How far the listing reaches — NOBODY · FIRM_ONLY · NETWORK — and the
   * sentence that says so, as the route computed them from the consent
   * and the tier (`whoSees` in lib/shared-consultant). Null where the
   * route did not say, which a screen shows as a blank, never a guess.
   */
  reach: string | null
  reachSays: string | null
  consultantId: string
  personId: string
  name: string
  email: string | null
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  /** Cents per hour. Undefined where the reader may not see cost. */
  rateMin: number | null
  rateMax: number | null
  /** ISO, as the route sent it. Parsed by whoever needs a date. */
  availableFrom: string | null
  visibility: string
  grantedAt: string
  /** Whose bench this listing lives on — your own firm, or a partner's. */
  companyId: string
  companyName: string
}

export type BenchReading =
  | { ok: true; rows: BenchRow[]; retained: number; marketing: number; why: null }
  /**
   * The shape was not understood. `rows` is empty and must not be read as
   * a count of anything — `why` is what goes on the screen instead.
   */
  | { ok: false; rows: []; retained: null; marketing: null; why: string }

function unreadable(why: string): BenchReading {
  return { ok: false, rows: [], retained: null, marketing: null, why }
}

/** Every value we accept for a tier, so a new tier fails loudly rather than vanishing. */
const TIERS = ['RETAINED', 'MARKETING'] as const

export function readBench(payload: unknown): BenchReading {
  if (payload == null || typeof payload !== 'object') {
    return unreadable('The bench did not answer. Nothing is counted here rather than counted as nothing.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (payload as any).data
  if (data == null || typeof data !== 'object') {
    return unreadable('The bench answered without a body this page understands, so no count is shown.')
  }

  const tiers = data.tiers
  if (tiers == null || typeof tiers !== 'object' || Array.isArray(tiers)) {
    return unreadable(
      'The bench answered in a shape this page does not understand — it expects the ' +
        'listings grouped by tier. No number is shown, because a zero here would be invented.'
    )
  }

  const rows: BenchRow[] = []
  let unreadableRows = 0

  for (const tier of Object.keys(tiers)) {
    const listings = tiers[tier]
    if (listings == null) continue
    if (!Array.isArray(listings)) {
      return unreadable(`The bench answered with a "${tier}" group that is not a list of people, so nothing is counted.`)
    }
    if (!(TIERS as readonly string[]).includes(tier)) {
      return unreadable(
        `The bench answered with a tier this page has never heard of ("${tier}"). ` +
          'It is not counted and it is not ignored — somebody has to decide what it means.'
      )
    }

    for (const l of listings) {
      const person = l?.consultant?.person
      if (!l?.id || !l?.consultant?.id || !person?.id || typeof person?.name !== 'string') {
        unreadableRows++
        continue
      }
      rows.push({
        listingId: String(l.id),
        tier: tier as 'RETAINED' | 'MARKETING',
        consent: typeof l.consent === 'string' ? l.consent : null,
        reach: typeof l.reach === 'string' ? l.reach : null,
        reachSays: typeof l.reachSays === 'string' ? l.reachSays : null,
        consultantId: String(l.consultant.id),
        personId: String(person.id),
        name: person.name,
        email: typeof person.email === 'string' ? person.email : null,
        headline: l.consultant.headline ?? null,
        skills: Array.isArray(l.consultant.skills) ? l.consultant.skills.filter((s: unknown) => typeof s === 'string') : [],
        location: l.consultant.location ?? null,
        workAuth: l.consultant.workAuth ?? null,
        rateMin: typeof l.rateMin === 'number' ? l.rateMin : null,
        rateMax: typeof l.rateMax === 'number' ? l.rateMax : null,
        availableFrom: l.consultant.availableFrom ?? null,
        visibility: typeof l.consultant.visibility === 'string' ? l.consultant.visibility : 'INTERNAL',
        grantedAt: typeof l.grantedAt === 'string' ? l.grantedAt : '',
        companyId: String(l.company?.id ?? ''),
        companyName: String(l.company?.name ?? ''),
      })
    }
  }

  // A reader that silently drops people is indistinguishable from a
  // broken one — the rule this whole file is built on. So a row that
  // cannot be read fails the whole reading rather than shortening it,
  // because a bench of five showing four is the bug nobody reports.
  if (unreadableRows > 0) {
    return unreadable(
      `The bench answered with ${unreadableRows} ` +
        `${unreadableRows === 1 ? 'row' : 'rows'} this page could not read, so no count is shown. ` +
        'A short list read as a whole one is worse than no list.'
    )
  }

  return {
    ok: true,
    rows,
    retained: rows.filter((r) => r.tier === 'RETAINED').length,
    marketing: rows.filter((r) => r.tier === 'MARKETING').length,
    why: null,
  }
}

/**
 * Where the bench's Submit takes the reader, for the people chosen.
 *
 * It opened the submit form and dropped who was chosen, so a recruiter
 * ticked somebody on the bench and then had to find them again in a
 * picker. The form takes one person (`/dashboard/submissions?new=1&person=`),
 * so one person goes through by id.
 *
 * More than one is refused in a sentence rather than opened with the
 * first and the rest silently lost: a recruiter who ticked three and
 * submitted one would believe all three went. Nobody is sent forward
 * who has not agreed to be marketed by this firm — said here, before
 * the form, rather than as a refusal after it.
 */
export function submitLink(
  chosen: { personId: string; name: string; consent?: string | null }[]
): { ok: true; href: string } | { ok: false; says: string } {
  if (chosen.length === 0) {
    return { ok: false, says: 'Choose the person to put forward first.' }
  }
  if (chosen.length > 1) {
    return {
      ok: false,
      says:
        `You chose ${chosen.length} people. A submission is one person to one role, so put them forward ` +
        'one at a time: choose one and press Submit.',
    }
  }
  const [p] = chosen
  if (p.consent && p.consent !== 'GRANTED') {
    return {
      ok: false,
      says:
        p.consent === 'DECLINED'
          ? `${p.name} declined to be marketed by you, so they cannot be put forward.`
          : `${p.name} has not answered your invitation yet. Nobody is put forward until they say yes.`,
    }
  }
  return { ok: true, href: `/dashboard/submissions?new=1&person=${encodeURIComponent(p.personId)}` }
}
