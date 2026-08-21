/**
 * What a submission package is checked for.
 *
 * The declaration, not the engine. Running the checks, writing the ledger
 * row, keeping the Check rows, counting the attempts, deciding the state
 * and feeding the human sample all belong to loop.ts — this file only says
 * what is true of a package that is fit to send.
 *
 * It used to hold a second copy of the loop as well, which is how the
 * harness built to stop drift ended up with two versions of decide().
 *
 * A submission leaves this building and lands in front of a client. If the
 * rate is above their ceiling, or the visa expires inside the contract, or
 * the CV never actually mentions the skill that was claimed, the client
 * does not send it back for correction — they stop calling. So the check
 * happens before it leaves, not after.
 *
 * ── The shape ────────────────────────────────────────────────────────
 *
 * Not a long-running process. A status field on the record, and each call
 * moves it exactly one step:
 *
 *   DRAFT → CHECKING → NEEDS_FIX → CHECKING → READY → SENT
 *                   ↘ READY
 *
 * Every step is restartable, every step is logged, and a crash halfway
 * leaves a record somebody can look at rather than a process nobody can
 * find. Three attempts, then it stops and asks a person — a loop that
 * cannot get there in three tries is not going to get there in ten, and
 * each try costs money.
 *
 * ── Rules first, and mostly only rules ───────────────────────────────
 *
 * Rate inside range, permit unexpired, document present, available in the
 * window — arithmetic and date comparison. Free, instant, right every
 * time. They run first and they run always.
 *
 * Exactly one question needs a model: is the skill claim actually
 * evidenced in the CV. That one is worth paying for and the rest are not.
 * Roughly half of what looks like AI in this product is not AI at all, and
 * that is a feature.
 *
 * ── The rule that cannot be broken ───────────────────────────────────
 *
 * A machine check is never the last word on another machine's work. The
 * model check writes a Check row a person can be shown later, and the
 * sample review is a separate surface. An agent grading its own homework
 * reports 96% accuracy while clients quietly stop calling, and by the time
 * anybody notices the ledger has been lying for months.
 */

import type { Finding, Step } from '@/lib/loop'

export type Code =
  /** The rate we are asking is inside what the role will pay. */
  | 'RATE_IN_RANGE'
  /** There is a CV attached at all. */
  | 'CV_ATTACHED'
  /** Right-to-work, visa, certificates — present and unexpired. */
  | 'DOCS_PRESENT'
  /** They can start when the role starts. */
  | 'AVAILABLE_IN_WINDOW'
  /** The permit matches what the role requires. */
  | 'WORK_AUTH'
  /** The person agreed to be put forward for this one. */
  | 'CONSENT'
  /** The skills claimed are actually in the CV. The one model judgement. */
  | 'SKILLS_EVIDENCED'
  /** The rate against what has actually cleared for work like this. */
  | 'RATE_VS_MARKET'

/** Three, then ask a person. */
export const MAX_ATTEMPTS = 3

// ── What is being checked ─────────────────────────────────────────────

export interface Package {
  personName: string
  /** What we are asking for this person, cents per hour. */
  rateCents: number | null
  /** What the role will pay, cents per hour. */
  billMin: number | null
  billMax: number | null
  /** The CV version actually attached to this submission. */
  resumeId: string | null
  /** Skills claimed on the submission or the profile. */
  claimedSkills: string[]
  /** Documents on file, with their expiry where they have one. */
  documents: { kind: string; expiresAt: Date | null }[]
  /** Documents this role or client insists on. */
  documentsRequired: string[]
  availableFrom: Date | null
  startDate: Date | null
  workAuth: string | null
  workAuthRequired: string | null
  /** Whether the person said yes to this specific submission. */
  consented: boolean
}

// ── The rules ─────────────────────────────────────────────────────────

/**
 * Everything arithmetic can settle, settled.
 *
 * Order matters on screen: the things a recruiter can fix in ten seconds
 * come first, so the list reads as work rather than as a verdict.
 */
