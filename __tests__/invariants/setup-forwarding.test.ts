import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ITEM_ORDER, ITEM_WORDS, itemsFor, checkItemAnswer, checklistFor, stateOf, itemHref, NO_FACTS } from '@/lib/setup-checklist'
import {
  forwardingView, RECIPES, NARROW, REPLACE_LINE, CONSOLE_NOTE, WHY, checkLine, keptLine, NOT_DONE_UNTIL_ON,
} from '@/lib/setup-forwarding'
import { NOT_OPEN_YET } from '@/lib/email-intake/live'

/**
 * Automatic forwarding, the setup checklist's twelfth item (founder,
 * 2026-11-11, "Ok let's do it"): a company's mail administrator sets one
 * rule, so business email reaches Etyme with no per-user mail setting.
 * Etyme never reads a mailbox, and the intake stays closed until the
 * deployment opens it.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('automatic forwarding on the setup checklist', () => {
  it('automatic forwarding is the last item, after Integrations, with its own address', () => {
    expect(ITEM_ORDER.slice(-2)).toEqual(['INTEGRATIONS', 'FORWARDING'])
    expect(ITEM_WORDS.FORWARDING.label).toBe('Automatic forwarding')
    expect(itemHref('FORWARDING')).toBe('/dashboard/settings/setup/forwarding')
  })

  it('a one-person firm is not asked to set a mail rule for a group', () => {
    expect(itemsFor('CONSULTANT_CORP')).not.toContain('FORWARDING')
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP']) expect(itemsFor(kind)).toContain('FORWARDING')
  })

  it('skipping automatic forwarding stops nothing, and the skip is recorded with who and when', () => {
    expect(ITEM_WORDS.FORWARDING.skipStops).toBe('If you skip: nothing stops. People can still forward an email by hand.')
    expect(checkItemAnswer('VENDOR', 'FORWARDING', 'SKIPPED')).toEqual({ ok: true, item: 'FORWARDING', outcome: 'SKIPPED' })
    const record = { FORWARDING: { outcome: 'SKIPPED' as const, byId: 'person-1', at: '2026-11-11T12:00:00Z' } }
    expect(stateOf('FORWARDING', record, NO_FACTS)).toBe('SKIPPED')
    // No refusal anywhere names this step: it gates no act.
    expect(src('src/lib/setup-gates.ts')).not.toMatch(/FORWARDING/)
    // The skip goes through the one door that writes who and when.
    const state = src('src/lib/setup-checklist-state.ts')
    expect(state).toMatch(/answeredById: byId, answeredAt: at/)
  })

  it('the first accepted forwarded email finishes the item another way', () => {
    expect(stateOf('FORWARDING', {}, { ...NO_FACTS, forwardingSeen: true })).toBe('DONE')
    const c = checklistFor({ kind: 'VENDOR', record: {}, facts: NO_FACTS })
    expect(c.owed).toContain('FORWARDING')
  })
})

describe('the forwarding address on the item', () => {
  it('where forwarded email is not open on this deployment, the item shows no address and says so', () => {
    // Even a company that made an address before shows none while the deployment is closed.
    const v = forwardingView({ open: false, demo: false, enabled: true, addressHint: 'tapin-…ab12@in.etyme.com' })
    expect(v.status).toBe('NOT_OPEN')
    expect(v.addressHint).toBeNull()
    expect(v.says).toBe(`${NOT_OPEN_YET} No address is shown until it is.`)
    expect(v).toMatchObject({ mayTurnOn: false, mayReplace: false, mayMarkDone: false })
    expect(checkLine(false)).toMatch(/once forwarded email is open here\.$/)
  })

  it('the item cannot be marked done until mail can arrive', () => {
    expect(forwardingView({ open: true, demo: false, enabled: false, addressHint: null })).toMatchObject({ status: 'OFF', mayTurnOn: true, mayMarkDone: false, addressHint: null })
    expect(forwardingView({ open: true, demo: true, enabled: false, addressHint: null })).toMatchObject({ status: 'DEMO', mayTurnOn: false, mayMarkDone: false })
    const on = forwardingView({ open: true, demo: false, enabled: true, addressHint: 'tapin-…ab12@in.etyme.com' })
    expect(on).toMatchObject({ status: 'ON', mayReplace: true, mayMarkDone: true, addressHint: 'tapin-…ab12@in.etyme.com' })
    // The record refuses "done" in a sentence where the intake is not on, whatever the screen sent.
    const state = src('src/lib/setup-checklist-state.ts')
    expect(state).toMatch(/v\.item === 'FORWARDING' && v\.outcome === 'DONE'/)
    expect(state).toMatch(/intakeLive\(\)/)
    expect(NOT_DONE_UNTIL_ON).toMatch(/skip it for now/)
  })

  it('the address is made and replaced only through the intake’s own Owner-or-Admin door, and never shown whole on a read', () => {
    const read = src('src/app/api/settings/setup/read.ts')
    expect(read).toMatch(/intakeStateFor\(companyId\)/)
    expect(read).not.toMatch(/addressFor|mintToken|tokenHash/)
    const screen = src('src/app/dashboard/settings/setup/items.tsx')
    expect(screen).toMatch(/fetch\('\/api\/settings\/email-intake', \{ method: 'PATCH'/)
    const door = src('src/app/api/settings/email-intake/route.ts')
    expect(door).toMatch(/INTAKE_ROLES/)
    expect(src('src/lib/email-intake/settings.ts')).toMatch(/export const INTAKE_ROLES = \['Owner', 'Admin'\] as const/)
    // Nothing on the item turns the deployment on.
    expect(src('src/lib/setup-forwarding.ts') + read + screen).not.toMatch(/EMAIL_INTAKE_LIVE\s*=|process\.env\.EMAIL_INTAKE_LIVE\s*=/)
  })
})

describe('what the item says', () => {
  it('gives two recipes side by side, one for each mail system, each adding the address as a Bcc', () => {
    expect(RECIPES.map((r) => r.system)).toEqual(['Google Workspace', 'Microsoft 365'])
    for (const r of RECIPES) {
      expect(r.steps.some((s) => /Bcc/.test(s)), r.system).toBe(true)
      expect(r.steps.some((s) => /recruiting group|word in the subject/.test(s)), r.system).toBe(true)
    }
    expect(CONSOLE_NOTE).toBe('The menu names may differ in your console.')
  })

  it('keeps it narrow in three short lines and says the address can be replaced', () => {
    expect(NARROW).toHaveLength(3)
    expect(NARROW[2]).toBe('A broad rule copies mail nobody meant to share.')
    expect(REPLACE_LINE).toBe('You can replace the address at any time. The old one stops working at once.')
    expect(checkLine(true)).toBe('To check: send one email that matches the rule. It appears as a card in Ask Etyme.')
  })

  it('says it in short plain lines, with no mailbox permission and none of the banned words', () => {
    const words = [
      ...WHY, ...NARROW, REPLACE_LINE, CONSOLE_NOTE, checkLine(true), checkLine(false), keptLine('Tapin'),
      ...RECIPES.flatMap((r) => r.steps), ITEM_WORDS.FORWARDING.line, ITEM_WORDS.FORWARDING.sub, ITEM_WORDS.FORWARDING.skipStops,
    ]
    for (const line of words) {
      for (const sentence of line.split(/(?<=\.)\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(25)
      expect(line, line).not.toMatch(/\bdesk\b|program office|\bAI\b|\$|price|contractors? rather than/i)
    }
    const lib = src('src/lib/setup-forwarding.ts')
    expect(lib).toMatch(/Etyme never reads a mailbox/)
    expect(lib).not.toMatch(/gmail\.readonly|Mail\.Read|oauth.*scope/i)
  })
})
