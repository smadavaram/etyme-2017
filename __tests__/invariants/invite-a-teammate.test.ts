import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DECIDE_LATER, DECIDE_LATER_LABEL, DECIDE_LATER_SAYS, NO_ROLE_SEES, levelLegend, levelOf, INVITE_ADDRESS_MISSING, INVITE_ROLE_MISSING, INVITE_ADDRESSES_MISSING,
  addressAsTyped, addressesAsTyped, inviteProblems, inviteRoleId, roleChoiceSays, roleLine, roleOptionText,
} from '@/lib/access-grant'
import { shippedLineFor } from '@/app/api/roles/blurb'
import { rolesFor } from '@/lib/company-defaults'
import { menuFor, getNavForKind } from '@/lib/nav-table'

/**
 * Invite a teammate, Settings > Users & permissions (fix list 2026-11-14,
 * A3). The email came second, the role had no words, an empty press
 * flagged only the email, and an invitation could leave with no role and
 * no word of what that meant.
 */

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8')
const page = read('src/app/dashboard/access/page.tsx')
const panel = page.slice(page.indexOf('<Panel title="Invite a teammate"'), page.indexOf('</Panel>', page.indexOf('<Panel title="Invite a teammate"')))

describe('the boxes, in the order a person fills them', () => {
  it('Invite a teammate asks for the email before the name, and the name stays optional', () => {
    const email = panel.indexOf("emailLabel ?? 'Email address'")
    const name = panel.indexOf('<Field label="Name (optional)">')
    const role = panel.indexOf('<Field label="What they do here"')
    expect(email).toBeGreaterThan(-1)
    expect(name).toBeGreaterThan(email)
    expect(role).toBeGreaterThan(name)
  })

  it('the line above the form names the boxes in the order they are drawn, email first', () => {
    expect(page).toContain("const how = 'Their email, their name if you like, and what they do here. ")
    expect(page).not.toContain('Name, email, and what they do here.')
  })

  it('no example in a box on the invite form shows a real-looking person or address', () => {
    const examples = [...panel.matchAll(/placeholder=\{?["'`]([^"'`]*)["'`]/g)].map((m) => m[1])
    expect(examples.length).toBeGreaterThan(0)
    for (const e of examples) {
      for (const address of e.match(/[^\s\\]+@[^\s\\]+/g) ?? []) expect(address, e).toMatch(/\.example$/)
    }
    expect(examples).toContain('First and last name')
  })
})

describe('the email, checked as it is typed', () => {
  it('a half-typed email is flagged beside its box once she has left it, with no press needed', () => {
    expect(addressAsTyped('dana@northwind', true)).toBe(INVITE_ADDRESS_MISSING)
    expect(page).toContain('onBlur={() => setAddressChecked(true)}')
    expect(page).toContain('error={addressError ?? addressAsTyped(invite.email, addressChecked)}')
  })

  it('nothing is flagged while she types the address the first time', () => {
    expect(addressAsTyped('dana@north', false)).toBeNull()
  })

  it('the flag goes the moment the address is whole', () => {
    expect(addressAsTyped('dana@northwind-staffing.example', true)).toBeNull()
  })

  it('an empty box says nothing until Invite is pressed', () => {
    expect(addressAsTyped('', true)).toBeNull()
  })
})

describe('the role picker', () => {
  it('every role the company starts with carries its own one line in the picker', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const) {
      for (const seed of rolesFor(kind)) {
        const line = shippedLineFor(kind, seed)
        expect(line, `${kind} ${seed.name}`).toBe(seed.blurb)
        expect(roleOptionText({ id: 'r', name: seed.name, blurb: line })).toBe(`${seed.name}: ${seed.blurb}`)
      }
    }
  })

  it('a narrowed Admin reads the narrowed Admin’s line, never the full Admin’s', () => {
    const narrow = rolesFor('VENDOR', { narrowAdmin: true }).find((r) => r.name === 'Admin')!
    expect(shippedLineFor('VENDOR', narrow)).toBe(narrow.blurb)
    expect(narrow.blurb).toMatch(/No money, no contracts/)
  })

  it('a shipped role whose permissions were changed loses the shipped line, because it may no longer be true', () => {
    const recruiter = rolesFor('VENDOR').find((r) => r.name === 'Recruiter')!
    expect(shippedLineFor('VENDOR', { name: 'Recruiter', permissions: [...recruiter.permissions, 'pnl.read'] })).toBeNull()
  })

  it('a role the company wrote says how much it can do, never a bare name', () => {
    expect(roleLine({ id: 'r', name: 'Night shift lead', blurb: null, canDo: '5 of 34' })).toBe('A role your company set up. It can do 5 of 34.')
    expect(roleOptionText({ id: 'r', name: 'Night shift lead', blurb: null, canDo: null })).toBe('Night shift lead: A role your company set up.')
  })

  it('the roles route sends each role’s one line to the picker', () => {
    expect(read('src/app/api/roles/route.ts')).toContain('blurb: shippedLineFor(caller.company!.kind')
  })

  it('an Admin is never offered Owner in the invite picker', () => {
    expect(panel).toContain('{pickable.map((r) => <option key={r.id} value={r.id}>{roleOptionText(r)}</option>)}')
    expect(panel).not.toContain('roles.map(')
  })

  it('the chosen role’s line is printed under the picker, where a phone would cut the option short', () => {
    expect(panel).toContain('help={roleChoiceSays(invite.roleId, pickable)}')
    const roles = [{ id: 'r1', name: 'HR', blurb: 'Paperwork and work authorization for the firm’s own people. Sees no money.' }]
    expect(roleChoiceSays('r1', roles)).toBe(roles[0].blurb)
    expect(roleChoiceSays('', roles)).toBeNull()
  })
})

describe('Decide later', () => {
  it('the invite form, its route and the legend say the same thing about a person invited with no role, and it is what she sees', () => {
    const route = read('src/app/api/access/invite/route.ts')
    // One sentence, said by every place that says it.
    expect(roleChoiceSays(DECIDE_LATER, [])).toBe(NO_ROLE_SEES)
    expect(route).toContain('`${r.email} can sign in. ${NO_ROLE_SEES}`')
    expect(route).not.toContain('They will see nothing')
    expect(levelLegend().find((l) => l.key === 'NO_ROLE')?.says).toBe(NO_ROLE_SEES)
    expect(levelOf(null, []).why).toBe(NO_ROLE_SEES)
    expect(levelOf('Member', []).why).toBe(NO_ROLE_SEES)
    expect(page).toContain('return joins ? `${joins} ${NO_ROLE_SEES}` : NO_ROLE_SEES')
    expect(NO_ROLE_SEES.split(/\s+/).length).toBeLessThanOrEqual(25)
    // And it is what she sees: the menu for a seat holding no permission
    // is Ask Etyme and her own five pages, and no page of the firm's.
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI'] as const) {
      const nav = getNavForKind(kind, false, { permissions: [] })
      expect(nav.map((s) => s.label), kind).toEqual(['Ask Etyme', 'You'])
      expect(nav[0].items.map((i) => i.href).every((h) => h.startsWith('/dashboard/conversations')), kind).toBe(true)
      expect(nav[1].items.map((i) => i.label), kind).toEqual(['Your work', 'Your page', 'Who has you', 'Your data', 'Your paperwork'])
    }
  })

  it('Decide later is one of the choices in the picker, and it sends no role', () => {
    expect(DECIDE_LATER_LABEL).toBe('Decide later')
    expect(panel).toContain('<option value={DECIDE_LATER}>{DECIDE_LATER_LABEL}</option>')
    expect(inviteRoleId(DECIDE_LATER)).toBeUndefined()
    expect(inviteRoleId('')).toBeUndefined()
    expect(inviteRoleId('role-1')).toBe('role-1')
  })

  it('Decide later says what a seat with no role really sees: Ask Etyme and their own pages, and nothing of the firm’s', () => {
    expect(roleChoiceSays(DECIDE_LATER, [])).toBe(DECIDE_LATER_SAYS)
    expect(DECIDE_LATER_SAYS).toBe('A person with no role sees Ask Etyme and their own pages, and nothing of the firm’s.')
    // What the menu draws for a seat holding no permission, at every kind of firm that invites colleagues.
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI'] as const) {
      const menu = menuFor(kind, false, { permissions: [] })
      expect(menu.map((g) => g.heading), kind).toEqual(['You'])
      expect(menu.flatMap((g) => g.links.map((l) => l.label)), kind).toEqual(['Your work', 'Your page', 'Who has you', 'Your data', 'Your paperwork'])
    }
  })
})

describe('pressing Invite', () => {
  it('pressing Invite on an empty form flags the email and the role, each in a sentence', () => {
    expect(inviteProblems({ several: false, email: '', emails: '', choice: '' })).toEqual({
      email: INVITE_ADDRESS_MISSING, role: INVITE_ROLE_MISSING,
    })
    expect(INVITE_ROLE_MISSING).toBe('Pick what they do here, or choose Decide later.')
  })

  it('Invite does not send until a choice is made in the role picker', () => {
    expect(inviteProblems({ several: false, email: 'dana@northwind-staffing.example', emails: '', choice: '' })).toEqual({ role: INVITE_ROLE_MISSING })
    expect(inviteProblems({ several: false, email: 'dana@northwind-staffing.example', emails: '', choice: DECIDE_LATER })).toEqual({})
    const send = page.slice(page.indexOf('async function sendInvite()'), page.indexOf("sendAndRead('/api/access/invite'"))
    expect(send).toContain('if (wrong.email || wrong.role) { setInvited(null); return }')
    expect(send.indexOf('if (several) return sendSeveral()')).toBeGreaterThan(send.indexOf('if (wrong.email || wrong.role)'))
  })

  it('the form that invites several addresses at once needs a role choice too', () => {
    expect(inviteProblems({ several: true, email: '', emails: 'a@harborline-tech.example', choice: '' })).toEqual({ role: INVITE_ROLE_MISSING })
    expect(inviteProblems({ several: true, email: '', emails: '', choice: '' })).toEqual({ email: INVITE_ADDRESSES_MISSING, role: INVITE_ROLE_MISSING })
  })

  it('among several addresses, one that is not whole is said as she types and does not stop the rest', () => {
    expect(addressesAsTyped('a@harborline-tech.example, bob@', true)).toBe(`bob@ is not a whole address, so it will not be invited. ${INVITE_ADDRESS_MISSING}`)
    expect(inviteProblems({ several: true, email: '', emails: 'a@harborline-tech.example, bob@', choice: DECIDE_LATER })).toEqual({})
  })

  it('a refusal about the role is drawn beside the role box', () => {
    expect(page.match(/else if \(r\.field === 'roleId'\) setRoleError\(r\.text\)/g)?.length).toBe(2)
    expect(panel).toContain('error={roleError}')
  })

  it('the invite route still takes an invitation with no role, which is what Decide later sends', () => {
    const one = read('src/app/api/access/invite/one.ts')
    expect(one).toContain('if (!roleId) return { ok: true, role: null }')
  })
})
