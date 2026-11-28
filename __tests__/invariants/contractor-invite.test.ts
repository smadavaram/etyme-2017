import { describe, it, expect } from 'vitest'
import {
  mayInvite, stateAfterAnswer, says, stepsOf, linkIsOpen, STATE_WORD, INVITE_STATES,
  type InviteState, type Answer,
} from '@/lib/contractor-invite'
import { inviteLetter } from '@/lib/contractor-link'

/**
 * Asking somebody you already know onto your network.
 *
 * The rules, without a database. What this file is really guarding is
 * the one thing the feature must never become: a way for a client to
 * engage a contractor directly. Every path through it ends with a
 * supplier holding the paper, and the tests below say so in the three
 * shapes an answer can take.
 */

const answer = (over: Partial<Answer> = {}): Answer => ({
  interested: true, represents: 'NOBODY', firmName: null, firmCompanyId: null,
  note: null, at: '2026-09-14T00:00:00.000Z', ...over,
})

describe('who may be asked', () => {
  const base = { email: 'lucia@example.com', name: 'Lucía Fernández', blockedReason: null, alreadyOnRegister: false, openInviteState: null }

  it('somebody the team knows, who no supplier has put forward, can be asked', () => {
    expect(mayInvite(base).ok).toBe(true)
  })

  it('a person this client barred does not come back through a side door, and is refused with the reason they were barred for', () => {
    const v = mayInvite({ ...base, blockedReason: 'Walked off a Talvern Medical site with no notice.' })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('BLOCKED')
    expect(v.ok === false && v.message).toContain('Walked off a Talvern Medical site')
    expect(v.ok === false && v.message).toContain('Lift the block first')
  })

  it('somebody already on the register is sent to "Ask for them" instead, by name, rather than asked twice', () => {
    const v = mayInvite({ ...base, alreadyOnRegister: true })
    expect(v.ok === false && v.code).toBe('ALREADY_HERE')
    expect(v.ok === false && v.message).toContain('Ask for them')
  })

  it('asking the same person twice is the same ask, and says where the first one got to', () => {
    const v = mayInvite({ ...base, openInviteState: 'NEEDS_SUPPLIER' })
    expect(v.ok === false && v.code).toBe('ALREADY_ASKED')
    expect(v.ok === false && v.message).toContain('Pending')
  })

  it('somebody who said no, or an ask that was withdrawn, can be asked again later', () => {
    for (const state of ['DECLINED', 'WITHDRAWN'] as InviteState[]) {
      expect(mayInvite({ ...base, openInviteState: state }).ok, state).toBe(true)
    }
  })

  it('an address that is not an address is caught before anybody is emailed', () => {
    expect(mayInvite({ ...base, email: 'lucia at example' }).ok).toBe(false)
  })
})

describe('where an answer takes it', () => {
  it('a firm the client has already approved carries it straight through', () => {
    expect(stateAfterAnswer({ interested: true, represents: 'ON_BENCH' })).toBe('REPRESENTED')
  })

  it('a firm the client does not have is not a shortcut into its supplier register — it waits for the client', () => {
    expect(stateAfterAnswer({ interested: true, represents: 'OTHER_FIRM' })).toBe('NEEDS_SUPPLIER')
  })

  it('nobody representing them waits for the client too, because the client may not engage them itself', () => {
    expect(stateAfterAnswer({ interested: true, represents: 'NOBODY' })).toBe('NEEDS_SUPPLIER')
  })

  it('somebody who is not looking ends it, and nothing chases them', () => {
    expect(stateAfterAnswer({ interested: false, represents: null })).toBe('DECLINED')
  })
})

describe('what the client reads on the row', () => {
  const of = (state: InviteState, over: Partial<{ answer: Answer | null; supplierName: string | null }> = {}) =>
    says({ state, name: 'Lucía Fernández', answer: over.answer ?? null, supplierName: over.supplierName ?? null }, { mail: true })

  it('every state says what is happening in a sentence, never a state name', () => {
    for (const state of INVITE_STATES) {
      const line = of(state)
      expect(line.now, state).toMatch(/[a-z]{3,}\s+[a-z]{2,}/i)
      expect(line.now, state).not.toContain('_')
    }
  })

  it('only the two waiting on the client tell the client to do something', () => {
    const waiting = INVITE_STATES.filter((s) => of(s).next !== null)
    expect(waiting).toEqual(['NEEDS_SUPPLIER'])
  })

  it('a firm the client does not have is named, with both ways out of it', () => {
    const line = of('NEEDS_SUPPLIER', { answer: answer({ represents: 'OTHER_FIRM', firmName: 'Harbor Staffing' }) })
    expect(line.now).toContain('Harbor Staffing')
    expect(line.next).toContain('Recommend Harbor Staffing')
    expect(line.next).toContain('pick one of your own firms')
  })

  it('nobody representing them says the client contracts through suppliers, rather than leaving them to guess', () => {
    const line = of('NEEDS_SUPPLIER', { answer: answer({ represents: 'NOBODY' }) })
    expect(line.next).toContain('not directly')
  })

  it('the chip is the trade’s word for the step, never the stored state', () => {
    expect(STATE_WORD.NEEDS_SUPPLIER).toBe('Needs a supplier')
    expect(STATE_WORD.REPRESENTED).toBe('With their supplier')
    for (const state of INVITE_STATES) expect(STATE_WORD[state]).not.toContain('_')
  })
})

