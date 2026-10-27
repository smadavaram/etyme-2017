import { prisma } from '@/lib/db'
import { send, configured } from '@/lib/messages'
import { inviteMail, type InviteMail } from '@/lib/bench-filter'
import { recordedBody } from '@/lib/notify/account-mail'

/**
 * A bench invitation, sent the one way both of the firm's doors send it
 * ("Add consultant" and the bench's own request), and the honest answer
 * about how it went (second onboarding walk, 2026-10-27).
 *
 * The message is written down either way (`send` in lib/messages), as
 * before. Where no email provider is set up here, nothing leaves, so the
 * link is also kept on a notice for staff to pass on, the way a sign-up
 * link is (`recordedBody`, NOT_CONFIGURED): kept for staff, never in any
 * bell or greeting. Where a provider is set up, the link lives in the
 * mailbox and nowhere else on a notice.
 */
export async function askByEmail(o: {
  companyId: string
  personId: string
  to: string | null
  url: string
  subject: string
  body: string
  listingId: string
}): Promise<InviteMail> {
  const mail = inviteMail({ url: o.url, email: o.to, mailOn: configured() })
  if (mail === 'NO_LINK' || mail === 'NO_ADDRESS') return mail

  void send({
    companyId: o.companyId,
    personId: o.personId,
    kind: 'LINK',
    to: o.to!,
    subject: o.subject,
    body: o.body,
    aboutType: 'LISTING',
    aboutId: o.listingId,
  })

  if (mail === 'KEPT') {
    // The letter's words without the link inside them; the link is kept
    // once, under the line that says it is kept for staff.
    const lines = o.body.split(o.url).join('the link below').split('\n')
    await prisma.notification.create({
      data: {
        personId: o.personId,
        companyId: o.companyId,
        type: 'SYSTEM',
        channel: 'EMAIL',
        title: o.subject,
        body: recordedBody(lines, o.url, 'NOT_CONFIGURED'),
        entityId: o.listingId,
        deliveryState: 'NOT_CONFIGURED',
        deliveryNote: 'No email provider set up, so this was recorded and not sent.',
      },
    })
  }
  return mail
}
