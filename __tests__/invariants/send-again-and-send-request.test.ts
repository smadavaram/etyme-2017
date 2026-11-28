import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resentSays } from '@/lib/notify/resend-words'
import { sendRequestMissing } from '@/app/dashboard/packets/words'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('Send again says what left (release walk three)', () => {
  it('Send again never says it sent where no email left, and says the link is kept on your notices', () => {
    const route = read('src/app/api/packets/[id]/resend/route.ts')
    expect(route).toContain('message: resentSays(facts)')
    expect(route).toContain('if (!resendEmailLeaves(facts))')
    expect(route).not.toContain('leaves || recipient')
    // The person has an account, and no email can leave: never "Sent again".
    const says = resentSays({ leaves: false, address: 'rajesh.iyer@brightmoor.example', hasAccount: true, waitingOn: 'the I-9', until: 'Dec 3, 2026' })
    expect(says).not.toMatch(/^Sent again/)
    expect(says).toContain('The link is kept on your notices')
  })
})

describe('Document requests says why Send the request cannot be pressed', () => {
  it('while nobody is chosen, "Choose who the request goes to" is drawn beside the button', () => {
    expect(sendRequestMissing({ packetKey: 'W2_START', email: 'omar@x.example', subject: 'PERSON', subjectPersonId: '', subjectCompanyId: '' })).toBe('Choose who the request goes to.')
    expect(sendRequestMissing({ packetKey: 'W2_START', email: 'omar@x.example', subject: 'PERSON', subjectPersonId: 'omar', subjectCompanyId: '' })).toBeNull()
    const page = read('src/app/dashboard/packets/page.tsx')
    expect(page).toContain('disabled={!!sendMissing}')
    expect(page).toContain('{sendMissing && <span')
  })
})
