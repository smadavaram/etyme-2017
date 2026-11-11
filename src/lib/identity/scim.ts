import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { companyPolicy } from '@/lib/identity/read'

/**
 * SCIM 2.0, minimal and honest (founder, 2026-11-11: "Provisioning is SCIM
 * 2.0 first ... Deprovisioning is the sale").
 *
 * Users: create, read, list (filter `userName eq` and `externalId eq`),
 * replace, patch `active` and the address, delete. Groups: create, read,
 * list (filter `displayName eq`), patch members. A User's SCIM id is the
 * directory identity's id; its `externalId` is the subject the directory
 * signs people in as, so a SCIM seat and a directory sign-in meet on the
 * issuer and the subject, never the email. Not a conformance suite: what is
 * not supported is listed in KNOWN-LIMITS ("Identity, pass 1, stage B").
 *
 * The bearer token is shown once on Settings → Sign-in and only its sha256
 * is kept; it is compared in constant time and names one company.
 */

export const SCIM_USER = 'urn:ietf:params:scim:schemas:core:2.0:User'
export const SCIM_GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group'
export const SCIM_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
export const SCIM_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error'
export const SCIM_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** A new token: shown once, never kept. */
export function newScimToken(): { token: string; tokenHash: string; last4: string } {
  const token = `etyme_scim_${randomBytes(32).toString('base64url')}`
  return { token, tokenHash: hashToken(token), last4: token.slice(-4) }
}

