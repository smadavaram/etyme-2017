import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { MODEL_SWITCH_ANCHOR, MODEL_SWITCH_HREF, MODEL_SWITCH_TAB, modelSetUpHere } from '@/lib/model-boundary'
import { BOUNDARY_LINES, PANEL_ANCHOR, switchLabel } from '@/components/settings/ask-etyme-panel'
import { modelStateSays } from '@/components/settings/settings-says'
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

const REGISTER = JSON.stringify([{ id: 'test-model', label: 'Test model', adapter: 'sdk', tier: 'LOW', classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'TEST_MODEL_KEY' }])

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
    expect(modelSetUpHere({ ETYME_MODEL_REGISTER: REGISTER, TEST_MODEL_KEY: '  ' })).toBe(false)
    expect(modelSetUpHere({ ETYME_MODEL_REGISTER: REGISTER, TEST_MODEL_KEY: 'x' })).toBe(true)
    // One sentence for the switch and the key together (fix list G1).
    expect(modelStateSays({ on: true, modelSetUp: false })).toBe('On, but nothing is sent: no model is connected to this deployment yet. Ask Etyme answers from your records only.')
    expect(panel).toContain('{modelStateSays(data)}')
    // The switch is drawn whatever the key: the save is never gated on it.
    expect(panel).not.toMatch(/disabled=\{[^}]*modelSetUp/)
    expect(route).toContain('message: modelStateSays({ on: now.on, modelSetUp, heldSays: now.heldSays })')
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
    expect(panel).toContain('const want = !data.on')
    expect(panel).toMatch(/<Field label="Why\?"[\s\S]*?<Textarea value=\{reason\}/)
  })

  it('the switch reads "Turn it on" while the model is off and "Turn it off" while it is on', () => {
    expect(switchLabel(false)).toBe('Turn it on')
    expect(switchLabel(true)).toBe('Turn it off')
    // The label is read from the one read of the company's switch.
    expect(panel).toContain('{switchLabel(data.on)}')
  })

  it('the switch has no tick box beside it that could say the opposite of the button', () => {
    expect(panel).not.toMatch(/<Check\b/)
    expect(panel).not.toContain('setWant')
  })

  it('pressing the switch with no reason is refused in a sentence that says what to write', () => {
    expect(panel).toContain("'Say why you are turning the model on.'")
    expect(panel).toContain("'Say why you are turning the model off.'")
    // The button is never silently disabled for a missing reason.
    expect(panel).not.toMatch(/disabled=\{[^}]*reason/)
  })

  it('where the deployment has no model key, every reader reads it in the one sentence above the switch', () => {
    const said = panel.indexOf('{modelStateSays(data)}')
    expect(said).toBeGreaterThan(0)
    expect(said).toBeLessThan(panel.indexOf('{switchLabel(data.on)}'))
    expect(said).toBeLessThan(panel.indexOf('Only the Owner or an Admin turns this on or off.'))
  })
})
