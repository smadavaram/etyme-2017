/**
 * Whether forwarded email is open on this deployment at all.
 *
 * Security first (coordinator, 2026-10-22): the intake stays inert on a
 * deployment until the founder's walk has attacked it and the privacy
 * notice and the DPA name forwarded email. Until `EMAIL_INTAKE_LIVE` is
 * exactly "1", the inbound door answers 404 and writes nothing — so an
 * unsigned flood writes nothing either — and no company can turn the
 * intake on. The nightly deletion runs regardless, because deleting is
 * never the risk.
 */
export const INTAKE_LIVE_ENV = 'EMAIL_INTAKE_LIVE'

export const NOT_OPEN_YET = 'Forwarded email is not open on this deployment yet.'

export function intakeLive(env: Record<string, string | undefined> = process.env): boolean {
  return env[INTAKE_LIVE_ENV] === '1'
}
