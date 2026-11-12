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
  hasSignedIn, seatPlace, deskChangedNotice, needsDecisionCount,
  MEMBER_DESK, INVITE_LINK_HOURS, type DeskChange, type InviteLetter,
  inviteSays, mayHoldOutsideSeat,
} from '@/lib/access-grant'
import { MEMBER_ROLE, rolesFor } from '@/lib/company-defaults'
import { TEMPLATE_PACKS } from '@/lib/template-packs'
import { sectionForReader } from '@/lib/page-framing'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'

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
  it('a Member row reads "Member · give them a role", and every other desk reads its own name', () => {
    expect(deskLine('Member')).toBe('Member · give them a role')
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

  it('the last person who can give roles cannot be moved off it, so nobody locks the company out', () => {
    const v = assessDeskChange(change({ fromRole: 'Admin', fromCanGiveDesks: true, othersWhoCanGiveDesks: 0 }))
    expect(v.allowed).toBe(false)
    if (!v.allowed) expect(v.says).toContain('the only one here who can give roles')
    expect(assessDeskChange(change({ fromRole: 'Admin', fromCanGiveDesks: true, othersWhoCanGiveDesks: 1 })).allowed).toBe(true)
  })

  it('moving somebody to the desk they already hold is refused in a sentence', () => {
    const v = assessDeskChange(change({ fromRole: 'Recruiter', toRole: 'Recruiter' }))
    expect(v).toEqual({ allowed: false, says: 'Priya Nair already works as Recruiter.' })
  })

  it('Users & permissions offers "Change role" on every row of "Everyone with access", from the company’s own desks', () => {
    const page = read('src/app/dashboard/access/page.tsx')
    expect(page).toContain('Change role')
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

  it('with the password door on, it says "Set your password and you are signed in. You are in Walk Co as HR." and carries the link', () => {
    const l = inviteLetter(base)
    expect(l.lines[0]).toBe('Set your password and you are signed in. You are in Walk Co as HR.')
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
    // The token lives in the mailbox and nowhere else, except where no email
    // can be sent: the one door (lib/notify/account-mail) keeps it for staff.
    expect(route).toContain('recordedBody(letter.lines, letter.link, state)')
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
    // Either the pure helper or lib/supplier-link's re-export of it; the
    // privacy page is a screen, so data-request takes the pure one.
    expect(dr).toMatch(/import \{ appUrl \} from '@\/lib\/(app-url|supplier-link)'/)
    expect(br).toContain('url: `${appUrl()}/dashboard/privacy`')
    for (const f of [dr, br]) expect(f).not.toContain('NEXT_PUBLIC_APP_URL')
  })
})

describe('round two of the sign-up walk', () => {
  it('an invited person who never signed in is listed as invited with the desk they will have, never as somebody with access', () => {
    const never = hasSignedIn({ invitedAt: new Date(), lastUsedAt: null, everSignedIn: false })
    expect(never).toBe(false)
    expect(seatPlace({ roleName: 'AP Clerk', signedIn: never })).toBe('WAITING')
    expect(waitingLine({ invited: true, signedIn: never, days: 0, desk: 'AP Clerk' }))
      .toBe('Invited today, not yet signed in · will have the AP Clerk role')
    // The route sorts by this rule, whatever the desk.
    const route = read('src/app/api/access/route.ts')
    expect(route).toContain("=== 'WITH_ACCESS')")
    expect(route).toContain('people: withAccess.map(')
  })

  it('a person who has signed in keeps their access after a desk change clears the seat’s use date', () => {
    const after = hasSignedIn({ invitedAt: new Date(), lastUsedAt: null, everSignedIn: true })
    expect(after).toBe(true)
    expect(seatPlace({ roleName: 'Recruiter', signedIn: after })).toBe('WITH_ACCESS')
  })

  it('a seat nobody invited was made by a sign-in, and a seat with no desk waits either way', () => {
    expect(hasSignedIn({ invitedAt: null, lastUsedAt: null, everSignedIn: false })).toBe(true)
    expect(seatPlace({ roleName: null, signedIn: true })).toBe('WAITING')
  })

  it('a person whose desk changed is told by email as well as in the app', () => {
    const n = deskChangedNotice({ roleName: 'Hiring Manager', companyName: 'Walk Co', expiresAt: null, landing: '/dashboard/program' })
    expect(n.body).toBe('You now have the Hiring Manager role at Walk Co. Sign in to see it.')
    expect(n.href).toBe('/dashboard/program')
    const dated = deskChangedNotice({ roleName: 'Admin', companyName: 'Walk Co', expiresAt: new Date('2027-01-05T00:00:00Z'), landing: '/dashboard' })
    expect(dated.body).toBe('You now have the Admin role at Walk Co. Sign in to see it. It runs until Jan 5, 2027.')
    const route = read('src/app/api/access/route.ts')
    expect(route).toMatch(/type: 'SYSTEM',\s*channel: 'EMAIL',/)
    expect(route).toContain('data: { href: notice.href }')
  })
})

/**
 * Sign-up walk, round three, items 4, 5 and 6. Lee joined Walk Co on the
 * domain as Member; the list said "Member · give them a desk", the owner
 * was emailed to give him one, and the counter beside it read
 * "Needs a decision 0".
 */
describe('sign-up walk, round three: Users & permissions counts and says what is true', () => {
  it('a Member waiting for a desk is counted under "Needs a decision"', () => {
    expect(needsDecisionCount([], [
      { contextId: 'lee', roleName: 'Member' },
      { contextId: 'rosa', roleName: 'Owner' },
    ])).toBe(1)
  })

  it('a Member who is also on the review is one decision, not two', () => {
    expect(needsDecisionCount(
      [{ contextId: 'lee' }, { contextId: 'pat' }],
      [{ contextId: 'lee', roleName: 'Member' }, { contextId: 'pat', roleName: 'Recruiter' }],
    )).toBe(2)
  })

  it('a firm where everybody has a desk and nothing is on the review needs no decision', () => {
    expect(needsDecisionCount([], [{ contextId: 'rosa', roleName: 'Owner' }])).toBe(0)
  })

  it('the counter on the page is the count of findings and waiting Members, not the findings alone', () => {
    const route = read('src/app/api/access/route.ts')
    expect(route).toContain('needsAttention: needsDecisionCount(')
    expect(route).not.toContain('needsAttention: review.length')
  })

  it('the page says a domain colleague sees their own pages and what is sent to them, and none of the firm’s, never that they see nothing', () => {
    const page = read('src/app/dashboard/access/page.tsx')
    expect(page).not.toContain('can see nothing')
    expect(page).toContain('A Member sees their own pages and what is sent to them, and none of')
  })

  it('a desk’s end date is printed as a day a person reads, on the page and in the email', () => {
    const page = read('src/app/dashboard/access/page.tsx')
    // The row says the end day itself (founder, 2026-11-12), never "12 days left".
    expect(page).toContain('`ends ${formatDay(iso)}`')
    expect(page).not.toContain('days left')
    expect(page).not.toContain('iso.slice(0, 10)')
    const n = deskChangedNotice({ roleName: 'Recruiter', companyName: 'Walk Co', expiresAt: new Date('2027-07-05T00:00:00Z'), landing: '/dashboard' })
    expect(n.body).toContain('It runs until Jul 5, 2027.')
    expect(n.body).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

/**
 * Sign-up walk, round four, problem 10. The row and the email were
 * fixed in round three; the browser alert after "Change desk" still read
 * "This ends on 2027-01-06 unless renewed." — the alert is the route's
 * own `message`, so the route prints the day.
 */
describe('sign-up walk, round four: the Change role confirmation says a day', () => {
  const route = read('src/app/api/access/route.ts')

  it('the confirmation after changing a desk prints its end date as a day a person reads, never as 2027-01-06', () => {
    expect(route).toContain('This ends on ${formatDay(expiresAt)} unless renewed.')
    expect(route).not.toMatch(/This ends on \$\{expiresAt\.toISOString\(\)/)
  })

  it('the automation log line for a desk given until a day prints the day the same way', () => {
    expect(route).toContain('` until ${formatDay(expiresAt)}`')
    expect(route).not.toContain('` until ${expiresAt.toISOString().slice(0, 10)}`')
  })
})

/**
 * Sign-up walk, round seven, problem 4. Your data was headed "YOU" and
 * Users & permissions "SETTINGS" on every firm's menu, where both links
 * sit under Governance; a client's menu has no "You" and nobody's has a
 * "Settings". Each page now reads its heading off the reader's own menu.
 */
describe('sign-up walk, round seven: the heading over Your data and Users & permissions', () => {
  const FIRMS = ['CLIENT', 'VENDOR', 'GSI', 'MSP'] as const
  const reader = (
    kind: (typeof FIRMS)[number] | 'CONSULTANT_CORP' | null,
    permissions: readonly string[],
    extra: Partial<{ isWorker: boolean; contextType: string }> = {},
  ) =>
    sidebarPropsFrom({
      company: kind ? ({ kind, name: 'Walk Co' } as never) : null,
      contextType: (extra.contextType ?? 'EMPLOYEE') as never,
      loading: false,
      isWorker: extra.isWorker ?? false,
      permissions,
    })
  const owner = (kind: string) => rolesFor(kind as never).find((r) => r.name === 'Owner')?.permissions ?? []

  it('Users & permissions is headed Settings on every firm’s menu, the link it is a tab of since the nine links', () => {
    for (const kind of FIRMS) {
      expect(sectionForReader(reader(kind, owner(kind)), '/dashboard/access'), kind).toBe('Settings')
    }
  })

  it('Your data is headed Settings on every firm’s menu, never You, for a reader who is not a worker', () => {
    for (const kind of FIRMS) {
      expect(sectionForReader(reader(kind, owner(kind)), '/dashboard/my-data'), kind).toBe('Settings')
    }
  })

  it('Your data is headed You for a firm’s own worker and for somebody on a bench, where their menu lists it under You', () => {
    expect(sectionForReader(reader('GSI', [], { isWorker: true }), '/dashboard/my-data')).toBe('You')
    expect(sectionForReader(reader('VENDOR', [], { contextType: 'CONSULTANT' }), '/dashboard/my-data')).toBe('You')
  })

  it('neither page types its heading; each asks the reader’s own menu and draws nothing while that is not known', () => {
    const access = read('src/app/dashboard/access/page.tsx')
    expect(access).toContain("usePageSection('/dashboard/access')")
    expect(access).not.toContain('<Lbl>Settings</Lbl>')
    const mine = read('src/app/dashboard/my-data/page.tsx')
    expect(mine).toContain("usePageSection('/dashboard/my-data')")
    expect(mine).not.toMatch(/font-medium">You</)
    expect(sectionForReader({ ...reader('CLIENT', owner('CLIENT')), pending: true }, '/dashboard/access')).toBeNull()
  })
})

describe('what the inviter is told', () => {
  const base = { personName: 'Dana Whitfield', email: 'dana@northbend.example', roleName: 'Program Manager', login: 'https://app.etyme.example/login' }

  it('an invitation never claims an email went when none could, and never hands out a sign-in address the person cannot use', () => {
    const none = inviteSays({ ...base, door: 'PASSWORD', mail: 'NOT_CONFIGURED' })
    expect(none).toBe('Dana Whitfield has been invited as Program Manager. The seat is theirs when they sign in with dana@northbend.example. No email can be sent from here yet; the one-time link is kept with Etyme staff.')
    expect(none).not.toContain('emailed')
    expect(none).not.toContain('/login')

    const failed = inviteSays({ ...base, door: 'PASSWORD', mail: 'FAILED' })
    expect(failed).toContain('the email to dana@northbend.example did not go')
    expect(failed).not.toContain('/login')

    const sent = inviteSays({ ...base, door: 'PASSWORD', mail: 'SENT' })
    expect(sent).toBe('Dana Whitfield has been invited as Program Manager and emailed. The seat is theirs when they sign in with dana@northbend.example. The email has a link to set their password.')

    // Somebody who already holds a password, or a work-account door, can use the address.
    expect(inviteSays({ ...base, door: 'NONE', mail: 'NOT_CONFIGURED' })).toContain('send them the sign-in address yourself: https://app.etyme.example/login.')
    expect(inviteSays({ ...base, door: 'WORK_ACCOUNT', mail: 'NOT_CONFIGURED' })).toContain('https://app.etyme.example/login')
  })
})

describe('the seat a client grants an outside firm', () => {
  const roles = Object.fromEntries(rolesFor('CLIENT').map((r: any) => [r.name, { name: r.name, permissions: r.permissions as string[] }]))
  const ask = (name: string) => mayHoldOutsideSeat({ role: roles[name], clientName: 'Cavanaugh Glassworks', firmName: 'Aptiva Workforce' })

  it('an outside firm never holds the client\'s Owner, its Approver, or a role that signs hours or grants seats', () => {
    for (const name of ['Owner', 'Approver', 'Hiring Manager']) {
      const v = ask(name)
      expect(v.ok, name).toBe(false)
      if (!v.ok) expect(v.says).toContain(`Aptiva Workforce cannot hold Cavanaugh Glassworks’s ${name} role`)
    }
    // A client's own role that can change seats is refused whatever it is called.
    expect(mayHoldOutsideSeat({ role: { name: 'Ops lead', permissions: ['requirements.read', 'team.manage'] }, clientName: 'C', firmName: 'F' }).ok).toBe(false)
  })

  it('an outside firm may run the program as Program Manager and hold the program office\'s other desks', () => {
    for (const name of ['Program Manager', 'Procurement Lead', 'HR Partner', 'AP Clerk', 'Compliance Officer', 'Viewer']) {
      expect(ask(name), name).toEqual({ ok: true })
    }
  })
})

describe('Pause, Reinstate and End on Users & permissions', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const register = read('src/app/api/access/route.ts')

  it('the register says, per row, what this reader may press, read from the access route’s own verdicts', () => {
    expect(register).toContain('offersFor(')
    expect(register.match(/acts: actsOf\(c\.id\)/g)?.length).toBe(2)
  })

  it('the page draws Pause, Reinstate and End only where the row’s offer allows', () => {
    expect(page).toContain('if (acts.pause) offered.push(\'suspend\')')
    expect(page).toContain('if (acts.reinstate) offered.push(\'reinstate\')')
    // End on a waiting row only once withdrawing was refused on history.
    expect(page).toContain('if (acts.end || (acts.endInstead && keptEnd)) offered.push(\'revoke\')')
    expect(page).toContain('if (acts.withdraw) offered.push(\'withdraw\')')
  })

  it('the page asks no question in a browser pop-up: no alert, confirm or prompt', () => {
    expect(page).not.toMatch(/\b(alert|confirm|prompt)\(/)
  })

  it('Change role shows the route’s sentence and its link to Settings → Owners on the page', () => {
    expect(page).toContain("href: typeof j?.error?.href === 'string' ? j.error.href : null")
    expect(page).toContain('Open Settings → Owners')
  })

  it('a paused seat says it is paused, and why, on its row after the page is read again', () => {
    expect(register).toContain('pausedReason: c.suspendedAt ? c.suspendReason ?? null : null')
    expect(page).toContain("p.acts?.state === 'SUSPENDED'")
  })
})

/**
 * The founder on Tapin's Users & permissions, 2026-11-12: people with
 * access hid their address while people waiting showed it; a waiting row
 * offered Pause and End to somebody who never came in; the end of a seat
 * was a number of days hidden in Change role; and the invitation form,
 * low on a phone, said "Work email" to a company that invites partners on
 * Gmail and greyed Invite out with no word why.
 */
describe('Users & permissions as the founder read it, 2026-11-12', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const register = read('src/app/api/access/route.ts')
  const seatRoute = read('src/app/api/access/[contextId]/route.ts')

  // ── Fault 15: who is who ──

  it('every person with access is listed with their sign-in email under their name', () => {
    const everyone = page.slice(page.indexOf('Everyone with access'))
    expect(everyone).toContain('<Address email={p.person.primaryEmail} />')
  })

  it('a person waiting for access is listed with their sign-in email under their name', () => {
    const waiting = page.slice(page.indexOf('Waiting for access'), page.indexOf('Worth a look'))
    expect(waiting).toContain('<Address email={w.person.primaryEmail} />')
  })

  it('a finding worth a look names the person’s sign-in email too', () => {
    expect(register).toContain('personEmail: emailByContext.get(r.contextId) ?? null')
    expect(page).toContain('<Address email={r.personEmail} />')
  })

  it('a person with no address shows nothing under their name, never the word null', () => {
    expect(page).toContain('if (!email) return null')
    expect(register).toContain("email && email.trim() && !isSamplePerson(email) ? email : null")
  })

  it('the shared sample seat’s reserved address is never shown on the register', () => {
    expect(register).toContain('isSamplePerson(email)')
  })

  it('a long address is cut at phone width and shown whole on hover or a long press, so the role line stays on screen', () => {
    expect(page).toMatch(/className="text-xs text-etyme-muted truncate select-all" title=\{email\}/)
  })

  it('the Pause, End and Withdraw forms name the person with their sign-in address', async () => {
    const { nameWithAddress } = await import('@/app/api/access/row-acts')
    expect(nameWithAddress('Meera Iyer', 'meera@brightmoor.demo.etyme.local')).toBe('Meera Iyer (meera@brightmoor.demo.etyme.local)')
    expect(nameWithAddress('Meera Iyer', null)).toBe('Meera Iyer')
    expect(page).toContain('`Why is ${who} being paused?`')
    expect(page).toContain('`Why is ${who}’s access ending?`')
    expect(page).toContain('Withdraw the invitation to {who}?')
  })

  it('a reader without the permission to read the register is not sent anyone’s email', () => {
    const gate = register.indexOf('if (!hasPermission(caller.permissions, TO_READ))')
    const firstRead = register.indexOf('prisma.context.findMany')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(firstRead)
  })

  // ── Fault 12: withdraw, and the end day ──

  it('a waiting row shows its end day, or says no end date', () => {
    expect(register).toContain('expiresAt: c.expiresAt?.toISOString() ?? null,\n          acts: actsOf(c.id)')
    expect(page).toContain('{w.said} · {until(w.expiresAt)}')
    expect(page).toContain("if (!iso) return 'no end date'")
  })

  it('the Ends on field turns a calendar day into the days the route already takes', async () => {
    const { daysUntilEndDay } = await import('@/app/api/access/row-acts')
    const now = new Date(2026, 10, 12, 15, 30)
    expect(daysUntilEndDay('2026-11-13', now)).toEqual({ days: 1 })
    expect(daysUntilEndDay('2027-03-03', now)).toEqual({ days: 111 })
    expect(page).toContain('<Field label="Ends on"')
    expect(page).toContain('type="date" min={tomorrowField()}')
    expect(page).not.toContain('For how long?')
  })

  it('the Ends on field refuses a day in the past, or today, in one sentence', async () => {
    const { daysUntilEndDay } = await import('@/app/api/access/row-acts')
    const now = new Date(2026, 10, 12, 9, 0)
    const said = 'Pick a day after today. Access cannot end on a day that has already begun.'
    expect(daysUntilEndDay('2026-11-01', now)).toEqual({ says: said })
    expect(daysUntilEndDay('2026-11-12', now)).toEqual({ says: said })
    expect(daysUntilEndDay('not a day', now)).toEqual({ says: 'Pick the day their access ends.' })
  })

  it('the grant route refuses an end that is not a day after today, in the same sentence', () => {
    expect(register).toContain("message: 'Pick a day after today. Access cannot end on a day that has already begun.', field: 'days'")
  })

  it('a waiting row offers Withdraw invitation and calls the withdraw route, with no browser pop-up', () => {
    expect(page).toContain("sendAndRead(`/api/access/${contextId}`, 'DELETE')")
    expect(page).toContain("a === 'withdraw' ? WITHDRAW_LABEL")
    expect(page).not.toMatch(/\b(alert|confirm|prompt)\(/)
  })

  it('a withdrawal refused because the person has history keeps End access on the row', () => {
    expect(page).toContain('if (!r.ok && r.endInstead)')
    expect(seatRoute).toContain("return refuse(409, 'HAS_HISTORY', verdict.reason, { endInstead: true })")
  })

  it('the withdraw route holds the Owner rule with the reader as actor, and writes each refusal before it is sent', () => {
    expect(seatRoute).toContain('withdrawVerdict(target, all, actor)')
    const refuse = seatRoute.slice(seatRoute.indexOf('const refuse = async'), seatRoute.indexOf('return NextResponse.json({ error: { code, message, ...extra } }'))
    expect(refuse).toContain('await recordRefusal([ctx.personId]')
    expect(refuse).toContain("action: 'INVITATION_WITHDRAW'")
  })

  it('ending a seat that is still waiting cancels the person’s unused set-password link', () => {
    const block = seatRoute.slice(seatRoute.indexOf("if (action === 'revoke' && stateOf(target) === 'INVITED')"))
    expect(block).toContain("purpose: 'RESET', usedAt: null")
    expect(block).toContain('data: { expiresAt: now }')
  })

  // ── Fault 9: the invitation form ──

  it('the invitation panel is drawn before the four figures, so it is first on a phone', () => {
    expect(page.indexOf('<Panel title="Invite a teammate"')).toBeGreaterThan(-1)
    expect(page.indexOf('<Panel title="Invite a teammate"')).toBeLessThan(page.indexOf('<Stat label="Waiting"'))
  })

  it('Invite is never greyed out without a sentence saying why', () => {
    const button = page.slice(page.indexOf('onClick={sendInvite}') - 200, page.indexOf('onClick={sendInvite}') + 200)
    expect(button).not.toContain('disabled=')
  })

  it('pressing Invite with an incomplete address says what is wrong beside the box', async () => {
    const { looksLikeAddress, INVITE_ADDRESS_MISSING } = await import('@/lib/access-grant')
    expect(looksLikeAddress('meera@')).toBe(false)
    expect(looksLikeAddress('meera')).toBe(false)
    expect(looksLikeAddress(' meera@brightmoor.example ')).toBe(true)
    expect(INVITE_ADDRESS_MISSING).toBe('Type the full address, like name@example.com.')
    expect(page).toContain('if (!looksLikeAddress(invite.email)) { setAddressError(INVITE_ADDRESS_MISSING)')
    expect(page).toContain('error={addressError}')
    expect(page).toContain("if (r.field === 'email') setAddressError(r.text)")
  })

  it('the box’s check is the invite route’s own test of an address', async () => {
    const { looksLikeAddress } = await import('@/lib/access-grant')
    const { checkInvite } = await import('@/lib/account-lifecycle')
    for (const a of ['a@b.co', 'a@b', '@b.co', 'a b@c.co', 'partner@gmail.com']) {
      expect(looksLikeAddress(a), a).toBe(checkInvite(a, null, false).reason !== 'That is not an email address.')
    }
  })

  const policy = (mode: 'SSO_ONLY' | 'INVITE_ONLY' | 'HYBRID' | null, issuers: string[] = []) =>
    ({ companyId: 'c', companyName: 'Tapin', mode, issuers })

  it('at an invitation-only company the form calls the address Email address and says a personal address is welcome', async () => {
    const { inviteFormWords } = await import('@/lib/access-grant')
    const f = inviteFormWords({ policy: policy('INVITE_ONLY'), domain: null, oneFirm: false })
    expect(f.emailLabel).toBe('Email address')
    expect(f.hint).toBe('A company address, or a personal one such as Gmail for a partner.')
    expect(f.personalWelcome).toBe(true)
    expect(f.mode).toBe('INVITE_ONLY')
  })

  it('at a hybrid company the hint says what a seat on a personal address cannot do, read from the one limit', async () => {
    const { inviteFormWords, personalSeatCannot } = await import('@/lib/access-grant')
    const { inWords, PERMISSIONS } = await import('@/lib/permissions')
    const { PUBLIC_SEAT_WITHHELD } = await import('@/lib/identity/policy')
    const f = inviteFormWords({ policy: policy('HYBRID', ['https://login.example']), domain: 'tapin.example', oneFirm: false })
    expect(f.emailLabel).toBe('Email address')
    const cannot = personalSeatCannot(policy('HYBRID', ['https://login.example']))!
    expect(cannot).toBe(inWords(PERMISSIONS.filter((p) => (PUBLIC_SEAT_WITHHELD as readonly string[]).includes(p))))
    expect(f.hint).toBe(`A company address, or a personal one such as Gmail for a partner. A seat on a personal address cannot ${cannot}.`)
  })

  it('a company with nothing set reads like invitation only, with no limit said that the record does not apply', async () => {
    const { inviteFormWords, personalSeatCannot } = await import('@/lib/access-grant')
    expect(personalSeatCannot(policy(null))).toBeNull()
    expect(personalSeatCannot(policy('INVITE_ONLY'))).toBeNull()
    expect(inviteFormWords({ policy: policy(null), domain: null, oneFirm: false }).emailLabel).toBe('Email address')
  })

  it('at a directory-only company the label is Work email on its domain, and people outside it are added in the directory', async () => {
    const { inviteFormWords } = await import('@/lib/access-grant')
    const f = inviteFormWords({ policy: policy('SSO_ONLY', ['https://login.example']), domain: 'corvane.example', oneFirm: false })
    expect(f.emailLabel).toBe('Work email on corvane.example')
    expect(f.hint).toBe('People outside corvane.example are added in your company’s directory, and appear here the first time they sign in.')
    expect(f.personalWelcome).toBe(false)
  })

  it('a one-person firm keeps the form it had', async () => {
    const { inviteFormWords } = await import('@/lib/access-grant')
    expect(inviteFormWords({ policy: policy(null), domain: null, oneFirm: true }).emailLabel).toBe('Work email')
  })

  it('the sign-in mode is read from the one policy function and sent only to a reader who may invite', () => {
    expect(register).toContain('companyPolicy(caller.company.id)')
    expect(register).toContain('if (mayInvite) {')
    expect(register).toContain('...(inviteForm ? { invite: inviteForm } : {})')
    expect(page).toContain('(data.invite as InviteForm | undefined)?.emailLabel')
  })
})