describe('the row’s four steps', () => {
  it('an ask nobody has answered is on the first step, with the rest still to come', () => {
    expect(stepsOf('ASKED').map((s) => s.status)).toEqual(['now', 'next', 'next', 'next'])
  })

  it('an answer that needs the client moves one step and stops there', () => {
    expect(stepsOf('NEEDS_SUPPLIER').map((s) => s.status)).toEqual(['done', 'now', 'next', 'next'])
  })

  it('a firm holding them is three steps in', () => {
    expect(stepsOf('REPRESENTED').map((s) => s.status)).toEqual(['done', 'done', 'now', 'next'])
  })

  it('somebody who said no shows where it stopped, not a half-finished chain', () => {
    const steps = stepsOf('DECLINED')
    expect(steps[1].label).toBe('Not interested')
    expect(steps.slice(2).every((s) => s.status === 'off')).toBe(true)
  })
})

describe('the link the person opens', () => {
  it('works while the ask is open and stops the moment they have answered', () => {
    expect(linkIsOpen('ASKED')).toBe(true)
    for (const state of INVITE_STATES.filter((s) => s !== 'ASKED')) {
      expect(linkIsOpen(state), state).toBe(false)
    }
  })

  it('the letter says who wants them, why, and that the client is not the employer — before it asks anything', () => {
    const letter = inviteLetter({
      name: 'Lucía Fernández', clientName: 'Northbend Athletic', inviterName: 'Dana Roy',
      reason: 'Finished twelve months on our planning team and we would take her back.',
      token: 'abc',
    })
    expect(letter.subject).toContain('Northbend Athletic')
    expect(letter.body).toContain('Dana Roy')
    expect(letter.body).toContain('planning team')
    expect(letter.body).toMatch(/rather than directly/)
    expect(letter.body).toContain('/welcome/abc')
    expect(letter.body).toMatch(/not looking/)
  })

  it('opens on their first name, because a letter to a stranger that opens "Hello," reads as a mailshot', () => {
    expect(inviteLetter({ name: 'Lucía Fernández', clientName: 'Northbend Athletic', inviterName: 'D', reason: 'r', token: 't' }).body)
      .toMatch(/^Lucía,/)
  })
})

describe('the Pending list says what it holds', () => {
  it('Pending on Contractors is about people; Pending on Suppliers is about firms — the same word, two lists', async () => {
    const { emptyWord } = await import('@/components/network-view')
    expect(emptyWord('PENDING', null, 'people')).toContain('Ask somebody you already know')
    expect(emptyWord('PENDING', null, 'firms')).toContain('Recommend a supplier')
  })

  it('an empty Pending list on Contractors never shows the suppliers sentence', async () => {
    const { emptyWord } = await import('@/components/network-view')
    expect(emptyWord('PENDING', null, 'people')).not.toContain('desk has said yes')
  })
})

// ── The supplier picker under Ask somebody (founder's retest, 2026-11-03) ──

import { readFileSync } from 'fs'
import { join } from 'path'
import { supplierChoice, NO_SUPPLIER_TO_PICK, probationAsks, takesAReason, anyToPick } from '@/lib/contractor-invite'
import { REASON_FIRST } from '@/app/dashboard/people/supplier-picker'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PICKER = read('src/app/dashboard/people/supplier-picker.tsx')
const CONTRACTORS = read('src/app/dashboard/people/page.tsx')
const PICK_ROUTE = read('src/app/api/contractor-invites/[id]/route.ts')
const LIST_ROUTE = read('src/app/api/contractor-invites/route.ts')
const WELCOME_ROUTE = read('src/app/api/contractor-welcome/[token]/route.ts')
const OPTIONS = read('src/app/api/contractor-invites/suppliers.ts')

