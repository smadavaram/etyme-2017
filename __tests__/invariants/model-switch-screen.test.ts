import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { MODEL_SWITCH_ANCHOR, MODEL_SWITCH_HREF, MODEL_SWITCH_TAB, modelSetUpHere } from '@/lib/model-boundary'
import { BOUNDARY_LINES, NOT_SET_UP_LINE, PANEL_ANCHOR } from '@/components/settings/ask-etyme-panel'
import { ACTIONS } from '@/lib/autonomy'

/**
 * The model switch is on a screen, and the sentence that names it reaches
 * it. Found by the founder as Tapin's Owner on production, 2026-11-03: Ask
 * Etyme said "an owner or admin can turn it on under Settings", and he
 * could not find a switch. It was there, on a tab nothing linked to. The
 * class is "the screen cannot reach the rule", on the model boundary.
 */
const root = join(__dirname, '../..')
const page = readFileSync(join(root, 'src/app/dashboard/settings/page.tsx'), 'utf8')
const panel = readFileSync(join(root, 'src/components/settings/ask-etyme-panel.tsx'), 'utf8')
const route = readFileSync(join(root, 'src/app/api/settings/ask-etyme/route.ts'), 'utf8')

describe('the Owner reaches the model switch from the sentence that names it', () => {
  it('the Owner or an Admin turns the model on or off for their company under Settings, recorded with who and when', () => {
    // The settings page draws the panel on its Ask Etyme tab, and a line
    // beside the company's type opens it.
    expect(page).toContain("tab === 'Ask Etyme' && <AskEtymePanel />")
    expect(page).toContain("openModel={() => setTab('Ask Etyme')}")
    // Only settings.manage writes, and the panel says who did and when.
    expect(route).toContain("hasPermission(caller.permissions, 'settings.manage')")
    expect(route).toContain('setModelOn(caller.company.id, caller.person.id')
    expect(panel).toContain('setLine(data.setAt, data.setByName)')
    // The act is a person's own, on the ladder.
    expect(ACTIONS.ASK_ETYME_MODEL_SET).toMatchObject({ kind: 'ATTRIBUTED' })
  })

  it('the link Ask Etyme points to opens the Ask Etyme tab of Settings at the switch', () => {
    expect(MODEL_SWITCH_HREF).toBe('/dashboard/settings?tab=ask-etyme#ask-etyme-model')
    expect(PANEL_ANCHOR).toBe(MODEL_SWITCH_ANCHOR)
    expect(panel).toContain('id={PANEL_ANCHOR}')
    // The page's slug rule: the tab's own name, lower case, hyphens.
    expect('Ask Etyme'.toLowerCase().replace(/\s+/g, '-')).toBe(MODEL_SWITCH_TAB)
    expect(page).toContain('tabFromAddress(window.location.search)')
  })

  it('the panel says the boundary in four lines a buyer can check', () => {
    expect(BOUNDARY_LINES).toEqual([
      'Names, rates and pay are masked before anything leaves.',
      'Only what the rules did not answer is sent.',
      'The provider keeps nothing.',
      'Every prompt and answer is logged on your record, below.',
    ])
    expect(panel).toContain("const title = 'Ask Etyme and the model'")
  })

  it('the panel says the model is not set up on this deployment where no key exists, and the choice is still recorded', () => {
    expect(modelSetUpHere({})).toBe(false)
    expect(modelSetUpHere({ ANTHROPIC_API_KEY: '  ' })).toBe(false)
    expect(modelSetUpHere({ ANTHROPIC_API_KEY: 'sk-x' })).toBe(true)
    expect(NOT_SET_UP_LINE).toBe('The model is not set up on this deployment yet; turning it on here takes effect when it is.')
    expect(panel).toContain('{!data.modelSetUp && ')
    // The switch is drawn whatever the key: the save is never gated on it.
    expect(panel).not.toMatch(/disabled=\{[^}]*modelSetUp/)
    expect(route).toContain('On, recorded. The model is not set up on this deployment yet')
  })

  it('nobody else may change the switch, and the refusal says who may', () => {
    expect(route).toContain("askTheDesk({ doing: 'Turning the model on or off for Ask Etyme', needs: 'settings.manage'")
    expect(panel).toContain('Only the Owner or an Admin turns this on or off.')
    expect(panel).toContain('{data.canEdit ? (')
  })

  it('every question the model route asks, the panel has a field for', () => {
    // The route refuses without `on` and without `reason`.
    expect(route).toContain("field: 'on'")
    expect(route).toContain("field: 'reason'")
    expect(panel).toContain('JSON.stringify({ on: want, reason })')
    expect(panel).toMatch(/<Check [^>]*checked=\{want\}/)
    expect(panel).toMatch(/<Field label="Why\?"[\s\S]*?<Textarea value=\{reason\}/)
  })
})