export function ruleChecks(p: Package, now: Date): Finding[] {
  const out: Finding[] = []

  // ── Rate ──
  if (p.rateCents == null) {
    out.push({
      code: 'RATE_IN_RANGE',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: 'No rate on this submission. The client will not read it without one.',
    })
  } else if (p.billMax != null && p.rateCents > p.billMax) {
    out.push({
      code: 'RATE_IN_RANGE',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `Asking $${cents(p.rateCents)} on a role that tops out at $${cents(p.billMax)}. Drop the rate or say why it is worth more.`,
      evidence: `${p.rateCents} > ${p.billMax}`,
    })
  } else if (p.billMin != null && p.rateCents < p.billMin) {
    // Under the floor is not a refusal. Sometimes it is deliberate, and a
    // check that blocks a decision somebody made on purpose gets overridden
    // until nobody reads any of them.
    out.push({
      code: 'RATE_IN_RANGE',
      checker: 'RULE',
      verdict: 'PASS',
      reason: `Below the bottom of the range at $${cents(p.rateCents)}. Fine if that is deliberate.`,
      evidence: `${p.rateCents} < ${p.billMin}`,
    })
  } else {
    out.push({
      code: 'RATE_IN_RANGE',
      checker: 'RULE',
      verdict: 'PASS',
      reason: p.rateCents != null ? `$${cents(p.rateCents)}, inside the range.` : 'Rate in range.',
    })
  }

  // ── The CV ──
  out.push(
    p.resumeId
      ? { code: 'CV_ATTACHED', checker: 'RULE', verdict: 'PASS', reason: 'CV attached.' }
      : {
          code: 'CV_ATTACHED',
          checker: 'RULE',
          verdict: 'FAIL',
          reason: `${p.personName} has no CV on this submission. The client reads the CV, not the row.`,
        }
  )

  // ── Documents ──
  const held = new Map(p.documents.map((d) => [d.kind.toUpperCase(), d]))
  const missing: string[] = []
  const expired: string[] = []

  for (const need of p.documentsRequired) {
    const doc = held.get(need.toUpperCase())
    if (!doc) missing.push(need)
    else if (doc.expiresAt && doc.expiresAt < now) expired.push(need)
  }

  if (missing.length === 0 && expired.length === 0) {
    out.push({
      code: 'DOCS_PRESENT',
      checker: 'RULE',
      verdict: 'PASS',
      reason:
        p.documentsRequired.length === 0
          ? 'No documents required for this one.'
          : `${p.documentsRequired.length} required document${p.documentsRequired.length === 1 ? '' : 's'} present and in date.`,
    })
  } else {
    const said: string[] = []
    if (missing.length) said.push(`missing ${missing.join(', ')}`)
    if (expired.length) said.push(`expired ${expired.join(', ')}`)
    out.push({
      code: 'DOCS_PRESENT',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `Documents: ${said.join('; ')}.`,
      evidence: [...missing, ...expired].join(', '),
    })
  }

  // ── Availability ──
  if (p.availableFrom && p.startDate && p.availableFrom > p.startDate) {
    const days = Math.ceil((p.availableFrom.getTime() - p.startDate.getTime()) / 86400000)
    out.push({
      code: 'AVAILABLE_IN_WINDOW',
      checker: 'RULE',
      verdict: days > 30 ? 'FAIL' : 'PASS',
      reason:
        days > 30
          ? `Free ${days} days after the role starts. Say so in the note, or send somebody else.`
          : `Free ${days} days late, which usually holds.`,
      evidence: `${p.availableFrom.toISOString().slice(0, 10)} vs ${p.startDate.toISOString().slice(0, 10)}`,
    })
  } else {
    out.push({
      code: 'AVAILABLE_IN_WINDOW',
      checker: 'RULE',
      verdict: 'PASS',
      reason: 'Free when the role starts.',
    })
  }

  // ── Work authorisation ──
  if (
    p.workAuthRequired &&
    p.workAuth &&
    p.workAuthRequired.toUpperCase() !== p.workAuth.toUpperCase()
  ) {
    out.push({
      code: 'WORK_AUTH',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `Role needs ${p.workAuthRequired}; they are ${p.workAuth}.`,
      evidence: `${p.workAuth} ≠ ${p.workAuthRequired}`,
    })
  } else if (p.workAuthRequired && !p.workAuth) {
    out.push({
      code: 'WORK_AUTH',
      checker: 'RULE',
      verdict: 'FAIL',
      reason: `Role needs ${p.workAuthRequired} and nothing is recorded for them. Ask before sending.`,
    })
  } else {
    out.push({
      code: 'WORK_AUTH',
      checker: 'RULE',
      verdict: 'PASS',
      reason: p.workAuthRequired ? `${p.workAuth} matches.` : 'Role does not specify one.',
    })
  }

  // ── Consent ──
  //
  // Not paperwork. Consultants get submitted blind constantly and it burns
  // them, and when two vendors put the same person forward the client
  // rejects both. One question prevents it, and the answer is worth having
  // written down when somebody asks later.
  out.push(
    p.consented
      ? { code: 'CONSENT', checker: 'RULE', verdict: 'PASS', reason: 'They said yes to this one.' }
      : {
          code: 'CONSENT',
          checker: 'RULE',
          verdict: 'FAIL',
          reason: `${p.personName} has not agreed to this submission. Ask before sending — being submitted blind is what makes consultants stop answering.`,
        }
  )

  return out
}

