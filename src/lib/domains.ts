/**
 * Who owns which file.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Several specialists working at once is faster than one generalist, and
 * it is faster only while they do not touch the same files. The moment
 * two of them edit `profitability.ts` in the same hour, somebody has to
 * adjudicate a merge conflict — and the person this product is built for
 * cannot read code, so that somebody does not exist.
 *
 * So parallelism here is bought with a boundary, not with coordination.
 * Every file under `src/` belongs to exactly one domain. A domain agent
 * may write inside its own boundary without asking anybody. It may not
 * write outside it at all.
 *
 * ── The one thing everybody needs and nobody owns ────────────────────
 *
 * The schema. Every domain wants a column and they all want it in the
 * same file, so `prisma/schema.prisma` belongs to no domain and changes
 * to it serialise through the architect. That is the single queue in an
 * otherwise parallel system, and it is deliberate: a schema is the one
 * artefact where two correct changes can still produce a wrong result.
 *
 * ── Why it is a test and not a wiki page ─────────────────────────────
 *
 * A wiki page describing who owns what is a page that is wrong within a
 * month. `__tests__/invariants/domains.test.ts` fails when a new file has
 * no owner or two, which means the map cannot rot without somebody
 * noticing on the same commit.
 */

export type DomainKey =
  | 'REGULATORY'
  | 'MONEY'
  | 'CONVERSATION'
  | 'DEMAND'
  | 'SUPPLY'
  | 'MARKET'
  | 'PLATFORM'

export interface Domain {
  key: DomainKey
  /** The agent that owns it. Matches a file in .claude/agents. */
  agent: string
  label: string
  /** What this specialist actually knows, in a sentence. */
  knows: string
  /** The L2 groups from the delivery matrix this domain answers for. */
  l2: string[]
  /** Path fragments, matched against a repo-relative path. */
  owns: string[]
}

