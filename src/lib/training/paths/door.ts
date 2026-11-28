/**
 * An applicant from the tenant's public site may be offered a path (record
 * 133). Only with her own yes, given while signed in as herself. It is
 * never a condition of applying, never shown to the client and never a
 * decision about her; her application is not read, touched or changed. Pure.
 */
export function mayOfferToApplicant(o: { yes: boolean; signedIn: boolean }): { ok: true } | { ok: false; message: string } {
  if (!o.signedIn) return { ok: false, message: 'Sign in as yourself to say yes.' }
  if (!o.yes) return { ok: false, message: 'A learning path is offered only if you say yes. Your application does not depend on it.' }
  return { ok: true }
}