describe('picking a supplier to take somebody on', () => {
  const firm = { name: 'Pinnacle Resourcing', tier: null, status: 'ACTIVE', blocked: false, blockedReason: null }

  it('a supplier the client approved with no standing set is offered', () => {
    expect(supplierChoice(firm)).toEqual({ offered: true, why: null })
    expect(supplierChoice({ ...firm, tier: 'APPROVED' }).offered).toBe(true)
    expect(supplierChoice({ ...firm, tier: 'PREFERRED' }).offered).toBe(true)
    // The screen, the pick and the person's own link read one rule, and
    // none of them filters on a standing any more.
    expect(CONTRACTORS).toContain("/api/contractor-invites?choices=1")
    expect(CONTRACTORS).not.toMatch(/x\.tier === 'APPROVED'/)
    for (const src of [PICK_ROUTE, LIST_ROUTE, WELCOME_ROUTE]) {
      expect(src).toContain('supplierOptions(')
      expect(src).not.toMatch(/tier: \{ in: \['APPROVED', 'PREFERRED'\] \}/)
    }
    expect(OPTIONS).toContain('supplierChoice(')
  })

  it('every disabled choice under Ask somebody says why', () => {
    expect(supplierChoice({ ...firm, blocked: true, blockedReason: 'Missed two starts.' })).toEqual({
      offered: false, why: 'Pinnacle Resourcing is blocked here: Missed two starts. Lift the block under Suppliers first.',
    })
    expect(supplierChoice({ ...firm, status: 'BLOCKED' }).why).toBe('Pinnacle Resourcing is blocked here. Lift the block under Suppliers first.')
    expect(supplierChoice({ ...firm, status: 'PROSPECT' }).why).toBe(
      'Pinnacle Resourcing is not approved yet; it goes through your supplier approvals under Suppliers.'
    )
    expect(NO_SUPPLIER_TO_PICK).toBe('No approved suppliers yet. Approve one under Suppliers, then ask.')
    // A firm held back is its sentence, never a greyed-out option; the
    // only disabled control is a button while a press is in flight.
    expect(PICKER).not.toContain('<option')
    expect(PICKER).toContain('{c.why}')
    expect(PICKER).toContain('{says}')
    // The one control that waits on the reader, the reason button, says
    // what it waits on beside it.
    expect(PICKER.match(/disabled=\{[^}]*\}/g)).toEqual(['disabled={busy}', 'disabled={busy}', 'disabled={busy || !reason.trim()}'])
    expect(PICKER).toContain('{REASON_FIRST}')
    expect(REASON_FIRST).toBe('Write the reason first.')
    expect(CONTRACTORS).not.toContain('No approved suppliers yet')
    // The pick refuses with the sentence the picker showed beside the name.
    expect(PICK_ROUTE).toContain('message: option?.why ??')
  })

  it('a supplier on probation is offered with its standing beside its name, and asked with a reason, because vendor tier warns and never blocks', () => {
    const c = supplierChoice({ ...firm, tier: 'PROBATION' })
    expect(c).toEqual({
      offered: false, withReason: true,
      why: 'Pinnacle Resourcing is on probation here. You can still ask them, with a reason; it is recorded with your name.',
    })
    expect(takesAReason(c)).toBe(true)
    // A probation firm alone is still somebody to pick, so the empty-list sentence is not said.
    expect(anyToPick([c])).toBe(true)
    expect(LIST_ROUTE).toContain('anyToPick(choices)')
    expect(PICKER).toContain('{c.name} · on probation')
    expect(PICKER).toContain('onPick(c.companyId, reason.trim())')
    expect(CONTRACTORS).toContain("...(reason ? { reason } : {})")
  })

  it('a blocked firm or one not yet approved is still refused in a sentence, and never takes a reason', () => {
    for (const f of [{ ...firm, blocked: true, blockedReason: null }, { ...firm, status: 'BLOCKED' }, { ...firm, status: 'PROSPECT' }, { ...firm, status: 'PROSPECT', tier: 'PROBATION' }, { ...firm, blocked: true, blockedReason: null, tier: 'PROBATION' }]) {
      const c = supplierChoice(f)
      expect(c.offered).toBe(false)
      expect(takesAReason(c)).toBe(false)
      expect(c.why).toMatch(/\.$/)
    }
    expect(anyToPick([supplierChoice({ ...firm, status: 'PROSPECT' })])).toBe(false)
  })

  it('asking a firm on probation with no reason is refused with the question, and the reason is recorded with who gave it before the firm is asked', () => {
    expect(probationAsks('Pinnacle Resourcing')).toBe(
      'Pinnacle Resourcing is on probation here. Say why you are asking them anyway; the reason is recorded with your name.'
    )
    expect(PICK_ROUTE).toContain("code: 'VENDOR_TIER_REASON', message: probationAsks(option.name), field: 'reason'")
    // The trail first, awaited: no reason recorded, nobody asked.
    const recordAt = PICK_ROUTE.indexOf('const recorded = await emit(')
    // The move is the write that asks the firm, which since 2026-11-08 also
    // carries the reason on the invitation (pickReason, pickedById, pickedAt).
    const moveAt = PICK_ROUTE.indexOf("state: 'REPRESENTED',\n        supplierCompanyId: approved.otherCompany.id,")
    expect(recordAt).toBeGreaterThan(0)
    expect(recordAt).toBeLessThan(moveAt)
    expect(PICK_ROUTE).toContain('actorPersonId: caller.person.id')
    expect(PICK_ROUTE).toContain("rule: 'VENDOR_TIER'")
    expect(PICK_ROUTE).toContain('givenBy: caller.person.name')
    expect(PICK_ROUTE).toContain('was not asked. Try again in a minute.')
  })

  it('the person’s own link never offers a firm on probation, because only the client can give the reason', () => {
    expect(WELCOME_ROUTE).toContain('.filter((o) => o.offered)')
    expect(WELCOME_ROUTE).toContain('option?.offered ?')
  })
})
