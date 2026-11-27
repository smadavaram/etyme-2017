/**
 * The links that give and take back a candidate's yes to updates (record 117).
 *
 * Every update letter carries the stop link; a letter that asks her for the
 * yes carries the yes link. Both work with no sign-in: the signed token
 * names one person and one purpose (`lib/signed-link`), so a stop token
 * cannot give a yes and a yes token cannot take one back. Nothing is stored
 * for a token, and it is never logged, put on a card or returned in a reply.
 * Opening the page changes nothing, because a mail scanner follows every
 * link; the button posts. A second use changes nothing and says the same
 * sentence. A stop ends updates from every firm, because the yes is hers and
 * not one firm's, and it never stops a message about work already agreed.
 */
import { prisma } from '@/lib/db'
import { sign, read, baseUrl } from '@/lib/signed-link'
import { emit } from '@/lib/events'
import { saidYesToUpdates } from '@/lib/updates-consent'

const STOP = 'UPDATES_STOP'
const YES = 'UPDATES_YES'

export type UpdatesPurpose = 'STOP' | 'YES'

const urlFor = (kind: string, personId: string): string | null => {
  const base = baseUrl()
  if (!base) return null
  try { return `${base}/answer/updates/${sign(kind, [personId])}` } catch { return null }
}

/** The link that ends her updates, or null where the deployment has no public address (a letter then carries no broken link). */
export const stopUpdatesUrlFor = (personId: string): string | null => urlFor(STOP, personId)
/** The link that gives her yes, for a letter that asks for it. */
export const yesToUpdatesUrlFor = (personId: string): string | null => urlFor(YES, personId)

export interface UpdatesView { purpose: UpdatesPurpose; already: boolean }
export type UpdatesResult =
  | { ok: true; view: UpdatesView; says: string }
  | { ok: false; status: number; says: string }

const BAD_LINK = 'This link is not valid. It may have been retyped or cut short. Use the link in the letter again.'
export const STOPPED_SAYS = 'No firm will send you updates. Messages about work already agreed, such as timesheets, still reach you.'
export const YES_SAYS = 'You said yes to updates. Firms that keep you on their list may write to you. You can stop them at any time from the link in each letter.'

async function find(token: string) {
  const purpose: UpdatesPurpose | null = read(STOP, token) ? 'STOP' : read(YES, token) ? 'YES' : null
  if (!purpose) return null
  const id = (read(purpose === 'STOP' ? STOP : YES, token) ?? [])[0]
  if (!id) return null
  const person = await prisma.person.findUnique({ where: { id }, select: { id: true, updatesYesAt: true, updatesRevokedAt: true } })
  return person ? { purpose, person } : null
}

/** What the page shows: which of the two it is, and whether it is already done. Changes nothing. */
export async function openUpdates(token: string): Promise<UpdatesResult> {
  const f = await find(token)
  if (!f) return { ok: false, status: 404, says: BAD_LINK }
  const yes = saidYesToUpdates(f.person)
  return { ok: true, view: { purpose: f.purpose, already: f.purpose === 'STOP' ? !yes : yes }, says: '' }
}

/** Give or take back the yes the link names. A second use changes nothing and says the same sentence. */
export async function applyUpdates(token: string, now: Date = new Date()): Promise<UpdatesResult> {
  const f = await find(token)
  if (!f) return { ok: false, status: 404, says: BAD_LINK }
  const yes = saidYesToUpdates(f.person)
  const view = { purpose: f.purpose, already: f.purpose === 'STOP' ? !yes : yes }
  if (f.purpose === 'STOP') {
    if (yes) {
      await prisma.person.update({ where: { id: f.person.id }, data: { updatesRevokedAt: now } })
      await emit({ type: 'person.updates_yes_revoked', companyId: null, subjectType: 'Person', subjectId: f.person.id, actorPersonId: f.person.id, payload: {} })
    }
    return { ok: true, view, says: STOPPED_SAYS }
  }
  if (!yes) {
    await prisma.person.update({ where: { id: f.person.id }, data: { updatesYesAt: now } })
    await emit({ type: 'person.updates_yes_given', companyId: null, subjectType: 'Person', subjectId: f.person.id, actorPersonId: f.person.id, payload: {} })
  }
  return { ok: true, view, says: YES_SAYS }
}
