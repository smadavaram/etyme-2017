import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAY_HAND_OVER, copySentence, keptLinkIn, sampleRefusal, signInLetter, signInLineSays, tokenOf, sendFirstAction,
  calledOnRow, sampleSays, alreadySignsInRefusal, awaitsHerYes, awaitingYesRefusal,
  notHereYetSays, signInDoorSends, signInDoorLive, signInDoorPage, signInDoorGone, isSignInDoorLink,
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
    expect(line.note).toBe('It works until Nov 6, 2026, for rajesh@example.com.')
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

  it('a person who has not come in here is offered a sign-in link to file timesheets, in words that claim nothing about an account', () => {
    const line = signInLineSays({ ...facts, state: 'NONE_YET' })
    expect(line.says).toBe('Rajesh files timesheets in Etyme. If Rajesh cannot sign in yet, give Rajesh a sign-in link.')
    expect(notHereYetSays('Rajesh Iyer')).toBe(line.says)
    expect(line.action).toBe('Make a sign-in link')
    // A link that ran out reads the same, with what to do.
    const ran = signInLineSays({ ...facts, state: 'RAN_OUT', at: '2026-11-03T09:00:00Z' })
    expect(ran.says).toBe(line.says)
    expect(ran.note).toBe('The link made on Nov 3, 2026 has run out. Make a new one and send it to Rajesh yourself.')
  })

  it('a link that was opened says so, the same whichever way the door sent her, and offers a new one', () => {
    const line = signInLineSays({ ...facts, state: 'OPENED', at: '2026-11-04T09:00:00Z' })
    expect(line.says).toBe('Rajesh opened the sign-in link on Nov 4, 2026.')
    expect(line.note).toBe('If Rajesh still cannot sign in, make a new link and send it to Rajesh yourself.')
    expect(line.action).toBe('Make a new link')
  })

  it('a person at a sample address is called a sample person with nothing to send, and offers nothing to press', () => {
    const line = signInLineSays({ name: 'Rajesh Iyer', email: 'rajesh@brightmoor.example', state: 'DEMO' })
    expect(line.says).toBe('Rajesh is a sample person. No email can reach rajesh@brightmoor.example, so there is nothing to send.')
    expect(line.note).toBeNull()
    expect(line.action).toBeNull()
  })

  it('a sample person\'s line never sends an office manager to a demo page or a password she cannot act on (fix list, layer five, g)', () => {
    const line = signInLineSays({ name: 'Rajesh Iyer', email: 'rajesh@brightmoor.example', state: 'DEMO' })
    const words = [line.says, line.note ?? '', sampleRefusal('Rajesh Iyer', 'rajesh@brightmoor.example')].join(' ')
    expect(words).not.toMatch(/demo page|password|demo seat|belongs to the Etyme demo/i)
    expect(read('src/lib/notify/sign-in-link-door.ts')).toMatch(/sampleRefusal\(g\.as\.called, g\.person\.primaryEmail\)/)
  })

  it('a kept link is read off the notice\'s last line, and a sent notice keeps none', () => {
    const lines = ['Hello Rajesh,']
    const link = 'https://etyme2040.vercel.app/reset/abcDEF_12-3'
    expect(keptLinkIn(recordedBody(lines, link, 'NOT_CONFIGURED'))).toBe(link)
    expect(keptLinkIn(recordedBody(lines, link, 'SENT'))).toBeNull()
    expect(keptLinkIn(recordedBody(lines, link, 'FAILED'))).toBeNull()
    expect(keptLinkIn('Hello\nhttps://evil.example/phish')).toBeNull()
    expect(tokenOf(link)).toBe('abcDEF_12-3')
    // The sign-in door's link, kept the same way; a link kept before it still reads.
    const door = 'https://etyme2040.vercel.app/answer/sign-in/U0lHTl9JTl9ET09SOmFiYw.Zm9vYmFy_-'
    expect(keptLinkIn(recordedBody(lines, door, 'NOT_CONFIGURED'))).toBe(door)
    expect(isSignInDoorLink(door)).toBe(true)
    expect(tokenOf(door)).toBeNull()
    expect(keptLinkIn('Hello\nhttps://evil.example/answer/sign-in/abc')).toBeNull()
  })

  it('the letter names the firm and the timesheet, and calls the person by name, never by a pronoun', () => {
    const letter = signInLetter({ name: 'Rajesh Iyer', firmName: 'Brightmoor Staffing', loginUrl: 'https://etyme2040.vercel.app/login' }).join(' ')
    expect(letter).toMatch(/Brightmoor Staffing uses Etyme/)
    expect(letter).toMatch(/timesheet/)
    expect(letter).not.toMatch(/\b(he|she|his|her|him)\b/i)
    // One letter for every address: it says both ways, never which.
    expect(letter).toMatch(/Open the link below to sign in\. If you have no Etyme password yet, you choose one there\./)
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

describe('before her yes, the sign-in line names her as the firm typed her (batch five, the walk of 2026-11-16)', () => {
  it('the sample-person line names her as the firm typed her before her yes', () => {
    const name = calledOnRow({ ownName: 'Daniel Osei', beforeHerYes: true, typedName: 'Theo Marchetti' })
    expect(name).toBe('Theo Marchetti')
    const line = signInLineSays({ name, email: 'daniel.osei@harborline-tech.example', state: 'DEMO' })
    expect(line.says).toBe('Theo is a sample person. No email can reach daniel.osei@harborline-tech.example, so there is nothing to send.')
    expect(sampleRefusal(name, 'daniel.osei@harborline-tech.example')).toBe('Theo is a sample person. No email can reach daniel.osei@harborline-tech.example, so no sign-in link can be sent.')
    expect(line.says).not.toMatch(/Daniel/)
  })

  it('where the firm typed no name, the sample-person line says This person, never the name on her own record', () => {
    const name = calledOnRow({ ownName: 'Daniel Osei', beforeHerYes: true, typedName: null })
    expect(name).toBeNull()
    expect(sampleSays(name, 'daniel.osei@harborline-tech.example')).toBe('This person is a sample person. No email can reach daniel.osei@harborline-tech.example, so there is nothing to send.')
  })

  it('every other line the firm reads before her yes says This person where it typed no name, and reads as a sentence', () => {
    const facts = { name: null, email: 'daniel.osei@harborline-tech.example' }
    expect(signInLineSays({ ...facts, state: 'NONE_YET' }).says).toBe('This person files timesheets in Etyme. If they cannot sign in yet, give them a sign-in link.')
    expect(signInLineSays({ ...facts, state: 'OPENED' }).says).toBe('This person opened the sign-in link.')
    expect(signInLineSays({ ...facts, state: 'KEPT' }).says).toBe('No email can leave this deployment. Copy this sign-in link and send it to them yourself.')
    expect(copySentence(null)).toBe('No email can leave this deployment. Copy this sign-in link and send it to them yourself.')
    expect(signInLineSays({ ...facts, state: 'RAN_OUT' }).note).toBe('The last link has run out. Make a new one and send it to them yourself.')
    expect(alreadySignsInRefusal(null)).toBe('This person already signs in to Etyme, so there is no link to make. They can reset a forgotten password from the sign-in page.')
    expect(alreadySignsInRefusal('Rajesh Iyer')).toBe('Rajesh already signs in to Etyme, so there is no link to make. Rajesh can reset a forgotten password from the sign-in page.')
  })

  it('after her yes, or where the firm reads her record, the line reads her own name as before', () => {
    expect(calledOnRow({ ownName: 'Daniel Osei', beforeHerYes: false, typedName: 'Theo Marchetti' })).toBe('Daniel Osei')
  })

  it('the door reads the name through the one reader of what a firm reads before her yes, and only the letter she receives keeps her own name', () => {
    const door = read('src/lib/notify/sign-in-link-door.ts')
    expect(door).toMatch(/firmReadsAt\(/)
    expect(door).toMatch(/signInLineSays\(\{ state, name: called,/)
    expect(door).toMatch(/alreadySignsInRefusal\(g\.as\.called\)/)
    expect(door).toMatch(/signInLetter\(\{ name: g\.person\.name,/)
    expect(door).toMatch(/made a sign-in link for \$\{g\.as\.logged\}/)
  })
})

describe('before her yes, the sign-in line never says whether her address has an account (batch five, 2026-11-16)', () => {
  const asked = { seatHere: false, paysHerDirect: false }

  it('a person asked onto the bench who has not answered, or who said no, is before her yes', () => {
    expect(awaitsHerYes({ ...asked, listingState: 'INVITED' })).toBe(true)
    expect(awaitsHerYes({ ...asked, listingState: 'DECLINED' })).toBe(true)
  })

  it('after her yes, or where the firm employs her or pays her direct, the line reads as before', () => {
    expect(awaitsHerYes({ ...asked, listingState: 'GRANTED' })).toBe(false)
    expect(awaitsHerYes({ seatHere: true, paysHerDirect: false, listingState: 'INVITED' })).toBe(false)
    expect(awaitsHerYes({ seatHere: false, paysHerDirect: true, listingState: 'INVITED' })).toBe(false)
    expect(awaitsHerYes({ seatHere: true, paysHerDirect: false, listingState: null })).toBe(false)
  })

  it('before her yes the line says nothing and names nobody, and a press is refused in one sentence with no name in it', () => {
    for (const name of ['Rajesh Iyer', null]) {
      const line = signInLineSays({ name, email: 'rajesh@example.com', state: 'AWAITING_YES' })
      expect(line).toEqual({ says: '', note: null, action: null })
    }
    expect(awaitingYesRefusal()).toBe('This person has not said yes to your bench invitation, so there is no sign-in link to make. The invitation is their way in.')
    expect(awaitingYesRefusal()).not.toMatch(/account|signs in/)
  })

  it('the door decides before her yes first, on the row and on a press, and draws no line for it', () => {
    const door = read('src/lib/notify/sign-in-link-door.ts')
    const row = door.slice(door.indexOf('async function lineFor('), door.indexOf('/** GET: what the row says.'))
    expect(row.indexOf("if (awaitsYes) return draw('AWAITING_YES')")).toBeGreaterThan(-1)
    expect(row.indexOf("if (awaitsYes) return draw('AWAITING_YES')")).toBeLessThan(row.indexOf('await signsInHere('))
    const press = door.slice(door.indexOf('export async function makeSignInLink('), door.indexOf('// ── The sign-in door, at use'))
    expect(press.indexOf('if (g.awaitsYes)')).toBeGreaterThan(-1)
    expect(press.indexOf('if (g.awaitsYes)')).toBeLessThan(press.indexOf('await signsInHere('))
    expect(door).toMatch(/show: state !== 'SIGNS_IN_HERE' && state !== 'AWAITING_YES'/)
  })
})

describe('a seat never signed in here reads the same whether or not the address has an account elsewhere (2026-11-16)', () => {
  const door = read('src/lib/notify/sign-in-link-door.ts')
  const atUse = door.indexOf('// ── The sign-in door, at use')

  it('a seat never signed in here reads the same sign-in line whether or not the address has an account elsewhere, in the words and in the route\'s reply', () => {
    // The line and the press never read her account: no password, no sign-in, anywhere before the door at use.
    const beforeDoor = door.slice(0, atUse)
    const hasWayIn = beforeDoor.slice(beforeDoor.indexOf('async function hasWayIn('), beforeDoor.indexOf('/** What the sign-in door keeps'))
    const rest = beforeDoor.replace(hasWayIn, '')
    expect(rest).not.toMatch(/passwordHash|credentials|hasWayIn\(/)
    expect(rest).not.toMatch(/hasAccount/)
    // What makes the line go quiet is this firm's own record: her acts on a seat here.
    expect(door).toMatch(/actorPersonId: personId, actorCompanyId: companyId/)
    // The words take no account fact.
    expect(notHereYetSays('Rajesh Iyer')).not.toMatch(/account|already/)
  })

  it('a firm\'s own new employee can still be given a way in where no email can leave: one link, and the door decides at use', () => {
    expect(signInDoorSends({ hasWayIn: false })).toBe('CHOOSE_PASSWORD')
    expect(signInDoorSends({ hasWayIn: true })).toBe('SIGN_IN')
    const at = door.slice(atUse)
    // Only the door reads whether she has a way in, and only it makes the one-time password link.
    expect(at).toMatch(/signInDoorSends\(\{ hasWayIn: await hasWayIn\(/)
    expect(at).toMatch(/issueSetPassword\(/)
    expect(door.slice(0, atUse)).not.toMatch(/issueSetPassword\(/)
  })

  it('the page a sign-in link opens reads the same for every address, and a press decides, never an open', () => {
    const page = signInDoorPage('Brightmoor Staffing')
    expect(page).toEqual({
      heading: 'Sign in to Etyme',
      says: 'Brightmoor Staffing uses Etyme for your work. You file your own timesheets there.',
      button: 'Continue',
      after: 'If you already sign in to Etyme, you sign in as usual. If not, you choose a password.',
    })
    expect(signInDoorGone('Brightmoor Staffing')).toBe('This sign-in link has run out or a newer one was made. Ask Brightmoor Staffing for a new link.')
    const pageSrc = read('src/app/answer/sign-in/[token]/page.tsx')
    expect(pageSrc).toMatch(/<form method="post"/)
    expect(pageSrc).not.toMatch(/enterSignInDoor\(/)
  })

  it('a sign-in link works until it runs out or a newer one is made', () => {
    const madeAt = new Date('2026-11-03T09:00:00Z')
    expect(signInDoorLive({ madeAt, isNewest: true, now: new Date('2026-11-05T09:00:00Z') })).toBe(true)
    expect(signInDoorLive({ madeAt, isNewest: true, now: new Date('2026-11-06T09:00:00Z') })).toBe(false)
    expect(signInDoorLive({ madeAt, isNewest: false, now: new Date('2026-11-03T10:00:00Z') })).toBe(false)
  })

  it('the one-time password link goes to her browser as a redirect, never into a reply body, a log or the notice', () => {
    const route = read('src/app/api/answer/sign-in/[token]/route.ts')
    expect(route).toMatch(/NextResponse\.redirect\(new URL\(to, request\.url\), 303\)/)
    expect(route).not.toMatch(/NextResponse\.json/)
    const at = door.slice(atUse)
    expect(at).not.toMatch(/recordAccess|automationLog|console\./)
  })
})
