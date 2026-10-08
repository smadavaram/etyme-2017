/**
 * Users & permissions, after round one of the sign-up walk.
 *
 * Four things the walk found, each a sentence: a seated person's desk
 * could not be changed; an invitation read as "joined today" before
 * anybody signed in; the invitation email had no way in; and the setup
 * screen named a trade where it should say what the pack decides.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  deskLine, desksOffered, assessDeskChange, waitingLine, inviteLetter,
  MEMBER_DESK, INVITE_LINK_HOURS, type DeskChange, type InviteLetter,
} from '@/lib/access-grant'
import { MEMBER_ROLE } from '@/lib/company-defaults'
import { TEMPLATE_PACKS } from '@/lib/template-packs'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const ROLES = [
  { id: 'r1', name: 'Owner' }, { id: 'r2', name: 'Admin' },
  { id: 'r3', name: 'Recruiter' }, { id: 'r4', name: 'Member' },
]

function change(over: Partial<DeskChange> = {}): DeskChange {
  return {
    fromRole: 'Member', toRole: 'Recruiter', actorIsOwner: true,
    fromCanGiveDesks: false, toCanGiveDesks: false, othersWhoCanGiveDesks: 1,
    personName: 'Priya Nair', ...over,
  }
}

describe('changing a desk', () => {
  it('a Member row reads "Member · give them a desk", and every other desk reads its own name', () => {
    expect(deskLine('Member')).toBe('Member · give them a desk')
    expect(deskLine('Recruiter')).toBe('Recruiter')
  })

  it('the Member desk named here is the Member desk a company seats a colleague on', () => {
    expect(MEMBER_DESK).toBe(MEMBER_ROLE)
  })

  it('the desk picker offers Owner only to an Owner', () => {
    expect(desksOffered(ROLES, true).map((r) => r.name)).toContain('Owner')
    expect(desksOffered(ROLES, false).map((r) => r.name)).toEqual(['Admin', 'Recruiter', 'Member'])
  })

  it('an owner may move a Member to any other desk', () => {
    expect(assessDeskChange(change())).toEqual({ allowed: true })
  })

  it('an admin cannot make somebody an Owner, and is told so in a sentence', () => {
    const v = assessDeskChange(change({ toRole: 'Owner', actorIsOwner: false }))
    expect(v).toEqual({ allowed: false, says: 'Only an Owner can make somebody an Owner.' })
  })

  it('an admin cannot change an Owner’s desk', () => {
    const v = assessDeskChange(change({ fromRole: 'Owner', toRole: 'Recruiter', actorIsOwner: false }))
    expect(v.allowed).toBe(false)
  })

  it('the last person who can give desks cannot be moved off it, so nobody locks the company out', () => {
    const v = assessDeskChange(change({ fromRole: 'Admin', fromCanGiveDesks: true, othersWhoCanGiveDesks: 0 }))
    expect(v.allowed).toBe(false)
    if (!v.allowed) expect(v.says).toContain('the only one here who can give desks')
    expect(assessDeskChange(change({ fromRole: 'Admin', fromCanGiveDesks: true, othersWhoCanGiveDesks: 1 })).allowed).toBe(true)
  })

  it('moving somebody to the desk they already hold is refused in a sentence', () => {
    const v = assessDeskChange(change({ fromRole: 'Recruiter', toRole: 'Recruiter' }))
    expect(v).toEqual({ allowed: false, says: 'Priya Nair already works as Recruiter.' })
  })

  it('Users & permissions offers "Change desk" on every row of "Everyone with access", from the company’s own desks', () => {
    const page = read('src/app/dashboard/access/page.tsx')
    expect(page).toContain('Change desk')
    expect(page).toContain('desksOffered(roles, data.actorIsOwner === true)')
    expect(page).toContain('{p.line}')
    const route = read('src/app/api/access/route.ts')
    expect(route).toContain('assessDeskChange(')
  })
})

describe('waiting for access', () => {
  it('an invited person who never signed in reads "Invited today, not yet signed in", never "joined today"', () => {
    expect(waitingLine({ invited: true, signedIn: false, days: 0 })).toBe('Invited today, not yet signed in')
    expect(waitingLine({ invited: true, signedIn: false, days: 3 })).toBe('Invited 3 days ago, not yet signed in')
  })

  it('"joined today" is said only of a real sign-in', () => {
    expect(waitingLine({ invited: false, signedIn: true, days: 0 })).toBe('joined today')
    expect(waitingLine({ invited: true, signedIn: true, days: 2 })).toBe('joined 2 days ago')
  })
})

describe('the invitation email', () => {
  const base: InviteLetter = {
    door: 'PASSWORD', companyName: 'Walk Co', roleName: 'HR',
    setPasswordUrl: 'https://app.example/reset/abc', loginUrl: 'https://app.example/login',
    linkHours: INVITE_LINK_HOURS, workAccount: false,
  }

  it('an invited teammate’s email carries a way in, never only an instruction', () => {
    for (const door of ['PASSWORD', 'WORK_ACCOUNT', 'NONE'] as const) {
      const l = inviteLetter({ ...base, door, setPasswordUrl: door === 'PASSWORD' ? base.setPasswordUrl : null })
      const text = [...l.lines, l.link ?? ''].join('\n')
      expect(text, door).toMatch(/https:\/\/app\.example\/(reset\/abc|login)/)
    }
  })

  it('with the password door on, it says "Set your password to sign in. You are in Walk Co as HR." and carries the link', () => {
    const l = inviteLetter(base)
    expect(l.lines[0]).toBe('Set your password to sign in. You are in Walk Co as HR.')
    expect(l.link).toBe('https://app.example/reset/abc')
    expect(l.lines.join(' ')).toContain('for 3 days')
  })

  it('with only Microsoft or Google on, it says "Sign in with your work account at" the sign-in page', () => {
    const l = inviteLetter({ ...base, door: 'WORK_ACCOUNT', setPasswordUrl: null })
    expect(l.lines[0]).toBe('Sign in with your work account at https://app.example/login. You are in Walk Co as HR.')
  })

  it('the old bare instruction is gone from the invitation route', () => {
    const route = read('src/app/api/access/invite/route.ts')
    expect(route).not.toContain('Somebody there will decide what you can see.')
    // One door mints the set-password link, and it kills older ones.
    expect(route).toContain('issueSetPassword(person.id, INVITE_LINK_HOURS')
    expect(route).not.toContain('prisma.emailToken.create')
    // The token lives in the mailbox and nowhere else.
    expect(route).toContain('[the one-time link was in the email and is not kept]')
  })
})

describe('the pack names', () => {
  it('a pack’s name says what it decides — the country and the rhythm — and never a trade', () => {
    const labels = Object.values(TEMPLATE_PACKS).map((p) => p.label)
    expect(labels).toEqual(['US weekly hours, biweekly pay', 'US weekly hours, biweekly pay, ERP skills', 'India monthly', 'UK monthly'])
    for (const l of labels) expect(l).not.toMatch(/staffing|delivery center/i)
  })

  it('the pack keys stay as addresses', () => {
    expect(Object.keys(TEMPLATE_PACKS)).toEqual(['US_IT', 'US_SAP', 'IN_DELIVERY', 'UK'])
  })
})

describe('the base address', () => {
  it('a privacy request link and a breach alert link are built from the one base address the password door uses', () => {
    const dr = read('src/lib/data-request.ts')
    const br = read('src/app/api/breaches/route.ts')
    expect(dr).toContain("import { appUrl } from '@/lib/supplier-link'")
    expect(br).toContain('url: `${appUrl()}/dashboard/privacy`')
    for (const f of [dr, br]) expect(f).not.toContain('NEXT_PUBLIC_APP_URL')
  })
})
