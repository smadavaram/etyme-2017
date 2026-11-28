import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The settings screen asks for the link Teams actually gives today. Since
 * May 2026 the old connector link goes nowhere, so the screen names the
 * Workflows link, says how to get one, and shows the server's own
 * sentence about the link already saved rather than "set up" on faith.
 */
const page = readFileSync(join(__dirname, '../../src/app/dashboard/settings/page.tsx'), 'utf8')

describe('the Teams link on the settings screen', () => {
  it('asks for a Teams Workflows link, with a Workflows address as the example', () => {
    expect(page).toContain('<Lbl>Teams Workflows link</Lbl>')
    expect(page).toContain('placeholder="https://….logic.azure.com/workflows/…"')
    expect(page).not.toContain('Teams channel webhook')
  })

  it('says under the box how to get the link from Teams', () => {
    expect(page).toContain('{TEAMS_LINK_HOW_TO}')
  })

  it('reads the saved link’s standing from the server’s sentence, not from whether a link is saved', () => {
    expect(page).toContain('{c.teams.says}')
    expect(page).not.toContain("'Set up. Business notifications post to Teams.'")
  })

  it('a saved link that no longer works can still be removed', () => {
    expect(page).toContain('!teams.trim() && !c.teamsWebhookUrl')
  })
})
