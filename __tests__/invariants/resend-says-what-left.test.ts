import { describe, it, expect } from 'vitest'
import { resentSays, resendEmailLeaves } from '@/lib/notify/resend-words'

/**
 * Send again on a document request says "sent" only where an email left
 * (release walk three, 2026-11-03: Brightmoor's HR read "Sent again to
 * rajesh.iyer@seed.etyme.invalid" on a deployment with no email key).
 */
const BASE = { address: 'rajesh.iyer@acme-staffing.com', waitingOn: 'the I-9 and the NDA', until: 'Dec 3, 2026', hasAccount: true }

describe('Send again says what left, and nothing more', () => {
  it('where no email can leave this deployment, Send again never says it sent, and says the link is kept on your notices', () => {
    const says = resentSays({ ...BASE, leaves: false })
    expect(says).not.toMatch(/^Sent again/)
    expect(says).toContain('No email can be sent from here yet, so no email went to rajesh.iyer@acme-staffing.com.')
    expect(says).toContain('The link is kept on your notices: send it to them yourself.')
    expect(says).toContain('open until Dec 3, 2026, waiting on the I-9 and the NDA.')
  })

  it('a demo address is never said to have been sent to, even where the deployment has an email key', () => {
    const f = { ...BASE, address: 'rajesh.iyer@seed.etyme.invalid', leaves: true }
    expect(resendEmailLeaves(f)).toBe(false)
    expect(resentSays(f)).toMatch(/^rajesh\.iyer@seed\.etyme\.invalid is a demo address, so no email went to it\./)
  })

  it('where an email leaves to a real address, the sentence says sent again, what it waits on and when the link closes', () => {
    expect(resentSays({ ...BASE, leaves: true })).toBe('Sent again to rajesh.iyer@acme-staffing.com, waiting on the I-9 and the NDA. The link is open until Dec 3, 2026.')
  })

  it('a person with an account is told to read it in Etyme when they sign in, and a person without one is not promised it', () => {
    expect(resentSays({ ...BASE, leaves: false })).toMatch(/They read it in Etyme when they sign in\.$/)
    expect(resentSays({ ...BASE, leaves: false, hasAccount: false })).not.toContain('sign in')
  })
})
