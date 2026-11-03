import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAY_HAND_OVER, copySentence, keptLinkIn, signInLetter, signInLineSays, tokenOf, sendFirstAction,
} from '@/lib/notify/sign-in-link'
import { recordedBody } from '@/lib/notify/account-mail'

/**
 * A sign-in link on a person's row, at the firm that employs or lists
 * them (the founder's retest, 2026-11-03: Rajesh Iyer placed and unable
 * to sign in, with no email able to leave). The words and the rules; the
 * route is walked in `__integration__/sign-in-link.test.ts`.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const facts = { name: 'Rajesh Iyer', email: 'rajesh@example.com' }

describe('the sign-in line on a person\'s row', () => {
  it('where no email can leave, the row says the founder\'s sentence and keeps the link to copy', () => {
    const line = signInLineSays({ ...facts, state: 'KEPT', until: '2026-11-06T12:00:00Z' })
    expect(line.says).toBe('No email can leave this deployment. Copy this sign-in link and send it to Rajesh yourself.')
    expect(copySentence('Rajesh Iyer')).toBe(line.says)
    expect(line.note).toBe('It works once, until Nov 6, 2026, for rajesh@example.com.')
    expect(line.action).toBe('Make a new link')
  })

  it('where email can leave, the row says it was sent and offers Send again', () => {
    const line = signInLineSays({ ...facts, state: 'SENT', at: '2026-11-03T09:00:00Z' })
    expect(line.says).toBe('Rajesh was sent a sign-in link on Nov 3, 2026, to rajesh@example.com.')
    expect(line.action).toBe('Send again')
    expect(sendFirstAction()).toBe('Send a sign-in link')
  })

  it('a failed send says so and how to fix it, and offers Send again', () => {
    const line = signInLineSays({ ...facts, state: 'FAILED', at: '2026-11-03T09:00:00Z' })
    expect(line.says).toBe('The sign-in link to rajesh@example.com did not go on Nov 3, 2026.')
    expect(line.action).toBe('Send again')
  })

  it('a person with no link yet is told what it stops: no timesheet can be filed', () => {
    const line = signInLineSays({ ...facts, state: 'NONE_YET' })
    expect(line.says).toBe('Rajesh cannot sign in to Etyme yet, so Rajesh cannot file a timesheet.')
    expect(line.action).toBe('Make a sign-in link')
  })

  it('a demo address is told it opens from the demo page, and offers nothing to press', () => {
    const line = signInLineSays({ name: 'Rajesh Iyer', email: 'rajesh@brightmoor.example', state: 'DEMO' })
    expect(line.action).toBeNull()
    expect(line.note).toMatch(/demo page/)
  })

  it('a kept link is read off the notice\'s last line, and a sent notice keeps none', () => {
    const lines = ['Hello Rajesh,']
    const link = 'https://etyme2040.vercel.app/reset/abcDEF_12-3'
    expect(keptLinkIn(recordedBody(lines, link, 'NOT_CONFIGURED'))).toBe(link)
    expect(keptLinkIn(recordedBody(lines, link, 'SENT'))).toBeNull()
    expect(keptLinkIn(recordedBody(lines, link, 'FAILED'))).toBeNull()
    expect(keptLinkIn('Hello\nhttps://evil.example/phish')).toBeNull()
    expect(tokenOf(link)).toBe('abcDEF_12-3')
  })

  it('the letter names the firm and the timesheet, and calls the person by name, never by a pronoun', () => {
    const letter = signInLetter({ name: 'Rajesh Iyer', firmName: 'Brightmoor Staffing', loginUrl: 'https://etyme2040.vercel.app/login' }).join(' ')
    expect(letter).toMatch(/Brightmoor Staffing uses Etyme/)
    expect(letter).toMatch(/timesheet/)
    expect(letter).not.toMatch(/\b(he|she|his|her|him)\b/i)
  })

  it('the link is drawn only for a seat that may invite: the same permission the invite route asks for', () => {
    expect(MAY_HAND_OVER).toBe('team.manage')
    expect(read('src/app/api/access/invite/route.ts')).toMatch(/hasPermission\(caller\.permissions, 'team\.manage'\)/)
    const door = read('src/lib/notify/sign-in-link-door.ts')
    expect(door).toMatch(/hasPermission\(caller\.permissions, MAY_HAND_OVER\)/)
  })

  it('every answer the door gives, refusals included, is logged before it returns, and the link comes from the password door', () => {
    const door = read('src/lib/notify/sign-in-link-door.ts')
    // Refusals are awaited, never fire-and-forget.
    expect(door).toMatch(/await recordRefusal\(/)
    expect(door).not.toMatch(/\blogAccess\(/)
    expect((door.match(/await recordAccess\(/g) ?? []).length).toBe(2)
    // One way a link is made, and it is never a second record of the person.
    expect(door).toMatch(/issueSetPassword\(/)
    expect(door).not.toMatch(/person\.create\(/)
  })
})
