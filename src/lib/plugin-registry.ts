/**
 * The plugin registry (records 120 to 124, 132, 133): ONE declaration per
 * plugin. The settings list, the Superadmin switch, the menu doors, the
 * route gate, the micro-site gate, the agent gate and the Owner's usage
 * reading all derive from it. Pure: no database, so the menu (which a
 * browser bundle reads) and the tests can import it.
 *
 * To add a plugin, follow docs/plugins.md. A test fails when a route, page,
 * agent or menu door that belongs to a plugin is not declared here, and when
 * a declared one is not gated.
 */

export type PluginKey = 'TRAIN_TO_BENCH' | 'PODS' | 'WEBSITE' | 'OUTREACH' | 'PUBLIC_SECTOR'

/** A kind of company, as the schema names it. */
export type OfferedKind = 'VENDOR' | 'GSI' | 'MSP' | 'CONSULTANT_CORP' | 'UNCLASSIFIED' | 'CLIENT'

/** The companies that sell. A company that only buys (CLIENT) is offered no plugin and is never told they exist. */
export const SUPPLIER_KINDS: readonly OfferedKind[] = ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP', 'UNCLASSIFIED']

/**
 * How a route of a plugin is kept:
 *  - GATE: it calls `pluginGate(caller, KEY)` and says one sentence while the plugin is off.
 *  - MICRO_SITE: it reads the micro-site's own reader (`learnTenant`), so an off firm reads as no firm.
 *  - OPEN: left open on purpose, with the reason. An open route is never a forgotten one.
 */
export type RouteKeeping = 'GATE' | 'MICRO_SITE' | 'OPEN'
export type PluginRoute = { prefix: string; by: RouteKeeping; why?: string }

/** What a plugin does while it is off. `SENDS` holds only what leaves the firm: drafting stays open (record 122). */
export type WhenOff = 'EVERYTHING' | 'SENDS'

/** A hold that stops it turning on: closed until built (Project teams), or three checks (Website). */
export type OnHold = 'CLOSED_UNTIL_BUILT' | 'WEBSITE_THREE_CHECKS' | null

export type PluginDecl = {
  key: PluginKey
  label: string
  says: string
  /** Position in every list: settings, the Superadmin picker, the Owner's usage. */
  order: number
  /** The kinds of company the plugin is offered to. */
  offeredTo: readonly OfferedKind[]
  /** The plugin's own micro-site: its root path, or null where it has none. */
  microSite: string | null
  /** The menu links it draws, and only while it is on. */
  doors: readonly string[]
  /** Pages that belong to it and are not menu links. */
  pages: readonly string[]
  /** Pages of it that stay in the menu while it is off, with the reason (Outreach drafting stays open). */
  openPages: readonly { path: string; why: string }[]
  /** Every API prefix that belongs to it, and how each is kept. The longest prefix wins. */
  routes: readonly PluginRoute[]
  /** The agents that run for it (keys in FIRM_AGENTS). An agent not declared here is never stopped by the switch. */
  agents: readonly string[]
  /** The automation actions its agents may write. An act outside this list is refused. */
  actions: readonly string[]
  /** The twin act kinds (lib/autonomy) its agents may take. None is a floor, a money or a sign act. */
  actKinds: readonly string[]
  whenOff: WhenOff
  onHold: OnHold
  /** Live before the switch existed and keeps going until an Owner switches it off (record 123). */
  grandfathered: boolean
  /** The L3 row in lib/matrix that records what is built. */
  matrixRow: string
}

