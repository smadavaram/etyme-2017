/**
 * What a tenant asked for, and what should actually happen about it.
 *
 * ── The trap this is built to avoid ──────────────────────────────────
 *
 * A pipeline from user request to shipped feature is a machine for
 * building whatever anybody asks for. The 2017 build reached 4,197
 * commits and stalled on adoption rather than on engineering, and
 * CLAUDE.md is explicit about what that means now: building is cheap,
 * which makes over-building the primary risk.
 *
 * So the valuable stage here is not the build. It is the sentence that
 * says which of six things this is — and five of them are not "build it".
 *
 * ── Why the matrix makes this work ───────────────────────────────────
 *
 * Every request lands somewhere on the L1–L4 decomposition or it lands
 * nowhere, and that distinction does most of the triage on its own:
 *
 *   · maps to a BUILT process   → they could not find it. A navigation
 *     or wording problem, and the cheapest fix in the product.
 *   · maps to a PARTIAL process → finish what is there.
 *   · maps to a NONE process    → build it, and the owner is already known.
 *   · maps to nothing at all    → a scope decision, which is the
 *     founder's and nobody else's.
 *
 * The first of those is the most common verdict in any real product and
 * the one most likely to be misread as a feature request.
 *
 * ── What counts as signal ────────────────────────────────────────────
 *
 * Distinct tenants, never message volume. One person asking ten times is
 * one signal and an unhappy customer; ten people asking once is a
 * product gap. Confusing the two is how a loud minority sets a roadmap.
 *
 * And a demo click is not a customer. People trying something for free
 * ask for things they would never pay for, and the signal looks abundant
 * precisely because it costs nothing to produce.
 */

import { MATRIX, allProcesses, type Status } from '@/lib/matrix'
import { DOMAINS, type DomainKey } from '@/lib/domains'

export type Party = 'CLIENT' | 'MSP' | 'PRIME' | 'SUB' | 'BENCH_VENDOR' | 'CONSULTANT'

/**
 * What each party actually calls things.
 *
 * The reason intake is per-party rather than one form. A program manager
 * says "requisition"; a bench recruiter says "hotlist"; a consultant says
 * "my timesheet was short". Asking all three the same question in the
 * same words gets you three answers you cannot compare.
 */
export interface Voice {
  party: Party
  /** How they describe their own job. */
  callsItself: string
  /** Words they use that the product spells differently. */
  vocabulary: Record<string, string>
  /** What they are usually trying to do when they complain. */
  usuallyWants: string
}

export const VOICES: Voice[] = [
  {
    party: 'CLIENT',
    callsItself: 'the programme, or the hiring desk',
    vocabulary: {
      req: 'requirement', requisition: 'requirement', 'purchase req': 'requirement',
      'supplier': 'vendor company', 'MSA': 'master agreement',
      'headcount': 'requirement headcount', 'SOW': 'engagement',
    },
    usuallyWants:
      'To stop being surprised. By a rate, by somebody still on site after two ' +
      'years, by an invoice for work nobody approved.',
  },
  {
    party: 'MSP',
    callsItself: 'the programme office',
    vocabulary: {
      'supplier scorecard': 'vendor scorecard', 'tier': 'vendor tier',
      'distribution': 'requirement invitation', 'release': 'distribute',
    },
    usuallyWants:
      'To answer for a programme they do not staff themselves — which means ' +
      'evidence about suppliers rather than opinions about candidates.',
  },
  {
    party: 'PRIME',
    callsItself: 'the delivery unit, or the integrator',
    vocabulary: {
      'subcontractor': 'vendor company', 'pass-through': 'end client contract',
      'burn': 'bench burn', 'bench': 'bench listing',
    },
    usuallyWants:
      'To hold a client relationship while other people supply the work, without ' +
      'either side finding out how much of it is other people.',
  },
  {
    party: 'SUB',
    callsItself: 'a staffing vendor',
    vocabulary: {
      'req': 'requirement', 'sub out': 'buy contract', 'C2C': 'corp-to-corp',
      'RTR': 'right to represent', 'hotlist': 'bench listing',
    },
    usuallyWants:
      'To be paid for work already done, and to know whether the next placement ' +
      'is worth the effort before making it.',
  },
  {
    party: 'BENCH_VENDOR',
    callsItself: 'a bench, or a niche practice',
    vocabulary: {
      hotlist: 'bench listing', 'marketing': 'submission',
      'idle': 'bench days', 'on the bench': 'no active assignment',
    },
    usuallyWants:
      'To sell depth rather than speed. Their whole business is knowing people ' +
      'nobody else knows, and being visible without being disintermediated.',
  },
  {
    party: 'CONSULTANT',
    callsItself: 'a contractor, or just their job title',
    vocabulary: {
      'my hours': 'timesheet', 'my rate': 'pay rate',
      'my agency': 'their employer', 'RTR': 'right to represent',
    },
    usuallyWants:
      'To be paid the right amount on time, and to know who is putting them ' +
      'forward where. Everything else is somebody else’s problem.',
  },
]