/**
 * The rate against what has actually cleared, for work like this.
 *
 * This is the outcome loop turning. Rate is the commonest reason a
 * submission dies, and it is the one reason knowable in advance — because
 * we watched other people get rejected above this number at this kind of
 * client.
 *
 * Always a PASS. It is advice built from a description of the past, and a
 * check that blocks on advice gets overridden until nobody reads any of
 * them. What it does is put the number in front of somebody at the moment
 * they can still change it.
 */
export function marketCheck(warning: {
  say: boolean
  where: 'ABOVE' | 'BELOW' | null
  text: string
}): Finding | null {
  if (!warning.say) return null

  return {
    code: 'RATE_VS_MARKET',
    checker: 'RULE',
    verdict: 'PASS',
    reason: warning.text,
    evidence: warning.where,
  }
}

function cents(n: number): string {
  return String(Math.round(n / 100))
}

// ── The loop ──────────────────────────────────────────────────────────

/**
 * The prompt for the only question here worth paying for.
 *
 * Not "is this a good match" — that is the match engine's job and it has
 * already run. This asks one narrow, checkable thing: for each skill we
 * are claiming, is there a line in the CV that supports it, and which
 * line. A quote or a no.
 *
 * Narrow on purpose. A check that returns an opinion cannot be reviewed by
 * a person in ten seconds, and a check no person reviews is a check that
 * has quietly stopped working.
 */
export function evidencePrompt(claimed: string[], cvText: string): string {
  return `For each claimed skill, find the line in this CV that supports it.

CLAIMED SKILLS: ${claimed.join(', ')}

CV:
${cvText}

Return a JSON array, one element per claimed skill:
- skill: the claimed skill, exactly as given
- found: true or false
- quote: the line from the CV that supports it, verbatim, or null

Rules:
- A quote must appear in the CV word for word. Do not paraphrase.
- Related is not the same as evidenced. "Next.js" supports a React claim;
  "interested in Kubernetes" does not support a Kubernetes claim.
- Where you cannot find it, say found: false. A missing skill is an
  ordinary answer, not a failure.

Return ONLY the JSON array.`
}

export interface Evidenced {
  skill: string
  found: boolean
  quote: string | null
}

/**
 * Turn what the model said into a check.
 *
 * A quote that is not actually in the CV is treated as not found. The
 * check exists to stop unevidenced claims reaching a client, and a
 * fabricated quote is the worst possible thing for it to pass.
 */
export function evidenceCheck(
  claimed: string[],
  answers: Evidenced[],
  cvText: string
): Finding {
  const verified = answers.filter(
    (a) => a.found && a.quote != null && cvText.toLowerCase().includes(a.quote.toLowerCase().trim())
  )

  const invented = answers.filter(
    (a) => a.found && a.quote != null && !cvText.toLowerCase().includes(a.quote.toLowerCase().trim())
  )

  const missing = claimed.filter(
    (s) => !verified.some((v) => v.skill.toLowerCase() === s.toLowerCase())
  )

  if (missing.length === 0) {
    return {
      code: 'SKILLS_EVIDENCED',
      checker: 'MODEL',
      verdict: 'PASS',
      reason: `All ${claimed.length} claimed skills are in the CV.`,
      evidence: verified.map((v) => `${v.skill}: "${v.quote}"`).join(' · '),
    }
  }

  const note = invented.length
    ? ` (${invented.length} quoted line${invented.length === 1 ? '' : 's'} could not be found in the CV and ${invented.length === 1 ? 'was' : 'were'} discounted)`
    : ''

  return {
    code: 'SKILLS_EVIDENCED',
    checker: 'MODEL',
    verdict: 'FAIL',
    reason: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} claimed but not in the CV. Either take the claim off or update the CV${note}.`,
    evidence: verified.map((v) => `${v.skill}: "${v.quote}"`).join(' · ') || null,
  }
}
