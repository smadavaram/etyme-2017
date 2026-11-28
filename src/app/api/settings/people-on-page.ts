/**
 * Whether a firm's public page may print its people by name
 * (the Owner's answer 3, docs/decisions/92): off by default, the Owner's
 * alone to turn on, because it puts named people on a public address.
 */
import { prisma } from '@/lib/db'
import { recordRefusal } from '@/lib/access-log'
import { isOwnerSeat } from './kind'

export { PEOPLE_ON_PAGE_WORDS } from '@/components/settings/people-on-page-words'

export const PEOPLE_ON_PAGE_OWNER_ONLY =
  'Showing people by name on the public page is the Owner’s to decide. Ask your Owner to turn it on.'

/** The one reader of the choice. A public page asks this before it prints any person. */
export async function showsPeople(companyId: string): Promise<boolean> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { showPeopleOnPage: true } })
  return c?.showPeopleOnPage === true
}

export type PeopleOnPageResult =
  | { ok: true; showPeopleOnPage: boolean; message: string }
  | { ok: false; status: number; code: string; message: string }

export async function setShowPeople(a: {
  companyId: string
  contextId: string
  person: { id: string; name: string }
  value: unknown
}): Promise<PeopleOnPageResult> {
  if (typeof a.value !== 'boolean') {
    return { ok: false, status: 422, code: 'VALIDATION', message: 'Say yes or no: show people by name on the public page, or not.' }
  }
  if (!(await isOwnerSeat(a.contextId, a.companyId))) {
    // Written before the refusal is sent (CLAUDE.md, access log).
    await recordRefusal([{ companyId: a.companyId }], {
      action: 'PROFILE_VIEW',
      actorPersonId: a.person.id,
      actorCompanyId: a.companyId,
      reason: 'Refused changing whether the public page shows people by name: the seat is not the Owner.',
    })
    return { ok: false, status: 403, code: 'FORBIDDEN', message: PEOPLE_ON_PAGE_OWNER_ONLY }
  }
  const was = await showsPeople(a.companyId)
  if (was !== a.value) {
    await prisma.$transaction([
      prisma.company.update({ where: { id: a.companyId }, data: { showPeopleOnPage: a.value } }),
      prisma.automationLog.create({
        data: {
          companyId: a.companyId,
          action: 'PUBLIC_PAGE_PEOPLE_CHANGED',
          summary: `${a.person.name} ${a.value ? 'turned on' : 'turned off'} showing people by name on the public page`,
          reason: 'Changed by the Owner in settings',
          payload: { from: was, to: a.value, byPersonId: a.person.id },
          reversible: true,
        },
      }),
    ])
  }
  return {
    ok: true,
    showPeopleOnPage: a.value,
    message: a.value ? 'Saved. The public page may now show your Owner, HR and billing contacts by name.' : 'Saved. The public page shows the firm, not a person.',
  }
}