export const PLUGIN_REGISTRY: readonly PluginDecl[] = [
  {
    key: 'TRAIN_TO_BENCH', label: 'Train to bench', order: 1,
    says: 'Courses and cohorts for your people, and a trainee who finishes joins your bench with her own yes.',
    offeredTo: SUPPLIER_KINDS,
    microSite: '/learn',
    doors: ['/dashboard/training'],
    pages: ['/dashboard/training', '/learn'],
    openPages: [],
    routes: [
      { prefix: '/api/training', by: 'GATE' },
      { prefix: '/api/learn', by: 'GATE' },
      { prefix: '/api/learn/[tenant]', by: 'MICRO_SITE' },
    ],
    agents: [], actions: [], actKinds: [],
    whenOff: 'EVERYTHING', onHold: null, grandfathered: false,
    matrixRow: 'L3.1.2.13',
  },
  {
    key: 'PODS', label: 'Project teams', order: 2,
    says: 'Named teams sold as a project, with deliverables the client accepts and milestones billed from them.',
    offeredTo: SUPPLIER_KINDS,
    microSite: null,
    doors: ['/dashboard/pods'],
    pages: ['/dashboard/pods'],
    openPages: [],
    routes: [
      { prefix: '/api/pods', by: 'GATE' },
      { prefix: '/api/program/pods', by: 'OPEN', why: 'The client keeps reading and deciding what it bought as a team whether or not the seller has the plugin on, so money already owed is never stranded (record 120).' },
    ],
    agents: [], actions: [], actKinds: [],
    whenOff: 'EVERYTHING', onHold: 'CLOSED_UNTIL_BUILT', grandfathered: false,
    matrixRow: 'L3.1.2.11',
  },
  {
    key: 'WEBSITE', label: 'Website and content', order: 3,
    says: 'Your public site and the editor for its words. The site goes public after three checks: your branding, your domain, and any compliance pass.',
    offeredTo: SUPPLIER_KINDS,
    microSite: '/site',
    doors: [],
    pages: ['/site'],
    openPages: [],
    routes: [
      { prefix: '/api/settings/site', by: 'GATE' },
      { prefix: '/api/settings/site-branding', by: 'OPEN', why: 'It records the Owner’s branding yes, which is one of the three checks the switch needs before it may turn on, so it cannot wait for the switch.' },
      { prefix: '/api/settings/website-checks', by: 'OPEN', why: 'It reads and records the three checks the switch needs before it may turn on, so it cannot wait for the switch.' },
    ],
    agents: [], actions: [], actKinds: [],
    whenOff: 'EVERYTHING', onHold: 'WEBSITE_THREE_CHECKS', grandfathered: true,
    matrixRow: 'L3.2.2.30',
  },
  {
    key: 'OUTREACH', label: 'Outreach', order: 4,
    says: 'Letters that sell your firm: outreach batches, their follow-ups and check-ins with companies gone quiet. Drafting stays open while it is off.',
    offeredTo: SUPPLIER_KINDS,
    microSite: null,
    doors: [],
    pages: [],
    openPages: [{ path: '/dashboard/companies/outreach', why: 'Drafting stays open while Outreach is off; only the letters that sell are held (record 122).' }],
    routes: [
      { prefix: '/api/outreach', by: 'OPEN', why: 'Drafting and previewing stay open while Outreach is off; only the letters that sell are held, at the send, under the task’s own yes (records 122, 123).' },
    ],
    agents: ['outreach-batch'],
    actions: [
      'OUTREACH_LETTER_SENT', 'OUTREACH_FOLLOW_UP_SENT', 'OUTREACH_LETTER_NOT_SENT',
      'DORMANT_OUTREACH_NO_OWNER', 'DORMANT_OUTREACH_NOT_DRAFTED', 'DORMANT_OUTREACH_PROPOSED', 'DORMANT_OUTREACH_SENT', 'DORMANT_OUTREACH_NOT_SENT',
    ],
    actKinds: [],
    whenOff: 'SENDS', onHold: null, grandfathered: false,
    matrixRow: 'L3.2.2.31',
  },
  {
    key: 'PUBLIC_SECTOR', label: 'Public-sector proposals', order: 5,
    says: 'Record a public bid, draft the response from your own record, and track its deadlines. A person approves and submits.',
    offeredTo: SUPPLIER_KINDS,
    microSite: null,
    doors: ['/dashboard/proposals'],
    pages: ['/dashboard/proposals'],
    openPages: [],
    routes: [
      { prefix: '/api/proposals', by: 'GATE' },
      { prefix: '/api/diversity', by: 'GATE' },
      // Supplier diversity (record 132) sits on the Proposals page; its certifications and attestations are gated the same way.
      { prefix: '/api/governance/certifications', by: 'GATE' },
      { prefix: '/api/governance/ownership-attestations', by: 'GATE' },
      // A shared route that serves many record types: it gates the proposal types and no others.
      { prefix: '/api/records/[type]/[id]', by: 'GATE', why: 'Gates the proposal record types it serves; every other record type is not a plugin\u2019s.' },
    ],
    agents: ['proposals-agent'],
    actions: ['PROPOSAL_DRAFTED', 'PROPOSAL_CHECKED', 'PROPOSAL_ASKED', 'PROPOSAL_CHASE_PROPOSED', 'PROPOSAL_CHASE_SENT', 'PROPOSAL_CHASE_NOT_SENT', 'REGISTRATION_DRAFTED'],
    actKinds: ['proposal.draft', 'proposal.ask', 'proposal.chase', 'registration.draft'],
    whenOff: 'EVERYTHING', onHold: null, grandfathered: false,
    matrixRow: 'L3.2.2.32',
  },
]

