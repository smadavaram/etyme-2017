/**
 * The identity walk's one database step (run with tsx against the copy the
 * walk's server reads): gives a Northbend directory person a password so
 * the other doors can be tried, asks the Google and LinkedIn doors in
 * process (no provider keys on a local copy), and seats a Gmail partner at
 * Brightmoor under the hybrid mode. Prints the Gmail seat's id for check3.
 */
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { checkDoor } from '@/lib/identity/read'

async function main() {
  await prisma.person.update({ where: { primaryEmail: 'rosa.lindqvist@northbend.example' }, data: { passwordHash: await hashPassword('a-long-walk-password-1'), emailVerifiedAt: new Date() } })
  console.log('Google door:', JSON.stringify(await checkDoor({ door: 'GOOGLE_SOCIAL', email: 'rosa.lindqvist@northbend.example', surface: 'WEB' })))
  console.log('LinkedIn door allowed:', (await checkDoor({ door: 'LINKEDIN', email: 'rosa.lindqvist@northbend.example', surface: 'WEB' })).allowed)
  const bm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  await prisma.companySignInPolicy.upsert({ where: { companyId: bm.id }, create: { companyId: bm.id, mode: 'HYBRID', reason: 'walk' }, update: { mode: 'HYBRID' } })
  const role = await prisma.role.findFirst({ where: { companyId: bm.id, name: 'Finance' }, select: { id: true } })
  const p = await prisma.person.upsert({ where: { primaryEmail: 'walk.partner@gmail.com' }, create: { primaryEmail: 'walk.partner@gmail.com', name: 'Walk Partner', passwordHash: await hashPassword('a-long-walk-password-2'), emailVerifiedAt: new Date() }, update: {}, select: { id: true } })
  const c = await prisma.context.create({ data: { personId: p.id, companyId: bm.id, type: 'EMPLOYEE', roleId: role?.id ?? null, source: 'INVITE', invitedAt: new Date(), grantReason: 'walk invite' }, select: { id: true } })
  console.log('GMAIL_SEAT=' + c.id)
  process.exit(0)
}
void main()
