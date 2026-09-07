/**
 * The first message to somebody who never asked to hear from us.
 *
 * ── The thing being solved ───────────────────────────────────────────
 *
 * A vendor with four people on their bench and no LinkedIn Recruiter
 * seat and no Dice subscription cannot source. Those tools cost more per
 * month than a small firm's entire tooling budget, and without them the
 * only sourcing available is asking people you already know. The bought
 * list is a way to give that vendor a first lead.
 *
 * ── The thing being avoided ──────────────────────────────────────────
 *
 * It is creepy, and pretending otherwise would be the first step to
 * building something that deserves the word. Somebody's details were
 * bought. They did not give them to us. Every rule below exists to keep
 * the distance between "a vendor found me" and "I am on a list being
 * farmed", and that distance is not maintained by good intentions.
 *
 * Four things do the work:
 *
 *   One approach, across every vendor. Not one per vendor — one, full
 *   stop. A thousand vendors each allowed a polite first message is a
 *   thousand messages to one person, and each vendor would be behaving
 *   perfectly. This is the rule that matters most and the only one that
 *   cannot be reconstructed from ordinary politeness.
 *
 *   Say where the details came from, in the message. The difference
 *   between a recruiter who found you and a stranger who bought you is
 *   whether they admit which one they are. Somebody who cannot say it
 *   plainly should not be sending it.
 *
 *   Only people who were actually consultants, about work they actually
 *   did. A message to a former SAP contractor about a SAP contract is a
 *   relevant approach. The same message to somebody whose record says
 *   nothing is a mailshot.
 *
 *   Stop is global, immediate and permanent. Not "stop for this vendor".
 *   Somebody who says stop has said it to the list, and every vendor on
 *   the platform is bound by it.
 *
 * ── What this is not ─────────────────────────────────────────────────
 *
 * Not a campaign tool. There is no sequence, no follow-up, no drip. One
 * message, and then either they answer and become a normal consultant
 * with a bench listing and consent, or they do not and nothing further
 * ever happens.
 */

export type Refusal =
  | 'ALREADY_APPROACHED'
  | 'OPTED_OUT'
  | 'HELD_BY_ANOTHER'
  | 'NOT_A_CONSULTANT'
  | 'NOT_RELEVANT'
  | 'NO_ADDRESS'

export interface Contact {
  /** Their address. Null where the record has none. */
  email: string | null
  /**
   * What the record says they did. Empty means the record says nothing,
   * which is not the same as saying they are not a consultant.
   */
  skills: string[]
  /** Whether the source shows them working as a contractor, not just existing. */
  wasConsultant: boolean
  /** When anybody on the platform last approached them. Null means never. */
  approachedAt: Date | null
  /** Set when they asked to be left alone. Binds every vendor. */
  optedOutAt: Date | null
  /** The vendor currently holding the one approach, if any. */
  heldByCompanyId: string | null
}

export interface Verdict {
  ok: boolean
  /** Why not, where not. */
  refusal: Refusal | null
  /** Said to the recruiter, plainly. */
  reason: string
}

/**
 * Whether this vendor may write to this person, once.
 *
 * Deliberately strict, and the strictness is the product. A sourcing
 * tool that lets ten vendors reach the same person is not a sourcing
 * tool, it is a mailing list, and the people on it work that out within
 * a week.
 */
export function mayApproach(
  c: Contact,
  vendorCompanyId: string,
  vendorSkills: string[]
): Verdict {
  if (c.optedOutAt) {
    return {
      ok: false,
      refusal: 'OPTED_OUT',
      reason: 'They asked to be left alone. That binds every vendor here, not just the one they told.',
    }
  }

  if (!c.email) {
    return { ok: false, refusal: 'NO_ADDRESS', reason: 'No address on the record, so there is nowhere to write.' }
  }

  if (!c.wasConsultant) {
    // The whole justification for writing at all. Somebody who has
    // contracted before is being told about contract work; somebody
    // else is being cold-mailed.
    return {
      ok: false,
      refusal: 'NOT_A_CONSULTANT',
      reason:
        'Nothing on the record shows they worked as a contractor. Writing to them would be a mailshot, ' +
        'not an approach.',
    }
  }

  if (c.heldByCompanyId && c.heldByCompanyId !== vendorCompanyId) {
    return {
      ok: false,
      refusal: 'HELD_BY_ANOTHER',
      reason: 'Another vendor is already talking to them. One approach per person, across everybody.',
    }
  }

  if (c.approachedAt && c.heldByCompanyId !== vendorCompanyId) {
    return {
      ok: false,
      refusal: 'ALREADY_APPROACHED',
      reason: 'They have been approached once already and did not answer. There is no second message.',
    }
  }

  if (!overlaps(c.skills, vendorSkills)) {
    return {
      ok: false,
      refusal: 'NOT_RELEVANT',
      reason:
        'Their recorded skills do not overlap what this vendor places. A relevant approach is the ' +
        'difference between being found and being farmed.',
    }
  }

  return { ok: true, refusal: null, reason: 'One message, saying where the details came from.' }
}

