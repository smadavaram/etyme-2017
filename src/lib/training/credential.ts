import { randomBytes } from 'node:crypto'

/**
 * The public credential page of one completed course (record 133, Phase 1).
 * Shown only with the learner's own yes, checked against the record every
 * time, and hers to take down. Pure apart from the code generator; the
 * route and the page do the reading.
 */

/** An id nobody can guess: 16 random bytes, URL-safe. */
export const newVerificationCode = (): string => randomBytes(16).toString('base64url')

export type CredentialRefusal = 'PLUGIN_OFF' | 'NO_SUCH_CODE' | 'OTHER_FIRM' | 'NOT_COMPLETE' | 'NOT_SHOWN' | 'REVOKED'

/**
 * Whether a credential page may be read. Every refusal reads the same to a
 * stranger (the page is "not found"); the reasons are for the tests and the
 * learner's own screen.
 */
export function mayShowCredential(o: {
  pluginOn: boolean
  row: { companyId: string; shownAt: Date | null; revokedAt: Date | null } | null
  tenantId: string
  enrollmentStatus: string | null | undefined
}): { ok: true } | { ok: false; reason: CredentialRefusal } {
  if (!o.pluginOn) return { ok: false, reason: 'PLUGIN_OFF' }
  if (!o.row) return { ok: false, reason: 'NO_SUCH_CODE' }
  if (o.row.companyId !== o.tenantId) return { ok: false, reason: 'OTHER_FIRM' }
  if (o.enrollmentStatus !== 'COMPLETED') return { ok: false, reason: 'NOT_COMPLETE' }
  if (o.row.revokedAt) return { ok: false, reason: 'REVOKED' }
  if (!o.row.shownAt) return { ok: false, reason: 'NOT_SHOWN' }
  return { ok: true }
}

/** The address a credential lives at on its firm's learning site. */
export const credentialPath = (tenantSlug: string, code: string): string => `/learn/${tenantSlug}/credential/${code}`

/**
 * An "add to profile" link, a plain address built from the parameters the
 * network documents for a certification. Nothing is called and nothing is
 * read from the network; the learner's own click does the rest.
 */
export const ADD_TO_PROFILE_PARAMS = ['startTask', 'name', 'organizationName', 'issueYear', 'issueMonth', 'certUrl', 'certId'] as const

export function addToProfileUrl(o: { courseName: string; issuer: string; issuedAt: Date; certUrl: string; certId: string }): string {
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: o.courseName,
    organizationName: o.issuer,
    issueYear: String(o.issuedAt.getUTCFullYear()),
    issueMonth: String(o.issuedAt.getUTCMonth() + 1),
    certUrl: o.certUrl,
    certId: o.certId,
  })
  return `https://www.linkedin.com/profile/add?${q.toString()}`
}
