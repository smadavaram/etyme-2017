/**
 * Why the submit door said no.
 *
 * It answered `Requirement is DRAFT, not OPEN` — two machine states in
 * one line, and the state it named was the wrong half of the story: the
 * role the release walk hit was at DRAFT with its approval chain
 * running, waiting on HR and on the lead who owns the cost center. A
 * supplier told "DRAFT" rings the client to ask them to publish
 * something the client cannot publish yet.
 *
 * CLAUDE.md: "A refusal says what is missing and what to do... The code
 * is for the machine; the sentence is the product." And the reasons are
 * the only data nobody can buy, so the code gets narrower rather than
 * staying one NOT_OPEN over five different situations.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { whyNotOpen, putForwardNotice } from '@/app/api/submissions/words'

const ROLE = { title: 'Optical test technician', buyerName: 'Cavanaugh Glassworks' }

describe('The submit door says why a role is shut, in a sentence', () => {

  it('a role still going through approval is not called a draft', () => {
    const no = whyNotOpen({ ...ROLE, status: 'DRAFT', approvalState: 'PENDING_APPROVAL' })!
    expect(no.code).toBe('AWAITING_APPROVAL')
    expect(no.message).toBe(
      'Optical test technician has not been published yet — it is still going through ' +
      'approval at Cavanaugh Glassworks. You will be told when it opens.'
    )
  })

  it('a role an approver handed back for changes says so, so nobody chases the wrong desk', () => {
    const no = whyNotOpen({ ...ROLE, status: 'DRAFT', approvalState: 'CHANGES_REQUESTED' })!
    expect(no.code).toBe('CHANGES_WANTED')
    expect(no.message).toContain('sent it back for changes')
  })

  it('a role nobody has sent for approval says the client has not released it to anybody', () => {
    const no = whyNotOpen({ ...ROLE, status: 'DRAFT', approvalState: 'DRAFT' })!
    expect(no.code).toBe('NOT_PUBLISHED')
    expect(no.message).toContain('has not released it to any supplier')
  })

  it('a role that has been filled says the seat is taken, not FILLED', () => {
    const no = whyNotOpen({ ...ROLE, status: 'FILLED', approvalState: 'AUTO_APPROVED' })!
    expect(no.code).toBe('ALREADY_FILLED')
    expect(no.message).toContain('has been filled')
    expect(no.message).toContain('anybody you submitted has been told where they stand')
  })

  it('a role the client withdrew names the client and gives the reason it gave', () => {
    const no = whyNotOpen({
      ...ROLE, status: 'CANCELLED', approvalState: 'AUTO_APPROVED',
      cancelReason: 'the line was pushed to next year',
    })!
    expect(no.code).toBe('WITHDRAWN')
    expect(no.message).toBe(
      'Cavanaugh Glassworks withdrew Optical test technician: the line was pushed to next year. ' +
      'Nothing more can be put forward for it.'
    )
  })

  it('a role withdrawn with no reason on it still says who withdrew it', () => {
    const no = whyNotOpen({ ...ROLE, status: 'CANCELLED', approvalState: 'AUTO_APPROVED' })!
    expect(no.message).toBe(
      'Cavanaugh Glassworks withdrew Optical test technician. Nothing more can be put forward for it.'
    )
  })

  it('a finished role reads as closed and never as a draft', () => {
    const no = whyNotOpen({ ...ROLE, status: 'CLOSED', approvalState: 'AUTO_APPROVED' })!
    expect(no.code).toBe('CLOSED')
    expect(no.message).toContain('is closed')
    expect(no.message.toLowerCase()).not.toContain('draft')
  })

  it('a role turned down inside the client says it was turned down, not that it is closed', () => {
    const no = whyNotOpen({ ...ROLE, status: 'CLOSED', approvalState: 'REJECTED' })!
    expect(no.message).toContain('was turned down inside Cavanaugh Glassworks and never opened')
    expect(no.message).toContain('it will reach you as a new job')
  })

  it('a published role is not refused at all', () => {
    expect(whyNotOpen({ ...ROLE, status: 'OPEN', approvalState: 'APPROVED' })).toBeNull()
  })

  it('a client nobody named is still spoken about, as "the client"', () => {
    const no = whyNotOpen({ title: 'A role', status: 'DRAFT', approvalState: 'PENDING_APPROVAL' })!
    expect(no.message).toContain('approval at the client')
  })

  it('every refusal carries a reason code, and no two situations share one', () => {
    const cases = [
      { ...ROLE, status: 'DRAFT', approvalState: 'PENDING_APPROVAL' },
      { ...ROLE, status: 'DRAFT', approvalState: 'CHANGES_REQUESTED' },
      { ...ROLE, status: 'DRAFT', approvalState: 'DRAFT' },
      { ...ROLE, status: 'FILLED', approvalState: 'AUTO_APPROVED' },
      { ...ROLE, status: 'CANCELLED', approvalState: 'AUTO_APPROVED' },
    ]
    const codes = cases.map((c) => whyNotOpen(c)!.code)
    expect(codes.every(Boolean)).toBe(true)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('no refusal prints a database state at a supplier', () => {
    const states = ['DRAFT', 'OPEN', 'FILLED', 'CLOSED', 'CANCELLED', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'REJECTED']
    const said = [
      whyNotOpen({ ...ROLE, status: 'DRAFT', approvalState: 'PENDING_APPROVAL' }),
      whyNotOpen({ ...ROLE, status: 'DRAFT', approvalState: 'CHANGES_REQUESTED' }),
      whyNotOpen({ ...ROLE, status: 'DRAFT', approvalState: 'DRAFT' }),
      whyNotOpen({ ...ROLE, status: 'FILLED', approvalState: 'AUTO_APPROVED' }),
      whyNotOpen({ ...ROLE, status: 'CANCELLED', approvalState: 'AUTO_APPROVED' }),
      whyNotOpen({ ...ROLE, status: 'CLOSED', approvalState: 'REJECTED' }),
    ].map((r) => r!.message)
    for (const message of said) {
      for (const state of states) {
        expect(message, `"${message}" prints ${state}`).not.toContain(state)
      }
    }
  })

  it('the door sends the sentence rather than assembling one of its own', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/submissions/route.ts'), 'utf8')
    // Comments out: the one explaining why the old line went quotes it.
    const code = route.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toContain('not OPEN')
    expect(code).toContain('whyNotOpen({')
  })
})

describe('the firm a candidate goes to is told who came, from whom, for which job (simulation, 2026-10-20)', () => {
  it('one candidate is named in the title with the supplier and the job, never “New submission for …”', () => {
    const said = putForwardNotice({ supplierName: 'Brightmoor Staffing', people: ['Soren Sandoval'], roleTitle: 'Cybersecurity analyst' })
    expect(said.title).toBe('Brightmoor Staffing put Soren Sandoval forward for Cybersecurity analyst')
    expect(said.body).toBe('Brightmoor Staffing put Soren Sandoval forward for the Cybersecurity analyst job. Read the submission and decide whether to interview.')
  })

  it('two are named, more are counted in the title and every one is named in the body', () => {
    expect(putForwardNotice({ supplierName: 'Pinnacle Resourcing', people: ['Ana Ruiz', 'Omar Haddad'], roleTitle: 'Data engineer' }).title)
      .toBe('Pinnacle Resourcing put Ana Ruiz and Omar Haddad forward for Data engineer')
    const many = putForwardNotice({ supplierName: 'Pinnacle Resourcing', people: ['Ana Ruiz', 'Omar Haddad', 'Mei Mbeki'], roleTitle: 'Data engineer' })
    expect(many.title).toBe('Pinnacle Resourcing put Ana Ruiz and 2 others forward for Data engineer')
    expect(many.body).toContain('3 candidates forward for the Data engineer job: Ana Ruiz, Omar Haddad and Mei Mbeki.')
  })

  it('the submit route writes that notice to the job’s own owner first, and an Owner holding every permission is told too', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/submissions/route.ts'), 'utf8')
    expect(route).not.toContain('title: created.length === 1')
    expect(route).not.toMatch(/body: .*A candidate was submitted to your requirement/)
    expect(route).toContain('putForwardNotice({')
    expect(route).toContain("ownerId: true, raisedById: true,")
    expect(route).not.toMatch(/hasSome: \['submissions\.read'\] \}/)
  })

  it('the person put forward is told the job as well as the client, so two jobs at one client are two different lines', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/submissions/route.ts'), 'utf8')
    expect(route).not.toContain('title: `${vendorName} put you forward to ${clientName}`')
    expect(route.match(/title: `\$\{vendorName\} put you forward for \$\{requirement\.title\} at \$\{clientName\}`/g)?.length).toBe(3)
  })
})

describe('an Owner holds every permission, so an Owner is told what a desk is told (simulation, 2026-10-20)', () => {
  it('every seat filter that picks who hears in the submit, forward, contractor-invite and supplier-desk code counts `*` as holding the permission', () => {
    for (const f of [
      'src/app/api/submissions/route.ts',
      'src/app/api/submissions/[id]/forward/route.ts',
      'src/app/api/contractor-invites/[id]/route.ts',
      'src/lib/supplier-desks.ts',
      'src/app/api/requisitions/[id]/distribute/route.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      const filters = src.match(/permissions: \{ hasSome: \[[^\]]*\] \}|permissions: \{ has: [^}]+\}/g) ?? []
      expect(filters.length, f).toBeGreaterThan(0)
      for (const filter of filters) expect(filter, f).toContain("'*'")
    }
  })
})