export const DOMAINS: Domain[] = [
  {
    key: 'REGULATORY',
    agent: 'etyme-regulatory',
    label: 'Documents and regulation',
    knows:
      'What may be asked for and when, in which country. Work authorisation, ' +
      'background verification, classification, tenure and co-employment, and the ' +
      'difference between attesting that a check happened and declaring a person fit.',
    l2: ['L2.2.3', 'L2.7.1', 'L2.7.3'],
    owns: [
      'app/dashboard/governance', 'app/dashboard/tenure', 'app/dashboard/blacklist',
      'app/api/governance', 'app/api/tenure', 'app/api/blacklist', 'app/api/bar',
      'app/api/roles', 'app/api/documents', 'app/api/document-shares',
      'app/api/shared', 'app/api/packet', 'app/packet',
      'lib/document-stages', 'lib/packets', 'lib/packet-derivation', 'lib/attestation',
      'lib/worker-classification', 'lib/holds', 'lib/representation',
      'lib/governance', 'lib/governance-authorship', 'lib/governance-horizon',
      'lib/requisition-approval', 'lib/document-share', 'lib/template-packs',
      'lib/access-log', 'lib/access-grant', 'lib/walls', 'lib/account-walls',
      'lib/permissions', 'lib/seat', 'lib/persona',
      'lib/outbound-pack',
      'app/dashboard/packets', 'app/dashboard/compliance', 'app/dashboard/access',
      'app/dashboard/outbound-pack', 'app/api/outbound-pack',
      'app/api/packets', 'app/api/compliance', 'app/api/access',
    ],
  },
  {
    key: 'MONEY',
    agent: 'etyme-money',
    label: 'Money',
    knows:
      'Cycle arithmetic, the project order, the journal, pay models, burden, bench ' +
      'reserves, two currencies, and the difference between what was earned and what ' +
      'has actually been paid. Refuses to show a number it cannot stand behind.',
    l2: ['L2.4.1', 'L2.4.2', 'L2.4.3', 'L2.5.1', 'L2.5.2', 'L2.5.3', 'L2.6.1', 'L2.6.2'],
    owns: [
      'app/dashboard/rate-history', 'app/dashboard/reports',
      'app/api/rate-history', 'app/api/holidays', 'app/api/contracts',
      'app/dashboard/contracts',
      'lib/order', 'lib/order-postings', 'lib/gl', 'lib/profitability',
      'lib/pay-model', 'lib/bench-policy', 'lib/money', 'lib/money-display',
      'lib/periods', 'lib/recurring', 'lib/cycle-generator', 'lib/holidays',
      'lib/invoice-loop', 'lib/invoice-match', 'lib/billing-cascade', 'lib/billing-plan',
      'lib/payroll-export', 'lib/three-way-match', 'lib/purchase-order',
      'lib/cost-allocation', 'lib/contract-rate', 'lib/expense-approval',
      'lib/loose-ends', 'lib/erp-profiles', 'lib/ar-ageing', 'lib/credit',
      'lib/ap-delay', 'app/api/ap', 'app/dashboard/ap',
      'app/api/ar', 'app/dashboard/ar',
      'app/dashboard/profitability', 'app/dashboard/invoices', 'app/dashboard/payroll',
      'app/dashboard/expenses', 'app/dashboard/purchase-orders', 'app/dashboard/loose-ends',
      'app/api/profitability', 'app/api/invoices', 'app/api/payroll', 'app/api/expenses',
      'app/api/purchase-orders', 'app/api/loose-ends', 'app/api/cycles',
    ],
  },
  {
    key: 'CONVERSATION',
    agent: 'etyme-conversation',
    label: 'Conversation',
    knows:
      'Every message the system sends, from first contact to last invoice. Which ' +
      'channel a population is reachable on, when a nudge is welcome and when it is ' +
      'noise, and how to write to somebody who did not ask to hear from you.',
    l2: ['L2.1.3', 'L2.3.2'],
    owns: [
      'app/dashboard/conversations', 'app/dashboard/texts',
      'app/api/conversations', 'app/api/texts', 'app/api/events',
      'app/answer', 'app/claim',
      'lib/notify', 'lib/notification-delivery', 'lib/texts', 'lib/sms',
      'lib/reaching-out', 'lib/senders', 'lib/forwarding', 'lib/interviews',
      'lib/timesheet-signatures', 'lib/page-framing',
      'lib/watch', 'lib/events',
      'app/dashboard/interviews', 'app/dashboard/notifications',
      'app/api/interviews', 'app/api/notifications', 'app/api/answer', 'app/api/claim',
    ],
  },
  {
    key: 'DEMAND',
    agent: 'etyme-demand',
    label: 'Buying talent',
    knows:
      'Everything from a manager needing somebody to a person being chosen — across ' +
      'a client, a GSI, a prime, a sub and a bench vendor at once. Requisitions, ' +
      'invitations, submissions, screening, the award and the seat.',
    l2: ['L2.1.1', 'L2.1.3', 'L2.2.1'],
    owns: [
      'app/dashboard/requisitions', 'app/dashboard/invitations', 'app/dashboard/leads',
      'app/dashboard/decisions', 'app/dashboard/program',
      'app/api/requisitions', 'app/api/invitations', 'app/api/leads',
      'app/api/openings', 'app/api/decisions', 'app/api/program',
      'app/api/checks', 'app/api/why',
      'lib/openings', 'lib/lead-reader', 'lib/requirement-quality',
      'lib/screening', 'lib/checks', 'lib/award', 'lib/first-good',
      'lib/invitation-visibility', 'lib/outcomes', 'lib/review',
      'lib/resolve-client-company', 'lib/resolve-end-client',
      'lib/timesheet-authority', 'lib/timesheet-reversal', 'lib/work-ledger',
      'lib/auto-approval', 'lib/buyer-reputation', 'lib/one-person',
      'lib/join-companies', 'lib/identity-resolution', 'lib/supplier-list',
      'app/dashboard/requirements', 'app/dashboard/submissions', 'app/dashboard/suppliers',
      'app/dashboard/timesheets', 'app/dashboard/people', 'app/dashboard/identity',
      'app/api/requirements', 'app/api/submissions', 'app/api/suppliers',
      'app/api/timesheets', 'app/api/people', 'app/api/identity', 'app/api/first-good',
    ],
  },
  {
    key: 'SUPPLY',
    agent: 'etyme-supply',
    label: 'Selling talent',
    knows:
      'The bench as a business. What a niche specialist actually does: attract ' +
      'people nobody else can find, keep them warm between assignments, and sell ' +
      'them on evidence rather than a forwarded CV. Matching, burn, rolloff.',
    l2: ['L2.1.2', 'L2.7.2'],
    owns: [
      'app/dashboard/alumni', 'app/dashboard/my-benches', 'app/dashboard/my-page',
      'app/dashboard/training',
      'app/api/alumni', 'app/api/releasing-soon', 'app/api/benchmark',
      'lib/match-engine', 'lib/candidate-fit', 'lib/bench-filter', 'lib/why',
      'lib/releasing-soon', 'lib/shared-consultant', 'lib/scorecard',
      'lib/benchmark', 'lib/resumes', 'lib/cv-reader', 'lib/extract',
      'lib/consultant-portfolio', 'lib/portfolio-data', 'lib/onboarding',
      'app/dashboard/bench', 'app/dashboard/consultants', 'app/dashboard/rolloff',
      'app/dashboard/scorecards', 'app/dashboard/my-standing', 'app/dashboard/my-work',
      'app/api/bench', 'app/api/consultants', 'app/api/rolloff', 'app/api/vendors',
      'app/api/me', 'app/api/resumes',
    ],
  },
  {
    key: 'MARKET',
    agent: 'etyme-market',
    label: 'The market',
    knows:
      'What Etyme says it is, to people who have never heard of it. The home page, ' +
      'the generated company sites, lead capture and nurture, and the distribution ' +
      'of requirements and bench candidates up and down a chain without breaching ' +
      'an NDA on the way.',
    l2: ['L2.1.4'],
    owns: [
      'lib/positioning', 'lib/site-voice', 'lib/public-site', 'lib/distribution',
      'app/page', 'app/site', 'app/c', 'app/api/c',
      'app/dashboard/market', 'app/api/market', 'app/api/site',
    ],
  },
  {
    key: 'PLATFORM',
    agent: 'etyme-architect',
    label: 'Platform',
    knows:
      'The things every domain depends on and none of them may change alone: the ' +
      'schema, the database client, authentication, company identity, the design ' +
      'system, and the agent loop itself.',
    l2: ['L2.2.2', 'L2.6.3'],
    owns: [
      'app/dashboard/page', 'app/dashboard/shell', 'app/dashboard/import',
      'app/(auth)',
      'app/api/settings', 'app/api/imports', 'app/api/integrations',
      'app/api/onboarding', 'app/api/automation',
      'lib/evals', 'middleware',
      'lib/db', 'lib/auth', 'lib/api-context', 'lib/domains', 'lib/matrix',
      'lib/feedback',
      'lib/company-defaults', 'lib/company-domains', 'lib/domains-owned',
      'lib/registrable-domain', 'lib/account-lifecycle',
      'lib/service-accounts', 'lib/import-mapper', 'lib/importable',
      'lib/loop', 'lib/agent-run', 'lib/demo-seed', 'lib/demo-seed-client',
      'lib/demo-session',
      'app/layout', 'app/login', 'app/start',
      'app/dashboard/layout', 'app/dashboard/settings', 'app/dashboard/companies',
      'app/dashboard/data', 'app/dashboard/automation', 'app/dashboard/checks',
      'app/api/health', 'app/api/demo', 'app/api/auth', 'app/api/companies',
      'app/api/cron', 'app/api/import',
      'components/',
    ],
  },
]

