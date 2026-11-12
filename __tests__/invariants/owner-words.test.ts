/**
 * What a change of a company's Owners says to each reader (the Owner walk,
 * 2026-11-12), and one refusal for sending a bill again. One sentence each.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  passDoneForNewOwner, passDoneForAsker, passDoneForOthers, passDoneTitleForAsker, passCardForNewOwner, saidNoTitle, saidNoBody,
} from '@/lib/notify/owner-words'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const pass = { askerName: 'Camille Ostrander', subjectName: 'Lorena Kellerman', companyName: 'Northbend Athletic', after: 'ADMIN' as const }

describe('a pass of ownership, said to each reader', () => {
  it('the person who took over reads “You are now an Owner of Northbend Athletic. Camille Ostrander is now an Admin.”', () => {
    expect(passDoneForNewOwner(pass)).toBe('You are now an Owner of Northbend Athletic. Camille Ostrander is now an Admin.')
    expect(passDoneForNewOwner({ ...pass, after: 'OWNER' })).toBe('You are now an Owner of Northbend Athletic. Camille Ostrander stays an Owner.')
    expect(passDoneForNewOwner({ ...pass, after: 'LEAVE' })).toBe('You are now an Owner of Northbend Athletic. Camille Ostrander has left Northbend Athletic.')
  })

  it('the Owner who passed it reads “Lorena Kellerman accepted. Lorena Kellerman is now an Owner of Northbend Athletic, and you are an Admin.”', () => {
    expect(passDoneForAsker(pass)).toBe('Lorena Kellerman accepted. Lorena Kellerman is now an Owner of Northbend Athletic, and you are an Admin.')
    expect(passDoneTitleForAsker(pass)).toBe('Lorena Kellerman accepted ownership of Northbend Athletic')
  })

  it('anybody else, and the log, read it in plain third person with every person named', () => {
    expect(passDoneForOthers(pass)).toBe('Camille Ostrander passed Northbend Athletic’s ownership to Lorena Kellerman. Lorena Kellerman is now an Owner, and Camille Ostrander is now an Admin.')
  })

  it('no reader is told a machine line: no “now:”, no “accepted by”, no semicolon', () => {
    for (const s of [passDoneForNewOwner(pass), passDoneForAsker(pass), passDoneForOthers(pass)]) {
      expect(s).not.toMatch(/now:|accepted by|;/)
    }
  })

  it('the card names the asker again, never “They will be an Admin.”', () => {
    expect(passCardForNewOwner(pass)).toBe('Camille Ostrander wants to pass Northbend Athletic’s ownership to you. After this you are an Owner of Northbend Athletic. Camille Ostrander will be an Admin.')
    expect(passCardForNewOwner({ ...pass, after: 'OWNER' })).toMatch(/Camille Ostrander will be an Owner too\.$/)
    expect(passCardForNewOwner(pass)).not.toMatch(/\bThey\b/)
  })
})

describe('a no, said to the Owner who asked, says what the ask was', () => {
  it('“Lorena Kellerman said no to taking over as Owner”', () => {
    const f = { deciderName: 'Lorena Kellerman', kind: 'PASS' as const, subjectName: 'Lorena Kellerman', companyName: 'Northbend Athletic' }
    expect(saidNoTitle(f)).toBe('Lorena Kellerman said no to taking over as Owner')
    expect(saidNoBody(f)).toBe('Lorena Kellerman said no to taking over as Owner of Northbend Athletic. Nothing changed.')
  })

  it('“Ana Ruiz said no to removing Ben Ho as an Owner”, and an Owner asked about themselves reads as being removed', () => {
    expect(saidNoTitle({ deciderName: 'Ana Ruiz', kind: 'REMOVE', subjectName: 'Ben Ho', companyName: 'Northbend Athletic' }))
      .toBe('Ana Ruiz said no to removing Ben Ho as an Owner')
    expect(saidNoTitle({ deciderName: 'Ben Ho', kind: 'REMOVE', subjectName: 'Ben Ho', companyName: 'Northbend Athletic' }))
      .toBe('Ben Ho said no to being removed as an Owner')
    expect(saidNoBody({ deciderName: 'Ana Ruiz', kind: 'DEMOTE', subjectName: 'Ben Ho', companyName: 'Northbend Athletic', toRoleName: 'Admin' }))
      .toBe('Ana Ruiz said no to moving Ben Ho from Owner to Admin at Northbend Athletic. Nothing changed.')
  })

  it('never “said no to your ask about”', () => {
    const f = { deciderName: 'Ines Okafor', kind: 'REMOVE' as const, subjectName: 'Ines Okafor', companyName: 'Cavanaugh Glassworks' }
    expect(saidNoBody(f)).not.toMatch(/your ask about/)
  })
})

describe('sending a bill again is refused through the one refusal', () => {
  it('a seat that may not send bills is told through refusalFor, so a public-address seat reads that its address is why', () => {
    const file = src('src/lib/notify/bill-delivery.ts')
    expect(file).toMatch(/refusalFor\(\{ publicSeat: a\.publicSeat \?\? false, company: firm \}, \{ doing: 'Sending a bill again', needs: 'invoices\.issue' \}\)/)
    expect(file).not.toMatch(/askTheDesk/)
  })
})

describe('a bill sent to a payer on Etyme records what its channel did, never a claim made before it was tried', () => {
  it('“sent on their channel” only where the channel took it; otherwise what stopped it, in Etyme’s words', async () => {
    const { channelSays } = await import('@/lib/notify/bill-delivery')
    const { failureNote } = await import('@/lib/notify/mail-failure')
    const refused = failureNote({ provider: 'Resend', status: 403, words: 'The etyme.com domain is not verified' })
    expect(channelSays('SENT', null)).toBe('Shown in the app, and sent on their channel')
    expect(channelSays('FAILED', refused)).toMatch(/^Shown in the app; on their channel it did not go\. Etyme’s email sender refused it/)
    expect(channelSays('FAILED', refused)).not.toMatch(/Resend|403|domain/)
    expect(channelSays('NOT_CONFIGURED', null)).toBe('Shown in the app; nothing is set up to send on their channel')
    expect(channelSays('PENDING', null)).toBe('Shown in the app; their channel has not answered yet')
  })

  it('the notice is written, then its channel is waited on, before the note is recorded', () => {
    const file = src('src/lib/notify/bill-delivery.ts')
    expect(file).not.toMatch(/note: 'Shown in the app, and on their channel'/)
    expect(file).toMatch(/if \(row\) await deliverWritten\(row\.id\)/)
  })
})
