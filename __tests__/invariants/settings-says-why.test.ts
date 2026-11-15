import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { SubmitButton, Check } from '@/components/ui/form'
import {
  MODEL_PANEL_SUBTITLE, MODEL_CARD_SUBTITLE, modelStateSays, WALLED_READERS, wallSays, wallCovers,
  ASSURANCE_SAYS, RESIDENCY_SAYS, TYPE_UNCHANGED, ONLY_OWNER_OR_ADMIN,
  PASTE_SUPPLIERS_LINK, PASTE_SUPPLIERS_WHO, NO_COMPANIES_IMPORT,
} from '@/components/settings/settings-says'
import { holidayOffersStanding } from '@/lib/pay-dates'
import { logUndoesAnything, reversalRowReads, UNDONE_BY_THE_LOG } from '@/lib/autonomy'
import { ownerOnlyLine } from '@/lib/owner-gate'

/**
 * Settings, the daily-flows batch (fix list areas G and A6, 2026-11-15).
 * The founder's bar: no button greyed without words beside it, a setting
 * that is recorded and not enforced says so at its control, and a choice
 * already made is drawn as chosen, never greyed.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const settings = read('src/app/dashboard/settings/page.tsx')
const panel = read('src/components/settings/ask-etyme-panel.tsx')

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

/** Every Settings file a person presses a Save or an Add on. */
const SETTINGS_FILES = [
  'src/app/dashboard/settings/page.tsx',
  'src/app/dashboard/settings/sign-in/page.tsx',
  'src/app/dashboard/settings/sites/page.tsx',
  'src/app/dashboard/settings/domain/connect-domain.tsx',
  'src/app/dashboard/settings/setup/items.tsx',
  'src/app/dashboard/settings/team-structure/page.tsx',
  'src/app/dashboard/settings/team-structure/import-dialog.tsx',
  'src/app/dashboard/settings/bench-pay/bench-pay.tsx',
  'src/components/settings/week-panel.tsx',
  'src/components/settings/payroll-panel.tsx',
  'src/components/settings/ask-etyme-panel.tsx',
]

/** Each button in a file, from its opening to its closing tag. */
function buttonsIn(src: string): { tag: string; body: string }[] {
  const out: { tag: string; body: string }[] = []
  for (const tag of ['SubmitButton', 'button']) {
    const open = new RegExp(`<${tag}\\b`, 'g')
    let m: RegExpExecArray | null
    while ((m = open.exec(src))) {
      const end = src.indexOf(`</${tag}>`, m.index)
      out.push({ tag, body: src.slice(m.index, end === -1 ? undefined : end) })
    }
  }
  return out
}

/**
 * What a `disabled={…}` waits on, with two reasons taken out: "while it is
 * sending", which the button says on itself, and "this reader may not
 * change it", which the panel says beside its controls (ONLY_OWNER_OR_ADMIN).
 */
function greyedFor(body: string): string {
  const m = body.match(/\bdisabled=\{([^}]*)\}/)
  if (!m) return ''
  return m[1]
    .replace(/props\.busy|busy !== null|reversing === entry\.id|\bbusy\b|\bsaving\b/g, '')
    .replace(/!data\.canEdit|!canEdit|!chosen|draft\.payPeriod !== p/g, '')
    .replace(/[|&()\s]/g, '')
}

