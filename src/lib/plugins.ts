import { prisma } from '@/lib/db'
import { needsVerifiedOwnerAt } from '@/lib/owner-proof'

/**
 * Plugins (record 120): modules a firm does not have until its Owner, or
 * Etyme's staff on the switch alone, turns them on. Off for every firm by
 * default. Switching off hides and never deletes. The state is
 * `Company.pluginsOn`; the ledger is `PluginSwitch`.
 */

export type PluginKey = 'TRAIN_TO_BENCH' | 'PODS' | 'WEBSITE' | 'OUTREACH' | 'PUBLIC_SECTOR'

export const PLUGINS: readonly { key: PluginKey; label: string; says: string }[] = [
  { key: 'TRAIN_TO_BENCH', label: 'Train to bench', says: 'Courses and cohorts for your people, and a trainee who finishes joins your bench with her own yes.' },
  { key: 'PODS', label: 'Project teams', says: 'Named teams sold as a project, with deliverables the client accepts and milestones billed from them.' },
  { key: 'WEBSITE', label: 'Website and content', says: 'Your public site and the editor for its words. The site goes public after three checks: your branding, your domain, and any compliance pass.' },
  { key: 'OUTREACH', label: 'Outreach', says: 'Letters that sell your firm: outreach batches, their follow-ups and check-ins with companies gone quiet. Drafting stays open while it is off.' },
  { key: 'PUBLIC_SECTOR', label: 'Public-sector proposals', says: 'Find public bids that fit your firm, draft the response from your own record, and track deadlines. A person approves and submits.' },
]

/**
 * Both plugins are supplier modules. A company that only buys (kind
 * CLIENT) is offered neither, and is never told they exist.
 */
export function pluginsOfferedTo(kind: string | null | undefined): typeof PLUGINS {
  return kind === 'CLIENT' ? [] : PLUGINS
}

/** Record 120, ruling 3: Project teams does not turn on until the member-line work is built and walked. */
export const PODS_CLOSED_SAYS = 'Project teams opens once client-safe billing is finished.'

/** The sentence that refuses turning this plugin on, or null where it may be turned on. Turning off is never refused. */
export function switchOnRefusal(plugin: PluginKey): string | null {
  return plugin === 'PODS' ? PODS_CLOSED_SAYS : null
}

/**
 * Website and content (records 121, 123; lead's ruling 2026-11-27). A site
 * is grandfathered when it was live before the switch existed, read off the
 * record: `Company.siteLiveAt` set before the cutoff. It keeps rendering
 * until an Owner switches Website off (a PluginSwitch row with on=false and
 * byStaff=false). A Superadmin's row never ends it; an Owner's switch-on
 * does not either (the site is then on anyway).
 */
export const GRANDFATHER_CUTOFF = new Date('2026-11-27T00:00:00Z')

/**
 * The one day the dev seed gives every storefront it writes: a day before the
 * cutoff, because those sites stand for sites that were live before the flag.
 * Fixed, never new Date(), so a database seeded on any day shows them alike.
 */
export const SEEDED_SITE_LIVE_AT = new Date(GRANDFATHER_CUTOFF.getTime() - 24 * 60 * 60 * 1000)

export function liveBeforeTheFlag(siteLiveAt: Date | null | undefined): boolean {
  return Boolean(siteLiveAt) && siteLiveAt!.getTime() < GRANDFATHER_CUTOFF.getTime()
}

/**
 * Pure: does a firm's public site render. It does where the plugin is on,
 * or where it was live before the flag and no Owner has switched it off.
 * Dark reads the same as no firm.
 */
export function siteRenders(f: { siteLiveAt: Date | null | undefined; pluginsOn: readonly string[] | null | undefined; ownerSwitchedOff: boolean }): boolean {
  if (isOn(f.pluginsOn, 'WEBSITE')) return true
  return liveBeforeTheFlag(f.siteLiveAt) && !f.ownerSwitchedOff
}

/**
 * Whether a firm's storefront renders, and so whether its content editor is
 * open. The switch history is read only for a firm that is off and was live
 * before the flag, so no other firm costs the extra read.
 */
export async function siteRendersFor(company: { id: string; siteLiveAt: Date | null | undefined; pluginsOn: readonly string[] | null | undefined }): Promise<boolean> {
  const needsHistory = !isOn(company.pluginsOn, 'WEBSITE') && liveBeforeTheFlag(company.siteLiveAt)
  const ownerSwitchedOff = needsHistory
    ? (await prisma.pluginSwitch.count({ where: { companyId: company.id, plugin: 'WEBSITE', on: false, byStaff: false } })) > 0
    : false
  return siteRenders({ siteLiveAt: company.siteLiveAt, pluginsOn: company.pluginsOn, ownerSwitchedOff })
}

/** What a dark site reads, the same as for a firm that does not exist (record 123, answer 6). */
export const DARK_SITE_SAYS = 'No company at that address.'

/** What the Website switch says first when a check is missing. */
export const WEBSITE_LEAD_SAYS = 'The site goes public after three checks: your branding, your domain, and any compliance pass.'

export type WebsiteFacts = {
  brandingApprovedAt: Date | null
  domainVerified: boolean
  compliancePassRequired: boolean
  compliancePassRecorded: boolean
}
export type WebsiteCheck = 'BRANDING' | 'DOMAIN' | 'COMPLIANCE_PASS'