export function voiceOf(party: Party): Voice {
  return VOICES.find((v) => v.party === party)!
}

// ── What a request is ─────────────────────────────────────────────────

export interface Request {
  id: string
  tenantId: string
  /** True where this tenant has never paid. Weighed differently. */
  isDemo: boolean
  party: Party
  /** Their words, not a summary of them. */
  said: string
  /** Which L3 the intake agent thinks it is. Null where it maps to none. */
  l3Code: string | null
  at: Date
  /** True where somebody is blocked right now rather than inconvenienced. */
  blocking?: boolean
}

export type Verdict =
  /** It exists. They could not find it. */
  | 'ALREADY_BUILT'
  /** The process exists and is half-done. */
  | 'FINISH_IT'
  /** The process exists on paper and nothing is coded. */
  | 'BUILD_IT'
  /** It maps to no process at all. A scope decision, and not ours. */
  | 'NEW_SCOPE'
  /** One customer's workflow rather than a product. */
  | 'ONE_CUSTOMER'
  /** Real, and belongs to a phase that has not started. */
  | 'LATER_PHASE'

export interface Triage {
  verdict: Verdict
  l3Code: string | null
  l3Name: string | null
  domain: DomainKey | null
  agent: string | null
  /** What actually happens next, in one sentence. */
  next: string
  /** Whether this may go to the founder yet. */
  needsFounder: boolean
  says: string
}

const STATUS_VERDICT: Record<Status, Verdict> = {
  BUILT: 'ALREADY_BUILT',
  PARTIAL: 'FINISH_IT',
  SPEC: 'BUILD_IT',
  NONE: 'BUILD_IT',
}

