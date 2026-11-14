import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mailListSays, NO_SENDER_SAYS } from '@/app/api/superadmin/ask-etyme/mail-says'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the staff screen never says every email left when none could', () => {
  it('where no email sender is set up and nothing is listed, the screen says no email can leave, and never that every email left', () => {
    expect(mailListSays(0, false)).toBe(NO_SENDER_SAYS)
    expect(mailListSays(0, false)).not.toContain('has left')
    expect(NO_SENDER_SAYS).toBe('No email sender is set up on this deployment, so no email can leave from here yet.')
  })

  it('where no email sender is set up and six invitations were held back, it says so first, then lists them', () => {
    expect(mailListSays(6, false)).toBe(`${NO_SENDER_SAYS} The newest 6 that did not go, newest first.`)
  })

  it('only where email is set up and nothing failed or was held back does it say every email left', () => {
    expect(mailListSays(0, true)).toBe('Every email sent from here has left. Nothing failed or was held back.')
    expect(mailListSays(2, true)).toBe('The newest 2 that did not go, newest first.')
  })

  it('the route reads whether email can leave from the one answer every sentence reads', () => {
    const route = read('src/app/api/superadmin/ask-etyme/route.ts')
    expect(route).toContain('says: mailListSays(rows.length, mailLeaves()),')
    expect(route).not.toContain("'Every email sent from here has left. Nothing failed.'")
  })

  it('the staff screen draws a send held back for no sender as "No email sender is set up on this deployment"', () => {
    const page = read('src/app/dashboard/superadmin/page.tsx')
    expect(page).toContain("if (r.failureKind === 'NOT_SET_UP') return 'No email sender is set up on this deployment'")
  })
})