/**
 * Files that belong to nobody, and change through the architect only.
 *
 * The schema is here because every domain wants a column in the same
 * file. It is the one artefact where two individually correct changes can
 * still produce a wrong result, so it gets the single queue.
 */
export const SHARED: string[] = [
  'prisma/schema.prisma',
  'package.json',
  'CLAUDE.md',
  'BUILD.md',
  'tailwind.config',
  'next.config',
  'src/app/globals.css',
]

export function domainOf(path: string): Domain | null {
  const p = path.replace(/^\.?\/?/, '').replace(/^src\//, '')

  // Longest match wins, so 'app/api/requirements' beats a shorter prefix
  // that happens to share its opening.
  let best: { d: Domain; len: number } | null = null
  for (const d of DOMAINS) {
    for (const own of d.owns) {
      // Trailing slashes are how people write directories, and a needle
      // of 'components/' must still match 'components/logo.tsx'.
      const needle = own.replace(/^src\//, '').replace(/\/$/, '')
      if (p === needle || p.startsWith(needle + '/') || p.startsWith(needle + '.')) {
        if (!best || needle.length > best.len) best = { d, len: needle.length }
      }
    }
  }
  return best?.d ?? null
}

export function isShared(path: string): boolean {
  const p = path.replace(/^\.?\/?/, '')
  return SHARED.some((s) => p === s || p.startsWith(s))
}

export interface Verdict {
  mayWrite: boolean
  owner: DomainKey | null
  says: string
}

/**
 * Whether a given agent may write a given file.
 *
 * Called before an edit, not after. An agent that discovers it was out of
 * bounds by breaking somebody else's tests has already cost more than the
 * check would have.
 */
export function mayWrite(agent: string, path: string): Verdict {
  if (isShared(path)) {
    return agent === 'etyme-architect'
      ? { mayWrite: true, owner: 'PLATFORM', says: `${path} is shared. You hold the queue for it.` }
      : {
          mayWrite: false,
          owner: null,
          says:
            `${path} is shared and changes to it serialise through the architect. ` +
            `Say what you need and why; do not edit it.`,
        }
  }

  const d = domainOf(path)
  if (!d) {
    return {
      mayWrite: false,
      owner: null,
      says:
        `${path} has no owner. A file nobody owns is a file two agents will edit ` +
        `in the same hour. Add it to a domain in lib/domains.ts first.`,
    }
  }

  if (d.agent === agent) {
    return { mayWrite: true, owner: d.key, says: `Yours — ${d.label}.` }
  }

  return {
    mayWrite: false,
    owner: d.key,
    says:
      `${path} belongs to ${d.label} (${d.agent}). Ask them for the change rather ` +
      `than making it — two agents in one file is a merge conflict nobody here can adjudicate.`,
  }
}