describe('a greyed Save says why beside it', () => {
  it('a greyed Save says why in a sentence beside it, tied to the button for a screen reader', () => {
    const html = renderToStaticMarkup(createElement(SubmitButton, { type: 'button', disabled: true, whyDisabled: 'Nothing has changed.' }, 'Save'))
    expect(html).toContain('Nothing has changed.')
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeTruthy()
    expect(html).toContain(`id="${describedBy}"`)
  })

  it('a Save that can be pressed, or is sending, says no reason beside it', () => {
    const ready = renderToStaticMarkup(createElement(SubmitButton, { type: 'button', disabled: false, whyDisabled: 'Nothing has changed.' }, 'Save'))
    expect(ready).not.toContain('Nothing has changed.')
    const sending = renderToStaticMarkup(createElement(SubmitButton, { type: 'button', pending: true, disabled: true, whyDisabled: 'Nothing has changed.' }, 'Save'))
    expect(sending).not.toContain('Nothing has changed.')
  })

  it('a button given no reason draws exactly as it did before', () => {
    const html = renderToStaticMarkup(createElement(SubmitButton, { type: 'button' }, 'Save'))
    expect(html.startsWith('<button')).toBe(true)
  })

  it('no button on a Settings page is greyed for a missing answer without a sentence beside it', () => {
    for (const f of SETTINGS_FILES) {
      for (const b of buttonsIn(read(f))) {
        if (!greyedFor(b.body)) continue
        expect(b.tag === 'SubmitButton' && /\bwhyDisabled=/.test(b.body), `${f}: ${b.body.slice(0, 120)}`).toBe(true)
      }
    }
  })

  it('Change type says beside it why it cannot be pressed while the kind chosen is the one the company is now', () => {
    expect(TYPE_UNCHANGED).toBe('This is what you are now. Choose another kind above to change it.')
    const at = settings.indexOf('Change type\n      </SubmitButton>')
    expect(at).toBeGreaterThan(0)
    expect(settings.slice(at - 600, at)).toContain('disabled={!chosen || chosen === now?.key}')
    expect(settings.slice(at - 600, at)).toContain('whyDisabled={TYPE_UNCHANGED}')
  })

  it('an Owner at a company still waiting for a verified Owner reads the step to prove ownership, with its link, not a button that is refused', () => {
    const route = read('src/app/api/settings/route.ts')
    expect(route).toContain('canChangeType: mayChangeType && typeGateOk,')
    expect(route).toContain("typeLine: (mayChangeType && typeGateOk) || !company ? null : ownerOnlyLine(company, 'COMPANY_TYPE'),")
    const waiting = ownerOnlyLine({ name: 'Northwind Staffing', ownerProofRequiredAt: new Date(0), ownerVerifiedAt: null }, 'COMPANY_TYPE')
    expect(waiting.says).toBe('Changing the type of company waits until Northwind Staffing has a verified Owner. Prove ownership under Setup → Prove ownership.')
    expect(waiting.linkSays).toBe('Prove ownership')
    const verified = ownerOnlyLine({ name: 'Northwind Staffing', ownerProofRequiredAt: new Date(0), ownerVerifiedAt: new Date(0) }, 'COMPANY_TYPE')
    expect(verified.says).toBe('Only the Owner changes the type. Ask the Owner if it is wrong.')
  })
})

describe('Settings > Ask Etyme says one true thing', () => {
  it('with the switch on and no model on this deployment, the panel says nothing is sent and never that a question may be sent', () => {
    const said = modelStateSays({ on: true, modelSetUp: false })
    expect(said).toBe('On, but nothing is sent: no model is connected to this deployment yet. Ask Etyme answers from your records only.')
    expect(said).not.toMatch(/may be sent/)
  })

  it('with the switch off, the panel says Ask Etyme answers from your records and sends nothing outside, with or without a model', () => {
    expect(modelStateSays({ on: false, modelSetUp: true })).toBe('Off. Ask Etyme answers from your records only and sends nothing outside.')
    expect(modelStateSays({ on: false, modelSetUp: false })).toBe('Off. Ask Etyme answers from your records only and sends nothing outside. No model is connected to this deployment yet either.')
  })

  it('with the switch on and a model connected, the panel says a question may be sent, masked, and listed below', () => {
    expect(modelStateSays({ on: true, modelSetUp: true })).toBe('On. A question your records cannot answer may be sent, with names, rates and pay masked. Every one is listed below.')
  })

  it('while the allowance holds the company, the panel says nothing is sent right now and why, never that a question may be sent', () => {
    const said = modelStateSays({ on: true, modelSetUp: true, heldSays: 'The rules still answer.' })
    expect(said).toBe('On, but nothing is sent right now. The rules still answer.')
    expect(said).not.toMatch(/may be sent/)
  })

  it('the panel heading is the same sentence whether the model is on or off, and the panel says the state in one place', () => {
    expect(MODEL_PANEL_SUBTITLE).toBe('Ask Etyme answers from your records first, whatever this is set to.')
    expect(panel).toContain('subtitle={MODEL_PANEL_SUBTITLE}')
    expect(panel.match(/modelStateSays\(data\)/g)?.length).toBe(1)
    expect(panel).not.toContain('Off until')
    expect(panel).not.toContain('NOT_SET_UP_LINE')
  })

  it('the Company tab card for the model never says the model is off while it is on', () => {
    expect(settings).toContain('subtitle={MODEL_CARD_SUBTITLE}')
    expect(settings).not.toContain('Off until an Owner or an Admin turns it on')
    expect(MODEL_CARD_SUBTITLE).not.toMatch(/\bOff\b|\bOn\b/)
  })

  it('the reply after turning the switch is the sentence the panel stands on', () => {
    expect(read('src/app/api/settings/ask-etyme/route.ts')).toContain('message: modelStateSays({ on: now.on, modelSetUp, heldSays: now.heldSays })')
  })

  it('no sentence about the switch leads with AI or runs past twenty-five words', () => {
    const all = [MODEL_PANEL_SUBTITLE, MODEL_CARD_SUBTITLE,
      ...[true, false].flatMap((on) => [true, false].map((modelSetUp) => modelStateSays({ on, modelSetUp })))]
    for (const s of all) {
      expect(s).not.toMatch(/^AI\b/)
      for (const sentence of s.split(/(?<=\.)\s+/)) expect(words(sentence), sentence).toBeLessThanOrEqual(25)
    }
  })
})