export function scimJson(body: unknown, status = 200): NextResponse {
  return new NextResponse(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/scim+json', 'Cache-Control': 'no-store' } })
}

export function scimError(status: number, detail: string, scimType?: string): NextResponse {
  return scimJson({ schemas: [SCIM_ERROR], status: String(status), ...(scimType ? { scimType } : {}), detail }, status)
}

export interface ScimCaller {
  companyId: string
  companyName: string
  provider: { id: string; issuer: string }
}

/**
 * Who is calling: the company the token was issued to. Refused where the
 * token is unknown or revoked, where the company turned SCIM off, or where
 * it has no directory turned on to name the issuer. A refusal that names a
 * company is ledgered before it is answered; an unknown token names none,
 * and is answered without a row (KNOWN-LIMITS).
 */
export async function scimCaller(authorization: string | null): Promise<{ ok: true; caller: ScimCaller } | { ok: false; res: NextResponse }> {
  const m = /^Bearer\s+(\S+)$/i.exec(String(authorization ?? '').trim())
  if (!m) return { ok: false, res: scimError(401, 'A SCIM bearer token is required.') }
  const want = hashToken(m[1])
  const row = await prisma.scimToken.findUnique({ where: { tokenHash: want }, select: { id: true, tokenHash: true, revokedAt: true, companyId: true, company: { select: { name: true } } } })
  const matches = row ? timingSafeEqual(Buffer.from(row.tokenHash, 'hex'), Buffer.from(want, 'hex')) : false
  if (!row || !matches || row.revokedAt) return { ok: false, res: scimError(401, 'That SCIM token is not valid. Issue a new one on Settings, Sign-in.') }

  const [policy, provider] = await Promise.all([
    prisma.companySignInPolicy.findUnique({ where: { companyId: row.companyId }, select: { scim: true } }),
    prisma.identityProvider.findFirst({ where: { companyId: row.companyId, enabled: true }, select: { id: true, issuer: true }, orderBy: { createdAt: 'asc' } }),
  ])
  const refuse = async (status: number, says: string) => {
    await recordIdentityEvent({
      event: 'USER_PROVISIONED', refused: true, companyId: row.companyId, actorPersonId: null, subject: { companyId: row.companyId },
      policy: (await companyPolicy(row.companyId)).effective, surface: 'SCIM', says: `Refused a SCIM call: ${says}`,
    })
    return { ok: false as const, res: scimError(status, says) }
  }
  if (!policy?.scim) return refuse(403, `SCIM is turned off for ${row.company.name}. An Owner turns it on in Settings, Sign-in.`)
  if (!provider) return refuse(409, `${row.company.name} has no company directory turned on, so a SCIM seat would have no directory to sign in through.`)
  await prisma.scimToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
  return { ok: true, caller: { companyId: row.companyId, companyName: row.company.name, provider } }
}

type EiRow = { id: string; subject: string; email: string; disabledAt: Date | null; createdAt: Date; person: { name: string } }

export const EI_SELECT = { id: true, subject: true, email: true, disabledAt: true, createdAt: true, person: { select: { name: true } } } as const

export function userResource(ei: EiRow, base: string) {
  return {
    schemas: [SCIM_USER],
    id: ei.id,
    externalId: ei.subject,
    userName: ei.email,
    displayName: ei.person.name,
    name: { formatted: ei.person.name },
    emails: [{ value: ei.email, primary: true, type: 'work' }],
    active: !ei.disabledAt,
    meta: { resourceType: 'User', created: ei.createdAt.toISOString(), location: `${base}/Users/${ei.id}` },
  }
}

/** `userName eq "x"`, `externalId eq "x"` or `displayName eq "x"`: the one shape of filter this build reads. */
export function readFilter(filter: string | null): { attr: string; value: string } | null | 'unsupported' {
  if (!filter) return null
  const m = /^\s*(userName|externalId|displayName|id)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(filter)
  if (!m) return 'unsupported'
  return { attr: m[1].toLowerCase(), value: m[2].replace(/\\(.)/g, '$1') }
}

/** Whether a SCIM `active` value is off: false, "false", "False". */
export function isOff(v: unknown): boolean {
  return v === false || (typeof v === 'string' && v.trim().toLowerCase() === 'false')
}

/** What a PATCH asks of a User: the active flag and the address, where it says either. */
export function userPatch(body: unknown): { active?: boolean; userName?: string } | 'unsupported' {
  const ops = (body as { Operations?: unknown[] } | null)?.Operations
  if (!Array.isArray(ops)) return 'unsupported'
  const out: { active?: boolean; userName?: string } = {}
  for (const raw of ops) {
    const op = raw as { op?: string; path?: string; value?: unknown }
    const kind = String(op.op ?? '').toLowerCase()
    if (kind !== 'replace' && kind !== 'add') continue
    const path = String(op.path ?? '')
    if (path.toLowerCase() === 'active') out.active = !isOff(op.value)
    else if (path.toLowerCase() === 'username' && typeof op.value === 'string') out.userName = op.value
    else if (!path && op.value && typeof op.value === 'object') {
      const v = op.value as Record<string, unknown>
      if ('active' in v) out.active = !isOff(v.active)
      if (typeof v.userName === 'string') out.userName = v.userName
    }
  }
  return out
}

/** The members a Group PATCH adds and removes, by SCIM user id. */
export function groupPatch(body: unknown): { add: string[]; remove: string[]; displayName?: string } | 'unsupported' {
  const ops = (body as { Operations?: unknown[] } | null)?.Operations
  if (!Array.isArray(ops)) return 'unsupported'
  const add: string[] = []
  const remove: string[] = []
  let displayName: string | undefined
  const values = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String((x as { value?: unknown })?.value ?? '')).filter(Boolean)
  for (const raw of ops) {
    const op = raw as { op?: string; path?: string; value?: unknown }
    const kind = String(op.op ?? '').toLowerCase()
    const path = String(op.path ?? '')
    const one = /^members\[value eq "([^"]+)"\]$/i.exec(path)
    if (kind === 'add' && path.toLowerCase() === 'members') add.push(...values(op.value))
    else if (kind === 'remove' && one) remove.push(one[1])
    else if (kind === 'remove' && path.toLowerCase() === 'members') remove.push(...values(op.value))
    else if (kind === 'replace' && path.toLowerCase() === 'displayname' && typeof op.value === 'string') displayName = op.value
    else if (kind === 'replace' && path.toLowerCase() === 'members') add.push(...values(op.value))
  }
  return { add, remove, displayName }
}

/** A group's SCIM id: the directory's own id where it sent one, else derived from its name. */
export function groupIdFor(companyId: string, displayName: string, externalId?: string | null): string {
  if (externalId && externalId.trim()) return externalId.trim()
  return `grp_${createHash('sha256').update(`${companyId}\u0000${displayName.trim().toLowerCase()}`).digest('hex').slice(0, 20)}`
}