function overlaps(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const set = new Set(b.map((s) => s.trim().toLowerCase()).filter(Boolean))
  return a.some((s) => set.has(s.trim().toLowerCase()))
}

// ── What the one message has to contain ───────────────────────────────

export interface Approach {
  personName: string
  vendorName: string
  /** The skill on their record that made this relevant. Named in the message. */
  becauseOf: string
  /** Where the details came from, in words a person would use. */
  provenance: string
}

/**
 * The only message a sourced contact ever gets.
 *
 * Three things it must do, and a fourth it must not.
 *
 * It says who is writing and why them specifically, because "why me"
 * is the first thing anybody thinks and leaving it unanswered is what
 * makes a message feel like a machine found them.
 *
 * It says where the details came from. This is the whole difference
 * between a recruiter who found you and a stranger who bought you, and
 * a firm unwilling to write the sentence should not be sending the
 * message.
 *
 * It offers a way out in one click, in the first message rather than a
 * later one.
 *
 * It does not pitch. There is no role attached, because attaching one
 * before they have said they are looking is the behaviour that made
 * every consultant in this industry stop reading recruiter mail.
 */
export function approachText(a: Approach): { subject: string; body: string } {
  return {
    subject: `${a.vendorName} — contract work in ${a.becauseOf}?`,
    body:
      `Hi ${a.personName.trim().split(/\s+/)[0]} — ${a.vendorName} here.\n\n` +
      `We place contractors in ${a.becauseOf}, and your name came up because ${a.provenance}. ` +
      `That is the only reason you are hearing from us.\n\n` +
      `Are you open to contract work at the moment? If you are, tell us and we will keep an eye ` +
      `out for you. If not, say so and you will not hear from us or from anyone else here again.`,
  }
}

/**
 * Whether a firm has said, plainly enough, where it got somebody's
 * details.
 *
 * A short check on purpose. It cannot judge honesty; it can refuse the
 * empty string and the evasion, which is most of what goes wrong.
 * "Publicly available sources" tells the reader nothing and is exactly
 * what somebody writes when the honest answer is uncomfortable.
 */
export function provenanceIsSaid(s: string): boolean {
  const t = s.trim().toLowerCase()
  if (t.length < 20) return false
  const evasions = [
    'publicly available', 'public sources', 'our records', 'our database',
    'various sources', 'third parties', 'online',
  ]
  return !evasions.some((e) => t.includes(e))
}

// ── LinkedIn ──────────────────────────────────────────────────────────

/**
 * Checking somebody against LinkedIn before writing to them.
 *
 * The instinct is right: a record from 2020 saying somebody is a SAP
 * contractor may be six years stale, and the cheapest way to avoid
 * writing to a person who moved on years ago is to look.
 *
 * A person looking at a public profile is fine and always has been.
 * Software doing it is a different thing with a different answer.
 * Automated collection breaches LinkedIn's terms of service, they
 * enforce them, and the case usually cited as permission does not say
 * what it is remembered as saying — hiQ v. LinkedIn found that scraping
 * public pages was not unauthorised access under the CFAA, and hiQ then
 * lost on breach of contract. Not a crime and still a losing lawsuit.
 *
 * So the rule is the same one CLAUDE.md already sets for LinkedIn: it
 * is a field somebody pastes in, never something the system goes and
 * fetches. A recruiter may open a profile and record what they saw. The
 * product may not do it for them at a thousand records an hour.
 */
export const LINKEDIN_RULE =
  'A person may open a public profile and record what they found. The system never fetches one. ' +
  'Automated collection breaches LinkedIn\'s terms whatever the CFAA says about it, and a sourcing ' +
  'feature that gets the platform sued is not worth the leads.'

/** Whether a check was done by a human, which is the only kind allowed. */
export function checkIsAllowed(by: 'PERSON' | 'AUTOMATED'): boolean {
  return by === 'PERSON'
}