describe('a setting recorded and not enforced says so at its control', () => {
  it('the assurance level and data residency boxes say at the box that they are recorded and not checked', () => {
    const signIn = read('src/app/dashboard/settings/sign-in/page.tsx')
    expect(ASSURANCE_SAYS).toBe('Recorded only. Sign-in does not check it yet.')
    expect(RESIDENCY_SAYS).toBe('Recorded only. Etyme runs in one region today, so this changes nothing yet.')
    expect(signIn).toMatch(/label="Assurance level your directory must assert" help=\{`\$\{ASSURANCE_SAYS\}/)
    expect(signIn).toContain('<Field label="Where your data must stay" help={RESIDENCY_SAYS}>')
  })

  it('with Walls on, the panel says a person attached to no account still sees every account, and names what it covers', () => {
    const on = wallSays('VENDOR', true)
    expect(on.state).toBe('On. A person attached to a client account sees only that client account’s work. A person attached to none still sees every client account.')
    expect(on.covers).toBe(`It covers ${wallCovers()}.`)
    expect(wallCovers()).toBe('Contracts, Rolloff, the program view, By region, the decisions waiting on each person and Ask Etyme’s answers')
  })

  it('with Walls off, the panel says everybody sees the work of every account', () => {
    expect(wallSays('VENDOR', false).state).toBe('Off. Everybody here sees the work of every client account.')
  })

  it('a client reads its departments on the Walls panel, never client accounts', () => {
    expect(wallSays('CLIENT', true).state).toBe('On. A person attached to a department sees only that department’s work. A person attached to none still sees every department.')
    expect(wallSays('CLIENT', false).state).not.toMatch(/client account/)
  })

  it('the Walls sentence names exactly the readers that apply the wall today', () => {
    const callers: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(join(root, dir))) {
        const p = `${dir}/${f}`
        if (statSync(join(root, p)).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(f) && /\baccountFilterFor\(/.test(read(p)) && !/lib\/account-walls\.ts$/.test(p)) callers.push(p)
      }
    }
    walk('src')
    // A comment that names the function is not a reader.
    const readers = callers.filter((p) => /await accountFilterFor\(|accountFilterFor\(acting\)|accountFilterFor\(\s*\n?\s*caller/.test(read(p)))
    expect(readers.sort()).toEqual(Object.keys(WALLED_READERS).sort())
  })

  it('the Walls checkbox says its state and what it covers beside it, and links to Team structure for a seat that may attach people', () => {
    expect(settings).toContain('{wallSays(data.company.kind, w.accountWalls).state}')
    expect(settings).toContain('{wallSays(data.company.kind, w.accountWalls).covers}')
    expect(settings).toMatch(/data\.canEdit\s*\?\s*<Link href=\{'\/dashboard\/settings\/team-structure' as Route\}/)
  })

  it('a reader who may not change Walls is told so beside the controls, not only at the top of the page', () => {
    expect(ONLY_OWNER_OR_ADMIN).toBe('Only the Owner or an Admin changes this.')
    const walls = settings.slice(settings.indexOf('function WallsTab'), settings.indexOf('// ── Company ──'))
    expect(walls).toContain('{!data.canEdit && <p className="mt-3 text-[12px] text-etyme-muted">{ONLY_OWNER_OR_ADMIN}</p>}')
    expect(walls).toContain(': ONLY_OWNER_OR_ADMIN}')
  })
})

describe('Settings > Holidays offers only a year that is missing', () => {
  const us = (year: number) => [{ date: `${year}-01-01` }, { date: `${year}-07-04` }, { date: `${year}-12-25` }]
  const today = new Date('2030-03-01T12:00:00Z')

  it('a year whose US holidays are all on the calendar is not offered again, and says it is already on the calendar', () => {
    const offers = holidayOffersStanding(today, ['2031-01-01', '2031-07-04', '2031-12-25'], us)
    const next = offers.find((o) => o.year === 2031)!
    expect(next.complete).toBe(true)
    expect(next.says).toBe('The US holidays for 2031 are already on your calendar.')
  })

  it('a year with one US holiday missing is still offered', () => {
    const next = holidayOffersStanding(today, ['2031-01-01', '2031-07-04'], us).find((o) => o.year === 2031)!
    expect(next.complete).toBe(false)
    expect(next.says).toBeNull()
  })

  it('the rest of this year counts only the days still to come', () => {
    const rest = holidayOffersStanding(today, ['2030-07-04', '2030-12-25'], us).find((o) => o.year === 2030)!
    expect(rest.complete).toBe(true)
    expect(rest.says).toBe('The US holidays for the rest of 2030 are already on your calendar.')
  })

  it('the rest of a year with no holidays left is neither offered nor said', () => {
    const late = holidayOffersStanding(new Date('2030-12-28T12:00:00Z'), [], us)
    expect(late.map((o) => o.year)).toEqual([2031])
  })

  it('the Holidays tab draws a button only for a set with days missing, and says the rest are on the calendar', () => {
    expect(settings).toContain('const missing = offers.filter((o) => !o.complete)')
    expect(settings).toContain('{missing.map((o) => (')
    expect(settings).toContain('{already.map((o) => <p key={o.year} className="text-[12px] text-etyme-muted">{o.says}</p>)}')
    expect(settings).not.toContain('holidaySeedOffers(new Date())')
    expect(read('src/app/api/settings/route.ts')).toContain('holidayOffers: holidayOffersStanding(')
  })
})

describe('a choice already made is drawn as chosen', () => {
  it('the chosen option in a Settings button group is never greyed by being chosen', () => {
    const shift = settings.slice(settings.indexOf('function WeekendShiftPanel'), settings.indexOf('// ── Approvals'))
    expect(shift).toContain('disabled={!chosen && (busy || !data.canEdit)}')
    expect(shift).toContain('aria-pressed={chosen}')
    // Pressing the chosen one sends nothing, so no log row says a change that was not one.
    expect(shift).toContain("onClick={() => { if (!chosen) send('/api/settings', 'PATCH', { [field(cat.key)]: d.value }) }}")
    const payroll = read('src/components/settings/payroll-panel.tsx')
    expect(payroll).toContain('disabled={draft.payPeriod !== p && (!canEdit || busy)}')
  })

  it('a ticked box that cannot be changed still reads as ticked, and an unticked one fades', () => {
    const ticked = renderToStaticMarkup(createElement(Check, { label: 'Sat', checked: true, disabled: true, readOnly: true }))
    expect(ticked).not.toContain('opacity-60')
    const unticked = renderToStaticMarkup(createElement(Check, { label: 'Mon', checked: false, disabled: true, readOnly: true }))
    expect(unticked).toContain('opacity-60')
  })

  it('the radio buttons for Walls and for how people sign in are never greyed, so the chosen one reads as chosen to every reader', () => {
    const walls = settings.slice(settings.indexOf('function WallsTab'), settings.indexOf('// ── Company ──'))
    expect(walls).not.toMatch(/type="radio"[\s\S]{0,200}?\bdisabled=/)
    expect(walls).toContain('aria-disabled={busy || !data.canEdit || undefined}')
    const signIn = read('src/app/dashboard/settings/sign-in/page.tsx')
    expect(signIn).toContain('<fieldset className="space-y-2" aria-disabled={!can || undefined}>')
    expect(signIn).toContain('onChange={() => { if (can) setMode(m.mode) }}')
  })

  it('the bench holiday button has no pressed state and is drawn alike on and off; its label names the act', () => {
    const bench = read('src/app/dashboard/settings/bench-pay/bench-pay.tsx')
    const at = bench.indexOf("{h.paid ? 'Turn off' : 'Turn on'}")
    const button = bench.slice(bench.lastIndexOf('<SubmitButton', at), at)
    expect(button).not.toContain('aria-pressed')
    expect(button).toContain('tone="secondary"')
    expect(button).not.toContain('h.paid ?')
  })

  it('the Approvals tab says who approves a job request once', () => {
    const approvals = settings.slice(settings.indexOf('function ApprovalsTab'), settings.indexOf('// ── Address'))
    expect(approvals.match(/\{summary\}/g)?.length).toBe(1)
    expect(approvals).not.toContain('No rules. Every job request clears without approval.')
  })
})

describe('the Company tab and Import records say where a thing is typed', () => {
  it('the Company tab shows the website and says it is typed in Setup → Your company, with a link for a seat that may open Setup', () => {
    expect(settings).toContain("{c.website ? c.website : 'None typed yet.'}")
    expect(settings).toContain("<Link href={'/dashboard/settings/setup/company' as Route} className=\"text-etyme-action-press\">Change it in Setup → Your company</Link>")
    expect(settings).toContain('The Owner or an Admin types it in Setup → Your company.')
    expect(read('src/app/api/settings/route.ts')).toContain('website: true,')
  })

  it('Import records says many suppliers can be pasted on Suppliers, links there only for a seat that may, and says a Companies import is not built', () => {
    const data = read('src/app/dashboard/data/page.tsx')
    expect(PASTE_SUPPLIERS_LINK).toBe('pasting them on Suppliers')
    expect(PASTE_SUPPLIERS_WHO).toBe('by whoever manages who you trade with')
    expect(NO_COMPANIES_IMPORT).toBe('A Companies import is not built yet.')
    expect(data).toContain("mayOpen(SUPPLIERS_HREF, seat.permissions) && hasPermission(seat.permissions ?? [], 'vendors.manage')")
    expect(data).toContain('<Link href={SUPPLIERS_HREF as Route}')
    // The Suppliers paste is refused without vendors.manage, which is why the link asks for it.
    expect(read('src/app/api/suppliers/route.ts')).toMatch(/hasPermission\(deskPermissions, 'vendors\.manage'\)/)
  })

  it('no example in a Settings box is a domain anybody could register', () => {
    for (const f of SETTINGS_FILES) {
      for (const m of read(f).matchAll(/placeholder="([^"]*)"/g)) {
        // The Teams box shows the shape of the link Microsoft issues: an
        // integration target the customer picks by name, not an example firm.
        if (m[1].includes('logic.azure.com/workflows')) continue
        expect(m[1], `${f}: ${m[1]}`).not.toMatch(/\b[a-z0-9-]+\.(com|io|net|org|co)\b/)
      }
    }
  })
})

describe('Settings > Activity log has no dead end', () => {
  it('the undo tile and the Reversible only filter are drawn only while the log undoes some act', () => {
    expect(logUndoesAnything()).toBe(UNDONE_BY_THE_LOG.size > 0)
    const page = read('src/app/dashboard/automation/page.tsx')
    expect(page).toContain('const undoes = logUndoesAnything()')
    expect(page).toContain('{undoes && <Stat label="Reversible" value={reversibleCount} sub="can be undone" />}')
    expect(page).toMatch(/\{undoes && \(\s*<Check\s+label="Reversible only"/)
  })

  it('a row the old Reverse button wrote reads in a person’s words and says the press was recorded and changed nothing', () => {
    const said = reversalRowReads({
      summary: 'Reversed: Sent to 1 supplier',
      reason: 'Dana Whitfield reversed automation action REQUISITION_DISTRIBUTED',
      payload: { reversedEntryId: 'x', originalAction: 'REQUISITION_DISTRIBUTED' },
    })
    expect(said).toEqual({
      summary: 'Reverse pressed on: Sent to 1 supplier',
      reason: 'Dana Whitfield pressed Reverse here. The press was recorded and changed nothing.',
    })
    expect(`${said.summary} ${said.reason}`).not.toMatch(/[A-Z]{2,}_[A-Z_]+/)
  })

  it('the activity log reads every such row through that one reader, so a row already written loses nothing', () => {
    expect(read('src/app/api/automation/route.ts')).toContain("...(e.action === 'REVERSAL' ? reversalRowReads(e) : { summary: e.summary, reason: e.reason }),")
    expect(read('src/app/api/automation/[id]/reverse/route.ts')).not.toContain('reversed automation action')
  })
})
