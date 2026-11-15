import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeSendSays } from '@/lib/money/bill-before-send'
import { raisersSays } from '@/lib/money/who-raises-bills'
import { viewBefore, viewAfterRefusal, type StartPreflight } from '@/app/dashboard/contracts/activate-view'
import { payrollRunSays, postedInMoreThanOneCurrency } from '@/lib/money/payroll-run-says'

/**
 * The founder's walk of the money chain, 2026-11-15 (layer 2): a small
 * supplier with W-2 people at clients off Etyme, seated with an Owner,
 * HR, an Account Manager and one AP & Payroll person. The figures were
 * right; these are the sentences that were not true and the presses that
 * said nothing. Made-up firms only.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a bill is raised, then sent, in one set of words', () => {
  it('right after raising, the answer says the bill was raised, never generated', () => {
    const src = read('src/lib/money/bill-generate.ts')
    expect(src).toMatch(/message: `Bill \$\{result\.number\} \$\{draft \? 'drafted' : 'raised'\}/)
    expect(src).not.toMatch(/message: `Bill \$\{result\.number\} \$\{draft \? 'drafted' : 'generated'\}/)
  })

  it('the bill’s own page reads its state from the one reader the Bills list reads, and its second act is Send', () => {
    const page = read('src/app/dashboard/invoices/[id]/page.tsx')
    expect(page).toMatch(/billStateWord\(inv\.status, inv\.direction === 'PAYABLE' \? 'PAYER' : 'SENDER'\)/)
    expect(page).not.toMatch(/Raised, not yet submitted|Submitted for payment|Submit for payment/)
  })

  it('before Send, a bill to a client off Etyme where no email can leave says it will be marked sent and emailed to nobody', () => {
    const says = beforeSendSays({ payerName: 'Harborline Tech', payerOnEtyme: false, mailLeaves: false })
    expect(says).toBe('No email can be sent from here yet, so Send marks it sent and emails nobody at Harborline Tech.')
  })

  it('before Send, a bill to a client off Etyme where email can leave says who at the client it is emailed to', () => {
    const says = beforeSendSays({ payerName: 'Harborline Tech', payerOnEtyme: false, mailLeaves: true })
    expect(says).toBe('Send emails it to your contacts at Harborline Tech: accounts payable if you recorded one, otherwise all of them.')
  })

  it('before Send, a bill to a client on Etyme says it is shown in Etyme, and never promises an email that cannot leave', () => {
    expect(beforeSendSays({ payerName: 'Corvane Packaging', payerOnEtyme: true, mailLeaves: true }))
      .toBe('Send shows it in Etyme to the people at Corvane Packaging who record payments.')
    expect(beforeSendSays({ payerName: 'Corvane Packaging', payerOnEtyme: true, mailLeaves: false }))
      .toMatch(/No email can be sent from here yet\.$/)
  })

  it('the bill’s page prints the line before Send, from the bill route', () => {
    expect(read('src/app/api/invoices/[id]/route.ts')).toMatch(/beforeSendSays\(\{ payerName: payer\.name, payerOnEtyme: payer\.claimedAt != null, mailLeaves: mailLeaves\(\) \}\)/)
    expect(read('src/app/dashboard/invoices/[id]/page.tsx').match(/inv\.beforeSend/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('who raises a bill is named from the seats the firm has filled', () => {
  it('at a firm where only the Owner holds the bill permission, a seat that may not is told to ask the Owner', () => {
    expect(raisersSays(['Owner'])).toBe('Raising a bill is for the Owner here. Ask them.')
  })

  it('a role nobody is seated in is never named, and a seated billing role is named before the Owner', () => {
    const says = raisersSays(['Owner', 'Accounts Receivable', 'Owner'])!
    expect(says).toBe('Raising a bill is for the Accounts Receivable or Owner here. Ask one of them.')
    expect(raisersSays(['Owner'])).not.toMatch(/Finance|Accounts Receivable/)
  })

  it('where no seat holds it, the sentence falls back to the role names', () => {
    expect(raisersSays([])).toBeNull()
  })

  it('both doors of the bill route ask who is seated, not the role set alone', () => {
    const src = read('src/app/api/invoices/generate/route.ts')
    expect(src.match(/message: await whoRaisesBillsSays\(caller\)/g)?.length).toBe(2)
    expect(src).not.toMatch(/doing: 'Raising a bill'/)
  })
})

describe('a placement blocked on a missing I-9 links to where the I-9 is recorded', () => {
  const blocked: StartPreflight = {
    may: true, state: 'DRAFT', says: null, terms: null,
    papers: {
      outcome: 'BLOCK',
      says: 'Amara Velde cannot start without proof of right to work (I-9).',
      fix: 'Get proof of right to work (I-9) on file, then activate.',
      door: { says: 'Record the I-9 on Compliance', href: '/dashboard/compliance?record=I9&person=p1' },
      whoRecords: null,
    },
  }

  it('a seat that may record the I-9 reads a link to Record the I-9 on Compliance for that person', () => {
    const view = viewBefore(blocked)
    expect(view.door).toEqual({ says: 'Record the I-9 on Compliance', href: '/dashboard/compliance?record=I9&person=p1' })
    expect(read('src/app/dashboard/contracts/activate-panel.tsx')).toMatch(/<Link href=\{view\.door\.href as Route\}/)
  })

  it('a seat that may not record it reads who does, and no link', () => {
    const view = viewBefore({ ...blocked, papers: { ...blocked.papers!, door: null, whoRecords: 'Recording the I-9 is for the HR here. Ask them.' } })
    expect(view.door).toBeNull()
    expect(view.says).toMatch(/Recording the I-9 is for the HR here\. Ask them\.$/)
  })

  it('pressing Activate again on the same block answers "Still blocked:" and keeps the link', () => {
    const before = viewBefore(blocked)
    const after = viewAfterRefusal({ code: 'DOCUMENTS_BLOCK', message: blocked.papers!.says, fix: blocked.papers!.fix }, 403, before)
    expect(after.says).toBe('Still blocked: Amara Velde cannot start without proof of right to work (I-9). Get proof of right to work (I-9) on file, then activate.')
    expect(after.door).toEqual(before.door)
  })

  it('a server that did not answer is never called still blocked', () => {
    expect(viewAfterRefusal(null, null, viewBefore(blocked)).says).toBe('The start could not be checked. Try again.')
  })
})

describe('Calculate and Process say what they did', () => {
  const amara = { personName: 'Amara Velde', grossPay: 180_000, totalHours: 40, currency: 'USD', refused: null }

  it('Process says who was paid, how much, and the period’s pay day, never the day it was pressed', () => {
    expect(payrollRunSays('process', { details: [amara], payOn: '2026-11-27' }))
      .toBe('Processed pay for Amara Velde: $1,800.00 for 40 hours, paid on the pay day, Fri, Nov 27, 2026.')
  })

  it('Calculate says who was worked out, how much, and when it is to be paid', () => {
    expect(payrollRunSays('calculate', { details: [amara], payOn: '2026-11-27' }))
      .toBe('Worked out pay for Amara Velde: $1,800.00 for 40 hours, to be paid Fri, Nov 27, 2026.')
  })

  it('a press that paid nobody says so', () => {
    expect(payrollRunSays('process', { details: [{ ...amara, grossPay: 0, refused: 'No accepted hours for Amara Velde, so there is no period to pay.' }] }))
      .toBe('Nothing was paid. Each row says why.')
    expect(payrollRunSays('calculate', { details: [] })).toBe('Nothing was worked out. Each row says why.')
  })

  it('the Payroll page prints the sentence from the run route’s own reply, and the route names the period’s pay day', () => {
    expect(read('src/app/dashboard/payroll/page.tsx')).toMatch(/setRunSaid\(payrollRunSays\(action, body\.data \?\? \{\}\)\)/)
    expect(read('src/app/api/payroll/run/route.ts')).toMatch(/payOn: askedIsOwn && askedKey && co \? periodHolding\(askedKey, co\.rhythm, co\.rule\)\?\.payOn/)
  })

  it('a firm with nothing posted in the year is never told it was paid in more than one currency', () => {
    expect(postedInMoreThanOneCurrency([])).toBe(false)
    expect(postedInMoreThanOneCurrency([{ currency: 'USD', postings: 3 }])).toBe(false)
    expect(postedInMoreThanOneCurrency([{ currency: 'USD', postings: 3 }, { currency: 'INR', postings: 1 }])).toBe(true)
    expect(postedInMoreThanOneCurrency([{ currency: null, postings: 2 }])).toBe(true)
    expect(read('src/app/dashboard/payroll/page.tsx')).toMatch(/!data\.pack\.currency && postedInMoreThanOneCurrency\(summaries\)/)
  })
})

describe('what a firm that buys from no supplier reads, and what recording a placement says', () => {
  it('Payables does not print the sub-vendor and signed-hours lines under the list that already says what is true for the firm', () => {
    expect(read('src/app/dashboard/ap/page.tsx')).toMatch(/data\?\.source === 'NONE' && book && \(/)
  })

  it('the answer after recording a placement never ends in a count of cycles', () => {
    const src = read('src/app/api/contracts/route.ts')
    expect(src).not.toMatch(/\$\{result\.sellCyclesCreated\} cycles\$\{/)
  })
})

describe('the week page, the placement drawer and Send say what the firm’s own seats and the bill’s page say (layer 2 press, 2026-11-15)', () => {
  it('any act names only the roles seated here, the Owner included, and falls back where nobody is seated', async () => {
    const { seatedSays } = await import('@/lib/money/who-raises-bills')
    expect(seatedSays('Starting a placement', ['Owner'])).toBe('Starting a placement is for the Owner here. Ask them.')
    expect(seatedSays('Ending a placement', ['Owner', 'Owner'])).toBe('Ending a placement is for the Owner here. Ask them.')
    expect(seatedSays('Starting a placement', [])).toBeNull()
  })

  it('the week page asks the Bills page’s own reader for a seat that does not bill, so the two pages say one sentence', () => {
    const src = read('src/lib/money/week-bill.ts')
    expect(src).toMatch(/await whoRaisesBillsSays\(\{ publicSeat: caller\.publicSeat \?\? false, company: /)
  })

  it('the placement drawer names who here may, in the GET and the POST, for every act the door refuses', () => {
    const src = read('src/app/api/contracts/[id]/activate/route.ts')
    expect(src).toMatch(/whoHereMaySays\(caller, \{ doing: DOING\[action\], needs: NEEDS\[action\] \}\)/)
    expect(src).toMatch(/await seatedRefusal\(caller, gated, 'activate'\)/)
    expect(src).toMatch(/await seatedRefusal\(caller, gated, action as Action\)/)
  })

  it('after Send, the answer names the bill’s state in the word the bill’s page reads, never "submitted for client review"', async () => {
    const { billStateWord } = await import('@/lib/money/bill-state')
    expect(billStateWord('SUBMITTED')).toBe('Sent, not yet paid')
    const src = read('src/app/api/invoices/[id]/submit/route.ts')
    expect(src).toContain('message: `Bill ${result.number}: ${billStateWord(result.status)}`')
    expect(src).not.toMatch(/for client review/)
  })
})