export function triage(r: Request): Triage {
  if (!r.l3Code) {
    return {
      verdict: 'NEW_SCOPE',
      l3Code: null, l3Name: null, domain: null, agent: null,
      next:
        'Nothing in the matrix covers this. Adding a process is a scope decision, ' +
        'and scope is the founder’s alone.',
      needsFounder: true,
      says:
        'This is not a feature request, it is a request to widen what the product ' +
        'is. Those are different questions and only one of them has an owner here.',
    }
  }

  const found = allProcesses().find((p) => p.l3.code === r.l3Code)
  if (!found) {
    return {
      verdict: 'NEW_SCOPE',
      l3Code: r.l3Code, l3Name: null, domain: null, agent: null,
      next: `No process by the code ${r.l3Code}. Somebody mistyped it, or it was renumbered.`,
      needsFounder: false,
      says: `${r.l3Code} does not exist in the matrix.`,
    }
  }

  const domain = found.l2.domain
  const agent = DOMAINS.find((d) => d.key === domain)?.agent ?? null
  const verdict = STATUS_VERDICT[found.l3.status]

  if (verdict === 'ALREADY_BUILT') {
    return {
      verdict, l3Code: found.l3.code, l3Name: found.l3.name, domain, agent,
      next:
        `It exists — ${found.l3.name}. Find out what they looked at and did not ` +
        `see. This is a navigation or wording fix, not a build.`,
      // The cheapest fix in the product. It does not need a decision.
      needsFounder: false,
      says:
        `They asked for something that is already there. That is the most common ` +
        `verdict in any working product and the one most often misread as a ` +
        `feature request — building it again would be the expensive answer to a ` +
        `cheap problem.`,
    }
  }

  return {
    verdict, l3Code: found.l3.code, l3Name: found.l3.name, domain, agent,
    next:
      verdict === 'FINISH_IT'
        ? `${found.l3.name} is half-built. ${agent} finishes it — the process, the owner and the acceptance criteria already exist.`
        : `${found.l3.name} is written down and not coded. ${agent} builds it against the L4 tasks already agreed.`,
    needsFounder: false,
    says:
      `This lands on an existing process, so nobody has to decide what it is — ` +
      `only when it is worth doing.`,
  }
}

// ── What counts as signal ─────────────────────────────────────────────

/** Distinct paying tenants, before anything reaches the founder. */
export const ENOUGH_TENANTS = 3

/**
 * A demo tenant's ask is worth something, and less.
 *
 * People trying a thing for free ask for what they would never pay for,
 * and the signal looks abundant precisely because it costs nothing to
 * produce. Counted, weighted, and never able to reach the founder alone.
 */
export const DEMO_WEIGHT = 0.25

export interface Theme {
  l3Code: string | null
  l3Name: string | null
  verdict: Verdict
  agent: string | null
  /** Distinct paying tenants who asked. The number that matters. */
  payingTenants: number
  demoTenants: number
  /** Message count, kept only to show that it is not what decides. */
  requests: number
  /** Which parties asked. The same gap felt by three kinds of firm is real. */
  parties: Party[]
  blocking: boolean
  weight: number
  /** Ready to put in front of the founder. */
  ready: boolean
  says: string
}

/**
 * Groups requests by the process they land on.
 *
 * Deliberately by process rather than by wording. Three tenants
 * describing the same gap in three vocabularies is one theme, and it is
 * exactly the case a keyword grouping would miss.
 */
export function cluster(requests: Request[]): Theme[] {
  const by = new Map<string, Request[]>()
  for (const r of requests) {
    const k = r.l3Code ?? `unmapped:${r.said.slice(0, 40).toLowerCase()}`
    by.set(k, [...(by.get(k) ?? []), r])
  }

  return [...by.values()].map((rows) => {
    const t = triage(rows[0])
    const paying = new Set(rows.filter((r) => !r.isDemo).map((r) => r.tenantId))
    const demo = new Set(rows.filter((r) => r.isDemo).map((r) => r.tenantId))
    const parties = [...new Set(rows.map((r) => r.party))]
    const blocking = rows.some((r) => r.blocking === true)

    const weight = paying.size + demo.size * DEMO_WEIGHT

    // Somebody blocked today goes up regardless of how many others agree.
    // Everything else waits for enough distinct paying tenants to have
    // said it, because one loud customer setting a roadmap is how a
    // product becomes one customer's internal tool.
    const ready = blocking || paying.size >= ENOUGH_TENANTS

    return {
      l3Code: t.l3Code, l3Name: t.l3Name, verdict: t.verdict, agent: t.agent,
      payingTenants: paying.size,
      demoTenants: demo.size,
      requests: rows.length,
      parties,
      blocking,
      weight,
      ready,
      says: saysFor(t, paying.size, demo.size, rows.length, parties, blocking),
    }
  })
}

