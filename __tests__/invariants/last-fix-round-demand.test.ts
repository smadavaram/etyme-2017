/**
 * Three faults the walkers found by pressing the built screens, one
 * sentence each, read against the files the screens are drawn from.
 *
 *  - An ask to become an Owner reached Today and Needs attention with a
 *    machine label and only an Open link, though the row carries the one
 *    route its answer goes through.
 *  - At a company waiting for a verified Owner, Agreements drew "Record
 *    the signature" although its route refuses, and the refusal dropped
 *    the "Prove ownership" link the route sent.
 *  - On a phone, a timesheet's Accept, "Accept fewer hours…" and reject
 *    buttons ran off the card.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chipsFor } from '@/app/dashboard/decisions/chips'
import { ownerAskRow } from '@/app/api/decisions/owner-ask'
import { needsVerifiedOwner, refusalLine, PROVE_OWNERSHIP_HREF } from '@/lib/owner-gate'
import type { AddressedAsk } from '@/lib/owner-asks'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const TODAY = 'src/app/dashboard/program/page.tsx'
const NEEDS = 'src/app/dashboard/decisions/page.tsx'

const ask: AddressedAsk = {
  id: 'ask-1', kind: 'PASS', companyId: 'co-1', companyName: 'Northbend Athletic', askedBy: 'Ines Duarte',
  subject: 'Tomas Reyes', youAreSubject: true, reason: 'Tomas runs the program day to day',
  becomes: 'Owner', canThen: '', says: '', waitsUntil: 'Nov 21, 2026', expiresAt: '2026-11-21T15:00:00.000Z',
  answerUrl: '/api/settings/owners/ask-1', href: '/dashboard/settings/owners',
}

describe('an Owner ask on Today and Needs attention is a card with Yes and No', () => {
  for (const [page, file] of [['Today', TODAY], ['Needs attention', NEEDS]] as const) {
    it(`${page} labels an Owner ask "Owner ask", never its type`, () => {
      expect(src(file)).toMatch(/OWNER_ASK:\s*'Owner ask'/)
    })

    it(`${page} draws Yes and No on an Owner ask, posting the answer to the row's own route`, () => {
      const s = src(file)
      expect(s).toMatch(/d\.type === 'OWNER_ASK' && d\.answerUrl/)
      expect(s).toContain('fetch(d.answerUrl')
      expect(s).toContain('JSON.stringify({ decision })')
      expect(s).toMatch(/'yes'[^\n]*\n[\s\S]{0,400}?'Yes'/)
      expect(s).toMatch(/'no'[^\n]*\n[\s\S]{0,400}?>\s*No\s*</)
    })

    it(`${page} shows the route's own sentence after a Yes or a No`, () => {
      expect(src(file)).toContain('out.data?.message')
    })
  }

  it('the row an Owner ask arrives on carries the one route that takes its Yes and No', () => {
    const row = ownerAskRow(ask, { askedById: 'p-ines', askerAfter: 'OWNER', subjectContextId: 'c-tomas', toRoleName: null }, 'p-tomas')
    expect(row.answerUrl).toBe('/api/settings/owners/ask-1')
    expect(src('src/app/api/settings/owners/[id]/route.ts')).toContain("['yes', 'no', 'cancel'].includes(decision)")
  })

  it('Needs attention offers an "Owner asks" chip where one is waiting', () => {
    const chips = chipsFor({ kind: 'VENDOR', isConsultant: false }, { OWNER_ASK: 1 }, 1)
    expect(chips.find((c) => c.key === 'OWNER_ASK')?.label).toBe('Owner asks')
  })
})

describe('Agreements draws Record the signature only where its route will take it', () => {
  it('the agreements read says whether signing waits on a verified Owner, through the gate the sign route reads', () => {
    const read = src('src/app/api/program/agreements/route.ts')
    expect(read).toContain("needsVerifiedOwnerAt(companyId, 'SIGN')")
    expect(read).toContain('signWaits')
    expect(src('src/app/api/program/agreements/[id]/sign/route.ts')).toContain("needsVerifiedOwnerAt(companyId, 'SIGN')")
  })

  it('at a company waiting for a verified Owner the screen draws the sentence and its Prove ownership link in place of the button', () => {
    const page = src('src/app/dashboard/program/agreements/page.tsx')
    expect(page).toContain('<OwnerGateLine line={signWaits}')
    expect(page).toContain('editable && !signWaits && signingParty !== party')
    expect(page).toContain('editable && !signWaits && signingParty === party')
  })

  it('a refused signature keeps the route’s Prove ownership link under its sentence', () => {
    const page = src('src/app/dashboard/program/agreements/page.tsx')
    expect(page).toContain('href = parsed?.error?.href')
    expect(page).toContain('refusalLine({ message: e.message, code: e.code, href: e.href })')
    const gate = needsVerifiedOwner({ name: 'Larchmere', ownerProofRequiredAt: new Date(), ownerVerifiedAt: null }, 'SIGN')
    expect(gate.ok).toBe(false)
    const line = refusalLine({ message: gate.ok ? '' : gate.says, code: 'OWNER_NOT_VERIFIED', href: gate.ok ? null : gate.href })
    expect(line?.href).toBe(PROVE_OWNERSHIP_HREF)
    expect(line?.linkSays).toBe('Prove ownership')
  })
})

describe('a timesheet row on a phone', () => {
  it('the Status cell wraps, so Accept, Accept fewer hours and reject stay on the card at 390 wide', () => {
    const page = src('src/app/dashboard/timesheets/page.tsx')
    const status = page.slice(page.indexOf("key: 'status',"))
    const cell = status.slice(status.indexOf('render: (row) =>'), status.indexOf('sortValue'))
    expect(cell).toMatch(/<div className="flex flex-wrap items-center gap-2">/)
    expect(cell).toContain('fewerButton(row.act)')
  })
})
