import { staffAddresses } from '@/lib/alerts'
import { getSessionEmail } from '@/lib/api-context'

/**
 * Whether whoever is asking is one of Etyme's own people.
 *
 * The list is `ETYME_STAFF_EMAILS`, which already means exactly that —
 * it is who hears when this deployment breaks. The people who may
 * re-seed a demo world are the same set, so this reads the same
 * variable rather than inventing a second one to forget.
 *
 * Fails closed. With the list unset nobody is staff, and the sentence
 * says which variable to set — which is the same one the alerting row
 * on /ready is already asking for, so one answer settles both.
 *
 * Lives here rather than beside the route that uses it because a Next
 * route file may export only route handlers; exporting a helper from
 * one type-checks in isolation and fails `next build`.
 */
export async function callerIsStaff(): Promise<{ ok: boolean; says: string }> {
  const staff = staffAddresses()
  if (staff.length === 0) {
    return {
      ok: false,
      says:
        'Nobody is named as staff on this deployment, so nobody can re-seed it from the ' +
        'browser. Set ETYME_STAFF_EMAILS to the addresses that should be able to — it is ' +
        'the same list that hears when something breaks.',
    }
  }
  const email = (await getSessionEmail())?.toLowerCase() ?? null
  if (!email) return { ok: false, says: 'Sign in first — re-seeding is for Etyme staff.' }
  if (!staff.some((a) => a.toLowerCase() === email)) {
    return { ok: false, says: 'Re-seeding the demo world is for Etyme staff, and you are not on that list.' }
  }
  return { ok: true, says: 'You are on the staff list.' }
}
