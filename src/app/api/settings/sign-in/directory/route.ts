import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { companyPolicy } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { discoveryFor, SECRET_REF_SHAPE } from '@/lib/identity/directory'
import { isMockIssuer, mockMayServe, mockIssuerFor, mockClientId, MOCK_SECRET_REF } from '@/lib/identity/mock-directory'
import { safeOutboundUrl } from '@/lib/identity/oidc'
import { verifiedDomainsOf } from '@/lib/identity/provision'
import { seal, sealingKey } from '@/lib/team-structure/directory/sealed'
import { signInSeat, type SignInSeat } from '../gate'

/**
 * PUT /api/settings/sign-in/directory — the company's directory
 *   { type: OIDC | ENTRA | GOOGLE_WORKSPACE | SAML, label?, issuer, clientId, metadataUrl?,
 *     secret? | secretRef?, subjectClaim?, emailClaim?, groupsClaim?, entityId?, certificate?, enabled, reason }
 *
 * The Owner sets it; SSO_CONFIGURED is written with the change. The client
 * secret is never stored in plain text: it is a name in the platform's
 * secret store (ETYME_IDP_…), or sealed with the deployment's directory
 * key, and never returned. Turning it on runs discovery first, and a
 * company with no mode chosen is asked to choose one first, because a
 * directory turned on with no mode reads directory only. The mock
 * directory's issuer is refused for any company with a registrable domain.
 * SAML is stored and not built in pass 1.
 */
const TYPES = ['OIDC', 'ENTRA', 'GOOGLE_WORKSPACE', 'SAML'] as const
const text = (v: unknown, max: number) => {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : ''
  return t || null
}
const bad = (field: string, message: string, status = 422) => NextResponse.json({ error: { code: 'VALIDATION', field, message } }, { status })

export async function PUT(request: NextRequest) {
  const s = await signInSeat(request, true)
  if ('error' in s && s.error) return s.error
  const { company, by, caller } = s as SignInSeat
  const body = await request.json().catch(() => ({}))
  const type = String(body.type ?? '') as (typeof TYPES)[number]
  if (!(TYPES as readonly string[]).includes(type)) return bad('type', 'Choose the kind of directory: OpenID Connect, Microsoft Entra ID, Google Workspace or SAML.')
  const reason = text(body.reason, 500)
  if (!reason) return bad('reason', 'Say why, in a sentence. It is kept beside the change.')
  const domains = await verifiedDomainsOf(company.id)
  const companySlug = (await prisma.company.findUniqueOrThrow({ where: { id: company.id }, select: { slug: true } })).slug

  const useMock = body.mock === true
  let issuer = useMock ? mockIssuerFor(companySlug) : text(body.issuer, 500)
  if (!issuer) return bad('issuer', type === 'SAML' ? 'Enter the directory’s entity id (its issuer).' : 'Enter the directory’s issuer address.')
  if (isMockIssuer(issuer) && (!mockMayServe(domains) || issuer !== mockIssuerFor(companySlug))) {
    return bad('issuer', 'The mock directory is for demo companies on reserved domains only.')
  }
  if (type !== 'SAML' && !isMockIssuer(issuer) && !safeOutboundUrl(issuer)) return bad('issuer', 'The issuer must be an https address.')
  const clientId = useMock ? mockClientId(companySlug) : text(body.clientId, 300)
  if (type !== 'SAML' && !clientId) return bad('clientId', 'Enter the client id Etyme was registered with in your directory.')
  const metadataUrl = text(body.metadataUrl, 500)
  if (metadataUrl && !safeOutboundUrl(metadataUrl)) return bad('metadataUrl', 'The discovery address must be an https address.')

  const existing = await prisma.identityProvider.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' }, select: { id: true, secretRef: true, secretSealed: true, issuer: true } })
  let secretRef = existing && existing.issuer === issuer ? existing.secretRef : null
  let secretSealed = existing && existing.issuer === issuer ? existing.secretSealed : null
  if (useMock) { secretRef = MOCK_SECRET_REF; secretSealed = null }
  const ref = text(body.secretRef, 80)
  const plain = typeof body.secret === 'string' && body.secret.trim() ? body.secret.trim() : null
  if (ref) {
    if (!SECRET_REF_SHAPE.test(ref)) return bad('secretRef', 'A secret-store name starts with ETYME_IDP_ and holds capital letters, digits and underscores.')
    secretRef = ref; secretSealed = null
  } else if (plain) {
    if (!sealingKey()) return bad('secret', 'This deployment has no key to lock a client secret with. Put it in the platform’s secret store as ETYME_IDP_<NAME> and enter that name instead.')
    secretSealed = seal(plain); secretRef = null
  }
  if (type !== 'SAML' && !secretRef && !secretSealed) return bad('secret', 'Enter the client secret, or the name it is stored under in the secret store.')

  const enabled = body.enabled === true
  if (enabled) {
    const pol = await companyPolicy(company.id)
    if (!pol.policy.mode) return bad('enabled', 'Choose how your people sign in first (both is the safe start), then turn the directory on. A directory turned on with nothing chosen means directory only.')
    if (type === 'SAML') return bad('enabled', 'SAML is stored and not built yet, so it cannot be turned on in this pass.')
    const d = await discoveryFor({ issuer, metadataUrl })
    if (!d.ok) return bad('enabled', `The directory did not pass the test, so it stays off: ${d.says}`)
  }

  const data = {
    type, label: text(body.label, 120), issuer, clientId, metadataUrl, secretRef, secretSealed,
    subjectClaim: text(body.subjectClaim, 80), emailClaim: text(body.emailClaim, 80), groupsClaim: text(body.groupsClaim, 80),
    entityId: text(body.entityId, 500), certificate: text(body.certificate, 20000), enabled, setById: by,
  }
  const policy = (await companyPolicy(company.id)).effective
  await prisma.$transaction(async (tx) => {
    if (existing) await tx.identityProvider.update({ where: { id: existing.id }, data })
    else await tx.identityProvider.create({ data: { companyId: company.id, ...data } })
    await recordIdentityEvent({
      event: 'SSO_CONFIGURED', companyId: company.id, actorPersonId: by, subject: { companyId: company.id }, policy, surface: 'WEB',
      says: `${caller.person.name} set ${company.name}'s directory (${type}, ${issuer}) and turned it ${enabled ? 'on' : 'off'}: ${reason}`,
    }, tx)
  })
  return NextResponse.json({ data: { says: enabled ? 'Saved. The directory is on.' : 'Saved. The directory is off.' } })
}