export const PLUGIN_KEYS: readonly PluginKey[] = PLUGIN_REGISTRY.map((p) => p.key)

export function declOf(key: string): PluginDecl | null {
  return PLUGIN_REGISTRY.find((p) => p.key === key) ?? null
}

/** The plugin an agent belongs to, or null where it belongs to none. */
/**
 * Where a plugin line in the core ledger points (record 134). The core
 * reaches a plugin only by a link declared here: the micro-site root where
 * the plugin has one, else its declared door. `tail` is a path under the
 * micro-site, never a query that carries a person.
 */
export function pluginHref(key: PluginKey, tail = ''): string {
  const d = declOf(key)
  if (!d) throw new Error(`${key} is not a declared plugin.`)
  return d.microSite ? `${d.microSite}${tail}` : d.doors[0]
}

/** Micro-sites that are a firm's public storefront and so are served on its own address with no session. */
export const PUBLIC_MICRO_SITES: readonly PluginKey[] = ['WEBSITE']

/**
 * The micro-site roots a signed-in person uses. On a firm's own address
 * these are sent to the platform's host, where the one session cookie
 * lives, so a plugin never asks for a second sign-in (record 134).
 */
export function sessionMicroSites(): string[] {
  return PLUGIN_REGISTRY.filter((p) => p.microSite && !PUBLIC_MICRO_SITES.includes(p.key)).map((p) => p.microSite as string)
}

export function pluginOfAgent(agentKey: string): PluginDecl | null {
  return PLUGIN_REGISTRY.find((p) => p.agents.includes(agentKey)) ?? null
}

/** The menu links of every plugin, with the plugin that owns each. */
export function pluginDoors(): { key: PluginKey; href: string }[] {
  return PLUGIN_REGISTRY.flatMap((p) => p.doors.map((href) => ({ key: p.key, href })))
}

/** The plugin an API path belongs to and how it is kept: the longest declared prefix. Null where it is no plugin's. */
export function pluginOfRoute(path: string): { plugin: PluginDecl; route: PluginRoute } | null {
  let best: { plugin: PluginDecl; route: PluginRoute } | null = null
  for (const plugin of PLUGIN_REGISTRY) {
    for (const route of plugin.routes) {
      const at = route.prefix.length
      if ((path === route.prefix || path.startsWith(route.prefix + '/')) && (!best || at > best.route.prefix.length)) best = { plugin, route }
    }
  }
  return best
}

/** Pure: may the plugin be offered to this kind of company. An unknown kind is offered, as before. */
export function isOfferedTo(decl: PluginDecl, kind: string | null | undefined): boolean {
  return kind == null || (decl.offeredTo as readonly string[]).includes(kind)
}

/** The sentence an agent says when its plugin is off. Pure. */
export function agentPausedSays(agentName: string, pluginLabel: string, firm: string): string {
  return `${agentName} did not run: ${pluginLabel} is off for ${firm}. The Owner turns it on in Settings. Nothing was deleted.`
}

/** The sentence an agent says when it reaches for an act its plugin does not declare. Pure. */
export function actFenceSays(agentName: string, pluginLabel: string, action: string): string {
  return `${agentName} may not do ${action}: ${pluginLabel} does not declare it, so nothing was written.`
}