/** Pure: the checks that do not yet hold, each in a sentence. Nothing missing means it may go on. */
export function websiteChecklist(f: WebsiteFacts): { missing: { check: WebsiteCheck; says: string }[]; says: string | null } {
  const missing: { check: WebsiteCheck; says: string }[] = []
  if (!f.brandingApprovedAt) missing.push({ check: 'BRANDING', says: 'Your branding is not approved yet. The Owner approves it in Settings.' })
  if (!f.domainVerified) missing.push({ check: 'DOMAIN', says: 'Your own domain is not pointed and verified yet.' })
  if (f.compliancePassRequired && !f.compliancePassRecorded) missing.push({ check: 'COMPLIANCE_PASS', says: 'A compliance pass is required for your firm and none is recorded. Record it with its document in Settings.' })
  return { missing, says: missing.length ? `${WEBSITE_LEAD_SAYS} ${missing.map((m) => m.says).join(' ')}` : null }
}

/** Reads the three facts for a firm. */
export async function websiteFacts(companyId: string): Promise<WebsiteFacts> {
  const [c, domain, pass] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { siteBrandingApprovedAt: true, siteCompliancePassRequired: true } }),
    prisma.customDomain.findFirst({ where: { companyId, isPrimary: true, state: 'VERIFIED' }, select: { id: true } }),
    prisma.siteCompliancePass.findFirst({ where: { companyId }, select: { id: true } }),
  ])
  return { brandingApprovedAt: c?.siteBrandingApprovedAt ?? null, domainVerified: Boolean(domain), compliancePassRequired: Boolean(c?.siteCompliancePassRequired), compliancePassRecorded: Boolean(pass) }
}

/** The 422 body for a Website switch that may not go on yet, or null. Off is never asked. */
export async function websiteOnRefusal(companyId: string): Promise<{ code: 'WEBSITE_CHECKS_MISSING'; message: string; missing: WebsiteCheck[] } | null> {
  const r = websiteChecklist(await websiteFacts(companyId))
  return r.says ? { code: 'WEBSITE_CHECKS_MISSING', message: r.says, missing: r.missing.map((m) => m.check) } : null
}

/**
 * Outreach (records 122, 123 answer 4): only the letters that sell are held
 * while it is off. Every chase, the availability ping and every inbound
 * door stay open. The names are the templates the mail door carries.
 */
export const OUTREACH_TEMPLATES = {
  held: ['outreach-batch', 'dormant-outreach'],
  open: ['submission-chase', 'money-owed-chase', 'money-owed-final-notice', 'timesheet-chase', 'freshness-ping'],
} as const

/** Pure: is this letter held because Outreach is off. A follow-up carries its batch's template. */
export function outreachHeld(pluginsOn: readonly string[] | null | undefined, template: string): boolean {
  return !isOn(pluginsOn, 'OUTREACH') && (OUTREACH_TEMPLATES.held as readonly string[]).includes(template)
}

/** The one sentence for a module that is not offered to this company; it names no module. */
export function notOfferedSays(): string {
  return 'That is not offered for your company.'
}

export function isPluginKey(v: unknown): v is PluginKey {
  return PLUGINS.some((p) => p.key === v)
}

export function pluginLabel(key: PluginKey): string {
  return PLUGINS.find((p) => p.key === key)?.label ?? key
}

/** Pure: is the plugin in this list. Nothing in the list is off. */
export function isOn(pluginsOn: readonly string[] | null | undefined, key: PluginKey): boolean {
  return Boolean(pluginsOn?.includes(key))
}

/** Whether the firm has the plugin on. Reads the database. */
export async function pluginOn(companyId: string, key: PluginKey): Promise<boolean> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { pluginsOn: true } })
  return isOn(c?.pluginsOn, key)
}

/** A twin or an agent never switches a plugin; a person does. */
export type PluginActor = {
  twin?: boolean
  agent?: boolean
  actorKind?: string | null
  company: { id: string; name: string } | null
  context: { roleId: string | null }
}

export type MaySwitch = { ok: true } | { ok: false; code: 'AGENT' | 'NOT_OWNER' | 'OWNER_NOT_VERIFIED' | 'NO_COMPANY'; says: string; href?: string }

/**
 * May this caller switch a plugin at their firm? The twin and any agent are
 * refused first, then anybody who is not an Owner of the company, then the
 * wait for a verified Owner (a GatedAct).
 */
export async function maySwitchPlugin(caller: PluginActor): Promise<MaySwitch> {
  if (caller.twin || caller.agent || caller.actorKind === 'TWIN' || caller.actorKind === 'AGENT') {
    return { ok: false, code: 'AGENT', says: 'Ask Etyme and the agents never switch a plugin. The Owner does, in Settings.' }
  }
  if (!caller.company) return { ok: false, code: 'NO_COMPANY', says: 'A plugin is a company setting. Open it from a company seat.' }
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  if (role?.name !== 'Owner') {
    return { ok: false, code: 'NOT_OWNER', says: `Only an Owner of ${caller.company.name} switches a plugin on or off. An Admin may read the switches.` }
  }
  const gate = await needsVerifiedOwnerAt(caller.company.id, 'PLUGIN_SWITCH')
  if (!gate.ok) return { ok: false, code: 'OWNER_NOT_VERIFIED', says: gate.says, href: gate.href }
  return { ok: true }
}