function saysFor(
  t: Triage,
  paying: number,
  demo: number,
  requests: number,
  parties: Party[],
  blocking: boolean
): string {
  const who =
    paying === 0
      ? `${demo} demo tenant${demo === 1 ? '' : 's'} and nobody paying`
      : `${paying} paying tenant${paying === 1 ? '' : 's'}` +
        (demo > 0 ? ` and ${demo} on demo` : '')

  const across =
    parties.length > 1
      ? ` Felt by ${parties.length} different kinds of firm, which is the part worth noticing.`
      : ''

  const volume =
    requests > paying + demo
      ? ` ${requests} messages from ${paying + demo} tenants — the messages are not the signal.`
      : ''

  if (blocking) {
    return `Somebody is blocked right now. ${who}.${across}`
  }
  if (paying === 0 && demo > 0) {
    return (
      `${who}. Worth recording and not worth acting on yet — people trying ` +
      `something for free ask for what they would never pay for.${across}`
    )
  }
  return `${who}.${across}${volume}`
}

/**
 * Worst first — but "worst" is not "loudest".
 *
 * Blocked customers, then breadth of paying tenants, then how many
 * different kinds of firm feel it. Message count is carried on every row
 * and never sorts anything.
 */
export function rank(themes: Theme[]): Theme[] {
  return [...themes].sort(
    (a, b) =>
      Number(b.blocking) - Number(a.blocking) ||
      b.payingTenants - a.payingTenants ||
      b.parties.length - a.parties.length ||
      b.weight - a.weight
  )
}

// ── The gate ──────────────────────────────────────────────────────────

export interface ForFounder {
  themes: Theme[]
  /** Everything decided without him, so he can see the gate is doing work. */
  handled: number
  says: string
}

/**
 * What actually reaches a person, and what does not.
 *
 * A gate that opens ten times a day is a gate somebody stops reading, and
 * then it is theatre. So only two things reach him: a scope question,
 * which is nobody else's to answer, and a gap enough paying tenants have
 * hit. Everything else already has an owner and an acceptance criterion,
 * and asking him about it would be asking him to do somebody's job.
 */
export function forFounder(themes: Theme[]): ForFounder {
  const ranked = rank(themes)
  const raise = ranked.filter(
    (t) => t.ready && (t.verdict === 'NEW_SCOPE' || t.verdict === 'BUILD_IT' || t.blocking)
  )
  const handled = ranked.length - raise.length

  return {
    themes: raise,
    handled,
    says:
      raise.length === 0
        ? `Nothing needs you. ${handled} theme${handled === 1 ? '' : 's'} went ` +
          `to the agent that owns the process.`
        : `${raise.length} decision${raise.length === 1 ? '' : 's'} for you. ` +
          `${handled} handled without you — already built, or half-built with an ` +
          `owner who does not need permission to finish.`,
  }
}

/**
 * Matching a tenant's words to a process, before a model is asked.
 *
 * Rules first: arithmetic is free, instant and right, and roughly half of
 * what looks like it needs a model is a vocabulary lookup. A model runs
 * only on what survives this.
 */
export function guessProcess(said: string, party: Party): string[] {
  const v = voiceOf(party)
  let text = said.toLowerCase()

  // Their word for it, replaced with ours, before anything is matched.
  for (const [theirs, ours] of Object.entries(v.vocabulary)) {
    text = text.replaceAll(theirs.toLowerCase(), ours.toLowerCase())
  }

  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 3)

  return allProcesses()
    .map(({ l3 }) => {
      const name = l3.name.toLowerCase()
      const tasks = l3.tasks.join(' ').toLowerCase()
      // A word in the process name is worth more than the same word
      // buried in a task. "Bench" in "Bench matching" says what the
      // person is talking about; "bench" inside a sentence about
      // something else does not.
      const score =
        words.filter((w) => name.includes(w)).length * 2 +
        words.filter((w) => tasks.includes(w)).length
      return { code: l3.code, score }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.code)
}
