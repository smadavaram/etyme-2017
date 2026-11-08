/**
 * The "Give access" dialog's fields and the body it posts, pure, so the
 * contract test can prove the dialog offers every field the route refuses
 * without (CLAUDE.md, 2026-11-02: every question a route asks, its screen
 * has a field for).
 */

/** Each name is a `field` the route may refuse on, and a field the dialog draws. */
export const GIVE_ACCESS_FIELDS = ['permission', 'who', 'scope', 'orgUnitId', 'reason'] as const
export type GiveAccessField = (typeof GIVE_ACCESS_FIELDS)[number]

export interface GiveAccessValues {
  permission: string
  /** "role:<id>" or "person:<contextId>", the one picker's value. */
  who: string
  scope: string
  orgUnitId: string
  reason: string
}

/** What the dialog posts to POST /api/settings/grants. */
export function giveAccessBody(v: GiveAccessValues): Record<string, string | null> {
  const [kind, id] = v.who.split(':')
  return {
    permission: v.permission || null,
    roleId: kind === 'role' && id ? id : null,
    contextId: kind === 'person' && id ? id : null,
    scope: v.scope || null,
    orgUnitId: v.scope === 'UNIT' && v.orgUnitId ? v.orgUnitId : null,
    reason: v.reason.trim() || null,
  }
}

/** The dialog draws the team picker only where the scope is a team. */
export function fieldsDrawn(scope: string): GiveAccessField[] {
  return GIVE_ACCESS_FIELDS.filter((f) => f !== 'orgUnitId' || scope === 'UNIT')
}
