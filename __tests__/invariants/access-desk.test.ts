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
  inviteSays, invitedAs, mayHoldOutsideSeat,
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
    // The invitation and its email are written by one file every invitation
    // door calls (the form, several at once, and Send the invitation again).
    const route = read('src/app/api/access/invite/route.ts') + read('src/app/api/access/invite/one.ts')
    expect(route).not.toContain('Somebody there will decide what you can see.')
    // One door mints the set-password link, and it kills older ones.
    expect(route).toContain('issueSetPassword(a.person.id, INVITE_LINK_HOURS')
    expect(route).not.toContain('prisma.emailToken.create')
    // The token lives in the mailbox and nowhere else, except where no email
    // can be sent: the one door (lib/notify/account-mail) keeps it for staff.
    expect(route).toContain("recordedBody(letter.lines, letter.link, state === 'DEMO_SKIPPED' ? 'NOT_CONFIGURED' : state)")
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
  const base = { personName: 'Dana Whitfield', email: 'dana@northbend.example', roleName: 'Program Manager' }

  it('an invitation never claims an email went when none could, and says to copy it and send it yourself', () => {
    const none = inviteSays({ ...base, mail: 'NOT_CONFIGURED' })
    expect(none).toBe('Dana Whitfield has been invited as Program Manager. The seat is theirs when they sign in with dana@northbend.example. No email can be sent from here yet. Press Copy invitation on their row and send it to them yourself; where they have no password yet, Etyme staff hold a one-time link for them.')
    expect(none).not.toContain('emailed')

    const failed = inviteSays({ ...base, mail: 'FAILED' })
    expect(failed).toContain('the email to dana@northbend.example did not go')
    expect(failed).not.toContain('/login')

    const sent = inviteSays({ ...base, mail: 'SENT' })
    expect(sent).toBe('Dana Whitfield has been invited as Program Manager and emailed. The seat is theirs when they sign in with dana@northbend.example. The email tells them how to sign in.')
  })

  it('what the inviter is told never says whether the address already has a password', () => {
    // The sentence takes no door at all: whether the person holds a
    // password, a work account or nothing decides only what the email says.
    for (const mail of ['SENT', 'FAILED', 'NOT_CONFIGURED', 'DEMO_SKIPPED'] as const) {
      const says = inviteSays({ ...base, mail })
      expect(says, mail).not.toMatch(/set their password|already has|has an account|kept with Etyme staff/)
    }
    const route = read('src/app/api/access/invite/route.ts')
    const one = read('src/app/api/access/invite/one.ts')
    expect(route).not.toContain('wayIn')
    expect(one).not.toMatch(/personName:\s*person\.name/)
    expect(one).not.toMatch(/door:\s*sent\.door/)
  })

  it('an invitation is said under the name the inviter typed, else the address, never the name Etyme already holds', () => {
    expect(invitedAs('Sam Okafor', 'sam@elsewhere.example')).toBe('Sam Okafor')
    expect(invitedAs('   ', 'sam@elsewhere.example')).toBe('sam')
    expect(invitedAs(undefined, 'kemi@nowhere.example')).toBe('kemi')
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
    // The waiting row is drawn by one function, read wherever it is listed.
    const waiting = page.slice(page.indexOf('const waitingRow = (w: Waiting) => ('), page.indexOf('const personRow = (p: Person) => ('))
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

  it('the invitation panel is drawn before the figures, so it is first on a phone', () => {
    expect(page.indexOf('<Panel title="Invite a teammate"')).toBeGreaterThan(-1)
    expect(page.indexOf('<Panel title="Invite a teammate"')).toBeLessThan(page.indexOf('<Stat label={f.label}'))
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
    expect(f.hint).toBe('A company address, or a personal one such as Gmail for a partner. A seat on a personal address can do everything its role can, money and signing included.')
    expect(f.personalWelcome).toBe(true)
    expect(f.mode).toBe('INVITE_ONLY')
  })

  it('at an invitation-only company or one with nothing set the hint says a personal-address seat is not limited, because the record limits one only at a hybrid company', async () => {
    const { inviteFormWords, PERSONAL_SEAT_UNLIMITED } = await import('@/lib/access-grant')
    const { isLimitedPublicSeat } = await import('@/lib/identity/policy')
    for (const mode of ['INVITE_ONLY', null] as const) {
      expect(isLimitedPublicSeat(policy(mode), true)).toBe(false)
      expect(inviteFormWords({ policy: policy(mode), domain: null, oneFirm: false }).hint).toContain(PERSONAL_SEAT_UNLIMITED)
    }
    expect(inviteFormWords({ policy: policy('HYBRID', ['https://login.example']), domain: null, oneFirm: false }).hint).not.toContain(PERSONAL_SEAT_UNLIMITED)
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

// ── The founder's three invitations to Tapin, 2026-11-12 ───────────────
//
// Faults 6 to 9 of his fifteen: each email "did not go" with no reason;
// nothing to copy and send by hand; "Invite them again" was a sentence and
// no control; and one address at a time.
import {
  mailLine, copyInvitation, signInLinkFor, parseAddresses, tooManyAtOnceSays, hourlyCapSays, seatCapSays,
  sentAgainSays, alreadyInvitedSays, MAX_ADDRESSES_AT_ONCE, SEND_AGAIN_LABEL, COPY_LABEL,
} from '@/lib/access-grant'
import { resendVerdict, offersFor } from '@/app/api/access/row-acts'
import { mailFailureSays } from '@/lib/notify/mail-failure'

describe('an invitation says whether its email left, and why not', () => {
  const base = { personName: 'Vik Ippili', email: 'vik@partner-mail.example', roleName: 'Admin' }

  it('an invitation the email sender refused tells the inviter why in Etyme’s words, and says to send it again or copy it', () => {
    const why = mailFailureSays({ kind: 'REFUSED' })
    const says = inviteSays({ ...base, mail: 'FAILED', reason: why })
    expect(says).toContain('the email to vik@partner-mail.example did not go.')
    expect(says).toContain(why)
    expect(says).toContain(`Press ${SEND_AGAIN_LABEL} on their row, or ${COPY_LABEL}.`)
    expect(says).not.toMatch(/Resend|SendGrid|\b4\d\d\b|5\d\d/)
    expect(says).not.toContain('Invite them again')
  })

  it('a demo address is said as a demo address, never as a failure', () => {
    const says = inviteSays({ ...base, mail: 'DEMO_SKIPPED' })
    expect(says).toContain('This is a demo address, so no email went to it.')
    expect(says).not.toContain('did not go')
  })

  it('a waiting row says "Email sent" with the day and time in the reader’s own zone', () => {
    const line = mailLine({ state: 'SENT', at: '2026-11-12T23:40:00.000Z', why: null }, 'America/Los_Angeles')
    expect(line).toBe('Email sent Thu, Nov 12, 3:40 PM PST.')
  })

  it('a waiting row whose email was refused says "Email not sent", the reason, and what to do', () => {
    const why = mailFailureSays({ kind: 'BUSY' })
    expect(mailLine({ state: 'FAILED', at: null, why }, 'UTC')).toBe(`Email not sent: ${why} Copy the invitation, or send it again.`)
    expect(mailLine({ state: 'NOT_CONFIGURED', at: null, why: mailFailureSays({ kind: 'NOT_SET_UP' }) }, 'UTC'))
      .toBe('Email not sent: No email can be sent from here yet. Copy the invitation and send it to them yourself.')
    expect(mailLine(null, 'UTC')).toBeNull()
  })

  it('a directory-only company is never sent a set-password link: its invitation’s door is the directory', async () => {
    const { doorFor } = await import('@/app/api/access/invite/one')
    expect(doorFor({ mode: 'SSO_ONLY', hasPassword: false, login: 'https://app.etyme.example/login' })).toBe('DIRECTORY')
    expect(doorFor({ mode: 'HYBRID', hasPassword: true, login: 'https://app.etyme.example/login' })).not.toBe('PASSWORD')
  })

  it('a directory-only company’s invitation email carries no set-password link and names the directory', () => {
    const l = inviteLetter({
      door: 'DIRECTORY', companyName: 'Corvane Packaging', roleName: 'HR', setPasswordUrl: null,
      loginUrl: 'https://app.etyme.example/login', linkHours: INVITE_LINK_HOURS, workAccount: true,
    })
    expect(l.link).toBeNull()
    expect(l.lines.join(' ')).toContain('through Corvane Packaging’s company directory')
    expect(l.lines.join(' ')).not.toMatch(/password/i)
  })
})

describe('Copy invitation', () => {
  const c = {
    inviterName: 'Sharath', companyName: 'Tapin', roleName: 'Admin', email: 'Sidhu.Partner@gmail.example',
    appUrl: 'https://www.etyme.example/', mode: 'HYBRID' as const, mailLeaves: true,
  }

  it('a copied invitation holds the sign-in page with the address carried, and no token and no seat id', () => {
    const text = copyInvitation(c)
    expect(text).toContain('https://www.etyme.example/login?email=sidhu.partner%40gmail.example')
    expect(text).not.toMatch(/\/reset\/|token|contextId|ctx_/i)
    expect(signInLinkFor('https://www.etyme.example/', 'a@b.example')).toBe('https://www.etyme.example/login?email=a%40b.example')
  })

  it('a copied invitation names the inviter, the company, the role and the exact address, and says Google or Microsoft, whichever the company uses', () => {
    expect(copyInvitation(c)).toBe(
      'Sharath invited you to Tapin on Etyme as Admin. Open https://www.etyme.example/login?email=sidhu.partner%40gmail.example ' +
      'and continue with Google or Microsoft as Sidhu.Partner@gmail.example, whichever your company uses. ' +
      'No Google or Microsoft account on that address? Choose Forgot your password? on that page and use the link we email you.',
    )
  })

  it('a copied invitation for a directory-only company says the company’s directory and never the word password', () => {
    const text = copyInvitation({ ...c, mode: 'SSO_ONLY', companyName: 'Corvane Packaging', email: 'mia@corvane.example' })
    expect(text).toContain('sign in through Corvane Packaging’s company directory as mia@corvane.example')
    expect(text).not.toMatch(/password|Google|Microsoft/i)
  })

  it('where no email can leave, a copied invitation does not send them to Forgot your password', () => {
    expect(copyInvitation({ ...c, mailLeaves: false })).not.toContain('Forgot your password?')
  })

  it('a copied invitation with no role yet says only who invited them and where', () => {
    expect(copyInvitation({ ...c, roleName: null })).toMatch(/^Sharath invited you to Tapin on Etyme\. Open /)
  })

  it('Copy invitation never puts the text on a browser pop-up, and falls back to a selected read-only box', () => {
    const page = read('src/app/dashboard/access/page.tsx')
    expect(page).toContain('navigator.clipboard.writeText(text)')
    expect(page).toMatch(/<textarea ref=\{box\} readOnly/)
    expect(page).not.toMatch(/\b(alert|confirm|prompt)\(/)
    // Who copied is recorded by a small POST, never the text itself.
    expect(page).toContain('/api/access/${contextId}/copied')
  })
})

describe('Send the invitation again', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    contextId: 'c1', personId: 'p1', hasSignedIn: false, roleId: 'r', rolePermissions: [],
    suspendedAt: null, revokedAt: null, isOwner: false, invited: true, ...over,
  }) as any

  it('Send again and Copy are offered only on a seat that was invited and never signed in', () => {
    expect(resendVerdict(row(), { isOwner: true, personId: 'me' }).allowed).toBe(true)
    expect(resendVerdict(row({ hasSignedIn: true }), { isOwner: true, personId: 'me' }).reason)
      .toBe('They have already signed in, so there is no invitation left to send.')
    expect(resendVerdict(row({ invited: false }), { isOwner: true, personId: 'me' }).allowed).toBe(false)
  })

  it('a paused or ended seat is not sent its invitation again', () => {
    expect(resendVerdict(row({ suspendedAt: new Date() }), { isOwner: true, personId: 'me' }).reason).toBe('Their seat is paused. Reinstate it first.')
    expect(resendVerdict(row({ revokedAt: new Date() }), { isOwner: true, personId: 'me' }).allowed).toBe(false)
  })

  it('an Admin cannot send an invitation again to an Owner’s seat, and an Owner can', () => {
    expect(resendVerdict(row({ isOwner: true }), { isOwner: false, personId: 'me' }).reason)
      .toBe('They are invited as an Owner. Only an Owner sends an Owner’s invitation. An Admin never can.')
    expect(resendVerdict(row({ isOwner: true }), { isOwner: true, personId: 'me' }).allowed).toBe(true)
  })

  it('a reader who cannot manage people is offered neither Send again nor Copy on any row', () => {
    const offer = offersFor([row()], { isOwner: true, personId: 'me' }, false).get('c1')!
    expect(offer.resend).toBe(false)
    expect(offer.copy).toBe(false)
    const mine = offersFor([row()], { isOwner: true, personId: 'me' }, true).get('c1')!
    expect(mine.resend && mine.copy).toBe(true)
  })

  it('Send again says it went to the address on record, as the same seat, or why it did not', () => {
    expect(sentAgainSays('vik@partner-mail.example', 'SENT', null)).toBe('Sent again to vik@partner-mail.example. It is the same seat; nothing was duplicated.')
    const why = mailFailureSays({ kind: 'DOWN' })
    const not = sentAgainSays('vik@partner-mail.example', 'FAILED', why)
    expect(not).toContain(why)
    expect(not).toContain('nothing was duplicated')
  })

  it('the invite form tells the inviter an address is already invited and where to press Send again', () => {
    expect(alreadyInvitedSays('vik@partner-mail.example')).toBe(`vik@partner-mail.example is already invited here. Press ${SEND_AGAIN_LABEL} on their row to email them once more, or ${COPY_LABEL}.`)
  })

  it('a seat emailed three times in an hour is refused in one sentence that says when to try again and points to Copy', () => {
    const says = seatCapSays('vik@partner-mail.example', new Date('2026-11-12T23:40:00.000Z'), 'America/New_York')
    expect(says).toBe('vik@partner-mail.example was emailed 3 times in the last hour. Copy invitation and send it yourself, or send it again after Thu, Nov 12, 6:40 PM EST.')
  })

  it('"Invite them again" is gone from every word a person reads on Users & permissions', () => {
    for (const f of ['src/lib/access-grant.ts', 'src/app/api/access/row-acts.ts', 'src/app/api/access/[contextId]/route.ts', 'src/app/dashboard/access/page.tsx']) {
      expect(read(f), f).not.toMatch(/invite them again/i)
    }
  })
})

describe('inviting several at once', () => {
  it('several addresses pasted one per line or with commas are read once each, lowercased, and what is not an address is kept apart', () => {
    expect(parseAddresses('A@x.example, b@y.example\nA@x.example;  not-an-address \n\n Pat Lee <pat@z.example>')).toEqual({
      addresses: ['a@x.example', 'b@y.example', 'pat@z.example'],
      notAddresses: ['not-an-address'],
    })
  })

  it('a list of more than twenty addresses is refused in one sentence', () => {
    expect(MAX_ADDRESSES_AT_ONCE).toBe(20)
    expect(tooManyAtOnceSays(23)).toBe('That is 23 addresses. Invite at most 20 at a time, then the rest.')
  })

  it('a company that has sent its hour of invitations is told when to try again', () => {
    expect(hourlyCapSays(new Date('2026-11-12T23:40:00.000Z'), 'UTC')).toBe('60 invitations have gone out from here in the last hour. Try again after Thu, Nov 12, 11:40 PM UTC.')
  })

  it('the result is one line per address in a box that scrolls on its own at phone width, each with Copy and Send again', () => {
    const page = read('src/app/dashboard/access/page.tsx')
    expect(page).toMatch(/max-h-80 overflow-y-auto overflow-x-hidden/)
    expect(page).toContain('<CopyInvitation contextId={l.contextId} text={l.copyText} />')
    expect(page).toContain('<SendAgain contextId={l.contextId}')
  })
})

// ── Faults 10 and 14 (founder, 2026-11-12): one count, one join sentence ──

describe('Users & permissions counts people the way Settings and Team structure do', () => {
  const route = read('src/app/api/access/route.ts')
  const page = read('src/app/dashboard/access/page.tsx')
  const rolesRoute = read('src/app/api/roles/route.ts')

  type Row = Parameters<typeof import('@/lib/company-seats').seatsFrom>[0][number]
  const row = (over: Partial<Row> & { email?: string; signedIn?: boolean } = {}): Row => {
    const { email = 'meera@brightmoor.example', signedIn = true, ...rest } = over
    return {
      id: `c-${Math.random()}`, personId: 'p', type: 'EMPLOYEE', roleId: 'r-rec', orgUnitId: null,
      grantedAt: new Date('2026-10-01'), invitedAt: signedIn ? null : new Date('2026-11-10'),
      lastUsedAt: null, suspendedAt: null, revokedAt: null,
      role: { name: 'Recruiter' },
      person: { name: 'Meera Pillai', primaryEmail: email, credentials: signedIn ? [{ id: 'k' }] : [] },
      ...rest,
    }
  }

  it('Users & permissions reads its figures from the one reader of seats that Settings and Team structure read', () => {
    expect(route).toContain("from '@/lib/company-seats'")
    expect(route).toContain('readCompanySeats(caller.company.id)')
    expect(route).toContain('countSeats(peopleOf(seats))')
    expect(route).toContain('peopleSays')
  })

  it('the headline says what it counts, as "6 people: 3 with access · 3 invited"', async () => {
    const { peopleWords } = await import('@/lib/company-seats')
    expect(peopleWords({ withAccess: 3, invited: 3, waitingForRole: 0, paused: 0 })).toBe('6 people: 3 with access · 3 invited')
    expect(page).toContain('{s.peopleSays}')
  })

  it('a person invited who never signed in is counted as invited, not as with access', async () => {
    const { seatsFrom, peopleOf, countSeats } = await import('@/lib/company-seats')
    const c = countSeats(peopleOf(seatsFrom([row(), row({ signedIn: false })], 'Brightmoor Staffing')))
    expect(c).toEqual({ withAccess: 1, invited: 1, waitingForRole: 0, paused: 0 })
  })

  it('a paused seat is counted as paused, and never as with access', async () => {
    const { seatsFrom, peopleOf, countSeats } = await import('@/lib/company-seats')
    const c = countSeats(peopleOf(seatsFrom([row(), row({ suspendedAt: new Date('2026-11-11') })], 'Brightmoor Staffing')))
    expect(c).toEqual({ withAccess: 1, invited: 0, waitingForRole: 0, paused: 1 })
  })

  // Brought up to the founder's words of 2026-11-12: each figure's line is
  // now figureWords' sentence, what it counts and whose move it is, in
  // place of the hand-typed sub-lines this sentence used to pin.
  it('each figure on the page says what it counts, in the one function’s words', () => {
    expect(page).toContain('<Stat label={f.label} value={f.value} sub={f.says} href={`?show=${f.key}`}')
    expect(route).toContain('figures: figuresFor(counts, decisions.size, parts)')
    expect(page).not.toContain('sub="signed in, not paused"')
  })

  it('a consultant seat is listed and marked, and never counted among the company’s people', async () => {
    const { seatsFrom, peopleOf, countSeats } = await import('@/lib/company-seats')
    const c = countSeats(peopleOf(seatsFrom([row(), row({ type: 'CONSULTANT' })], 'Brightmoor Staffing')))
    expect(c.withAccess).toBe(1)
    expect(route).toContain('consultant: isConsultant(c.id)')
    expect(page).toContain("const CONSULTANT_NOTE = 'consultant on your books, not counted'")
  })

  it('the shared sample seat is neither listed nor counted on Users & permissions', async () => {
    const { seatsFrom, peopleOf } = await import('@/lib/company-seats')
    const { SAMPLE_PERSON_EMAIL } = await import('@/lib/sample-seat')
    expect(peopleOf(seatsFrom([row({ email: SAMPLE_PERSON_EMAIL })], 'Northbend Athletic'))).toEqual([])
    expect(route).toContain('const listed = contexts.filter(c => !isSample(c.id))')
  })

  it('a seat named with the company’s own name reads as the name in its address, never as the company', async () => {
    const { seatsFrom } = await import('@/lib/company-seats')
    const [s] = seatsFrom([row({ person: { name: 'Tapin', primaryEmail: 'sharath@tapin.example', credentials: [{ id: 'k' }] } })], 'Tapin')
    expect(s.name).toBe('Sharath')
    // A seat no reader mapped falls back to the same rule, never the raw Person.name.
    expect(route).toContain('seatOf.get(c.id)?.name ?? personNameFor(c.person.name, c.person.primaryEmail, caller.company!.name)')
  })

  it('the role pickers count a role’s permissions the way Settings → Roles does, so the Owner reads everything', async () => {
    const { roleCanDo } = await import('@/lib/company-roles')
    expect(roleCanDo({ permissions: ['*'] }).everything).toBe(true)
    expect(rolesRoute).toContain('permissionCount: roleCanDo(r).count')
    expect(rolesRoute).not.toContain('permissions.length')
  })
})

describe('Users & permissions says how people join in the one join sentence', () => {
  const route = read('src/app/api/access/route.ts')
  const page = read('src/app/dashboard/access/page.tsx')
  const facts = (over: Partial<import('@/lib/join-words').JoinFacts> = {}): import('@/lib/join-words').JoinFacts => ({
    companyName: 'Tapin', kind: 'VENDOR', slug: 'tapin', mode: 'OPEN', domains: [], ...over,
  })

  it('the fixed sentence that everybody on the email domain joins at once as Member is gone', () => {
    expect(page).not.toContain('joins automatically as a Member')
    expect(page).not.toContain('Anyone signing in on your company’s email domain')
  })

  it('the line under the heading and the invitation form’s help read the join sentence the route sends', () => {
    expect(route).toContain('joinSentenceFor(caller.company.id)')
    expect(page).toContain('subtitle={memberLine(data.canInvite === false ? data.joins : null)}')
    expect(page).toContain('{inviteHelp(data.joins)}')
  })

  it('a company with no verified domain whose Owners sign in on Gmail or Etyme’s own domain is told people join by invitation only', async () => {
    const { joinSentence } = await import('@/lib/join-words')
    expect(joinSentence(facts())).toBe('People join Tapin by invitation only. An Owner or Admin invites each person from Users & permissions.')
  })

  it('a verified domain set to join at once is said as joining at once as Member, waiting for a role', async () => {
    const { joinSentence } = await import('@/lib/join-words')
    const s = joinSentence(facts({ companyName: 'Brightmoor Staffing', domains: [{ domain: 'brightmoor.example', verified: true, joinPolicy: 'AUTO' }] }))
    expect(s).toContain('on brightmoor.example joins at once as Member and waits for a role')
  })

  it('a verified domain that asks to join is never said to join at once', async () => {
    const { joinSentence } = await import('@/lib/join-words')
    const s = joinSentence(facts({ domains: [{ domain: 'brightmoor.example', verified: true, joinPolicy: 'REQUEST' }] }))!
    expect(s).toContain('asks to join')
    expect(s).not.toContain('at once')
  })

  it('a directory-only company is never told about passwords or emailed links', async () => {
    const { joinSentence } = await import('@/lib/join-words')
    const s = joinSentence(facts({ mode: 'SSO_ONLY' }))!
    expect(s).toContain('directory')
    expect(s.toLowerCase()).not.toMatch(/password|link/)
  })

  it('a one-person firm is told nothing about colleagues joining', async () => {
    const { joinSentence } = await import('@/lib/join-words')
    expect(joinSentence(facts({ kind: 'CONSULTANT_CORP' }))).toBeNull()
  })
})

/**
 * The Owner walk at 390 wide, 2026-11-12: Pause and End access on every
 * "Everyone with access" row were drawn off the right edge, because the
 * row did not wrap and its buttons and two fixed columns would not
 * shrink. The browser walk is the real guard; these sentences read the
 * row's own classes so the shape cannot quietly come back.
 */
describe('Users & permissions at phone width', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const between = (from: string, to: string) => {
    const a = page.indexOf(from)
    const b = page.indexOf(to, a + from.length)
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    return page.slice(a, b)
  }
  const everyoneRow = between('<div key={p.contextId} id={personAnchor(p.contextId)}', '{acting?.contextId === p.contextId')
  const waitingRow = between('<div key={w.contextId} id={personAnchor(w.contextId)}', '{acting?.contextId === w.contextId')
  const rowActs = between('function RowActs(', 'function CopyInvitation(')
  const classes = (s: string) => [...s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2])

  it('every flex row on an "Everyone with access" row wraps, so its buttons drop under the name on a phone', () => {
    const flexRows = classes(everyoneRow).filter((c) => /(^|\s)flex(\s|$)/.test(c) && !c.includes('flex-col'))
    expect(flexRows.length).toBeGreaterThan(0)
    for (const c of flexRows) expect(c).toContain('flex-wrap')
  })

  it('every flex row on a "Waiting for access" row wraps too', () => {
    const flexRows = classes(waitingRow).filter((c) => /(^|\s)flex(\s|$)/.test(c) && !c.includes('flex-col'))
    expect(flexRows.length).toBeGreaterThan(0)
    for (const c of flexRows) expect(c).toContain('flex-wrap')
  })

  it('Change role, Pause, Reinstate, End access and Withdraw invitation sit in a group of their own that takes the full width on a phone', () => {
    expect(everyoneRow).toMatch(/className="flex flex-wrap items-center gap-2 w-full sm:w-auto">\s*\{data\.canGrant !== false/)
    expect(waitingRow).toMatch(/className="flex flex-wrap items-center gap-2 w-full sm:w-auto">/)
    expect(everyoneRow.indexOf('<RowActs')).toBeGreaterThan(everyoneRow.indexOf('w-full sm:w-auto">\n                  {data.canGrant'))
  })

  it('no button on a row refuses to shrink: no shrink-0 on the row or on its Pause, Reinstate, End and Withdraw buttons', () => {
    for (const c of [...classes(everyoneRow), ...classes(waitingRow), ...classes(rowActs)]) {
      expect(c).not.toContain('shrink-0')
    }
  })

  it('no fixed-width column on a row holds its width below sm: the end day and the sensitivity stack under the name', () => {
    for (const c of [...classes(everyoneRow), ...classes(waitingRow)]) {
      for (const tok of c.split(/\s+/)) {
        // A bare w-<n> or max-w-[…] holds at every width; an sm: one only from sm up.
        expect(tok).not.toMatch(/^(max-)?w-(\d|\[)/)
      }
    }
  })

  it('a reader who may not give roles reads why across the full width on a phone, never in a box wider than the screen', () => {
    expect(waitingRow).toContain('w-full sm:w-auto sm:max-w-[380px] text-xs text-etyme-muted break-words')
  })
})

describe('the sentence a paused person reads', () => {
  it('a reason that ends in its own period is said with one period, never two', async () => {
    const { pausedSays } = await import('@/lib/access-grant')
    const s = pausedSays('Tapin', 'On leave until she is back.')
    expect(s).toBe('Your access at Tapin is paused: On leave until she is back. Somebody there can lift it.')
    expect(s).not.toContain('..')
  })

  it('a reason with no stop, or ending in a question or exclamation mark, still reads as one sentence with one stop', async () => {
    const { pausedSays } = await import('@/lib/access-grant')
    expect(pausedSays('Tapin', 'on leave')).toBe('Your access at Tapin is paused: on leave. Somebody there can lift it.')
    expect(pausedSays('Tapin', 'Back Monday!  ')).not.toMatch(/[.!?]\s*\./)
  })

  it('a pause with no reason says so plainly, and a seat with no company name says this company', async () => {
    const { pausedSays } = await import('@/lib/access-grant')
    expect(pausedSays(null, null)).toBe('Your access at this company is paused. Somebody there can lift it.')
  })

  it('the refusal a paused seat meets on every request is the same pausedSays sentence, so a reason ending in a period never reads back.. Somebody', async () => {
    const { whenThereIsNoSeat } = await import('@/lib/api-context')
    const v = whenThereIsNoSeat({ isStaff: false, paused: { companyName: 'Tapin', reason: 'On leave until she is back.' }, ended: null } as never)
    expect(v).toMatchObject({ staff: false, code: 'SUSPENDED', says: 'Your access at Tapin is paused: On leave until she is back. Somebody there can lift it.' })
    expect(read('src/lib/api-context.ts')).toContain('says: pausedSays(args.paused.companyName, args.paused.reason)')
  })

  it('the email telling a person they were paused joins the reason the same way', () => {
    expect(read('src/app/api/access/[contextId]/route.ts')).toContain('paused it: ${clause(reason)}.')
  })
})

describe('one moment, said one way', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const invite = read('src/app/api/access/invite/route.ts')
  const resend = read('src/app/api/access/[contextId]/resend/route.ts')

  it('the hourly refusals send the moment to try again as an instant beside the sentence', () => {
    expect(invite).toContain("cap: 'HOURLY', again: again.toISOString()")
    // Send again carries either cap, the company's hour or the seat's, as an instant.
    expect(resend).toContain("cap: 'SEAT'")
    expect(resend).toContain("cap: 'HOURLY'")
    expect(resend).toContain("cap, email, again: again.toISOString()")
  })

  it('the screen says that moment in the reader’s own zone, never the server’s UTC', async () => {
    const { capRefusalSays } = await import('@/lib/access-grant')
    const err = { code: 'TOO_MANY_THIS_HOUR', cap: 'HOURLY', again: '2026-11-12T23:40:00.000Z' }
    expect(capRefusalSays(err, 'America/Los_Angeles')).toBe('60 invitations have gone out from here in the last hour. Try again after Thu, Nov 12, 3:40 PM PST.')
    const seat = capRefusalSays({ code: 'TOO_MANY_THIS_HOUR', cap: 'SEAT', email: 'vik@partner-mail.example', again: '2026-11-12T23:40:00.000Z' }, 'America/New_York')!
    expect(seat).toContain('vik@partner-mail.example')
    expect(seat).toContain('6:40 PM EST')
    expect(page).toContain('capRefusalSays(j?.error, readerZone())')
  })

  it('any other refusal is left to the route’s own sentence', async () => {
    const { capRefusalSays } = await import('@/lib/access-grant')
    expect(capRefusalSays({ code: 'VALIDATION', again: '2026-11-12T23:40:00.000Z' }, 'UTC')).toBeNull()
    expect(capRefusalSays({ code: 'TOO_MANY_THIS_HOUR', cap: 'HOURLY', again: 'not a day' }, 'UTC')).toBeNull()
    expect(capRefusalSays(null, 'UTC')).toBeNull()
  })

  it('"Email sent" on a row and after an invitation is drawn on the screen from the instant, in the reader’s zone', () => {
    expect(page).toContain('mailLine(mail, readerZone())')
    expect(invite).not.toMatch(/Email sent/)
  })
})

/**
 * The founder at Tapin, 2026-11-12: each row showed a role and beside it
 * "high" or "critical" in lower case, with nothing saying what either
 * meant. They are one system: the level is read off what the role can do,
 * said in words, with why on the chip and one legend above the list.
 */
describe('the level beside a role, said in words', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const route = read('src/app/api/access/route.ts')

  it('the legend on Users and permissions is built from the same lists that decide a role’s level', async () => {
    const { levelLegend, CRITICAL_PERMISSIONS, HIGH_PERMISSIONS } = await import('@/lib/access-grant')
    const { GRANT_LABELS } = await import('@/lib/permission-grants/words')
    const lines = Object.fromEntries(levelLegend().map((l) => [l.key, l.says]))
    for (const p of HIGH_PERMISSIONS) {
      const words = (GRANT_LABELS as Record<string, string>)[p]
      if (words) expect(lines.HIGH).toContain(words)
    }
    for (const p of CRITICAL_PERMISSIONS) {
      const words = (GRANT_LABELS as Record<string, string>)[p]
      if (words) expect(lines.CRITICAL).toContain(words)
    }
    expect(page).toContain('const lines = levelLegend()')
  })

  it('the legend says what Critical, High, Standard and Read only mean, Critical first', async () => {
    const { levelLegend } = await import('@/lib/access-grant')
    expect(levelLegend().map((l) => l.label)).toEqual(['Critical', 'High', 'Standard', 'Read only', 'No role yet'])
    expect(levelLegend()[0].says).toContain('so it can change who has access')
  })

  it('a role that can change who has access reads as Critical, and the chip says why in a sentence', async () => {
    const { levelOf } = await import('@/lib/access-grant')
    const l = levelOf('Admin', ['settings.manage', 'team.manage'])
    expect(l.label).toBe('Critical')
    expect(l.why).toBe('Critical because this role can change company settings, so it can change who has access.')
  })

  it('a role holding everything reads Critical and says so in words, never as an asterisk', async () => {
    const { levelOf } = await import('@/lib/access-grant')
    const l = levelOf('Owner', ['*'])
    expect(l.label).toBe('Critical')
    expect(l.why).toContain('do everything here')
    expect(l.why).not.toContain('*')
  })

  it('paying and sending bills are High, not Critical, and the chip says what the role can do', async () => {
    const { levelOf } = await import('@/lib/access-grant')
    expect(levelOf('AP & Payroll', ['payments.record', 'timesheets.read'])).toMatchObject({ label: 'High', why: 'High because this role can record money received.' })
    expect(levelOf('Accounts Receivable', ['invoices.issue']).why).toContain('send a bill to a customer')
  })

  it('a role that can only look reads as Read only, and an everyday role as Standard', async () => {
    const { levelOf } = await import('@/lib/access-grant')
    expect(levelOf('Viewer', ['invoices.read', 'timesheets.read']).label).toBe('Read only')
    expect(levelOf('Recruiter', ['submissions.create', 'consultants.read']).label).toBe('Standard')
  })

  it('a seat on the Member role reads No role yet, never Standard or Read only', async () => {
    const { levelOf } = await import('@/lib/access-grant')
    expect(levelOf('Member', [])).toMatchObject({ key: 'NO_ROLE', label: 'No role yet' })
  })

  it('the level is written in words, never as an enum lower-cased with its underscore taken out', () => {
    expect(page).not.toContain("p.sensitivity.toLowerCase().replace('_', ' ')")
    expect(page).toContain('{levelWords(p)}')
    expect(route).toContain('level: levelOf(c.role!.name, c.role!.permissions)')
  })

  it('the level chip says why on hover and on a tap, so a phone reads it too', () => {
    expect(page).toContain('title={p.level?.why}')
    expect(page).toContain('onClick={() => setLevelOpen(levelOpen === p.contextId ? null : p.contextId)}')
    expect(page).toContain('{levelOpen === p.contextId && p.level?.why && (')
  })

  it('the legend folds behind “What do these levels mean?” on a phone and is open from sm up', () => {
    expect(page).toContain('<details className="sm:hidden">')
    expect(page).toContain('What do these levels mean?')
    expect(page).toContain('<div className="hidden sm:block">{list}</div>')
  })
})

/**
 * The founder at Tapin, 2026-11-12: every figure at the top says what it
 * counts and whose move it is, and is a door to exactly the rows it
 * counted. Consultants are under their own heading and never counted.
 */
describe('the figures on Users and permissions say what they count and filter to what they counted', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const route = read('src/app/api/access/route.ts')
  const NONE = { noRole: 0, ended: 0, neverUsed: 0, notUsedLately: 0, endingSoon: 0 }

  it('each figure says what it counts and what the person should do', async () => {
    const { figureWords } = await import('@/lib/access-grant')
    expect(figureWords('invited', 3)!.says).toBe('3 invited, never signed in. Send the invitation again or withdraw it.')
    expect(figureWords('paused', 1)!.says).toBe('1 paused, cannot sign in. Reinstate or end the seat.')
    expect(figureWords('waiting-for-role', 2)!.says).toBe('2 signed in with no role. Give each a role.')
    expect(figureWords('with-access', 4)!.says).toBe('4 can sign in and work. Nothing to do.')
  })

  it('a figure of zero is not drawn, except With access', async () => {
    const { figureWords, figuresFor } = await import('@/lib/access-grant')
    expect(figureWords('invited', 0)).toBeNull()
    expect(figureWords('paused', 0)).toBeNull()
    expect(figureWords('decision', 0, NONE)).toBeNull()
    expect(figureWords('with-access', 0)!.label).toBe('With access')
    expect(figuresFor({ withAccess: 4, invited: 3, waitingForRole: 0, paused: 0 }, 0, NONE).map((f) => f.label)).toEqual(['With access', 'Invited'])
  })

  it('Needs a decision names its parts in its line, each with its count, and reads the day constants the review uses', async () => {
    const { figureWords, DORMANT_DAYS, IDLE_DAYS, EXPIRING_DAYS } = await import('@/lib/access-grant')
    const f = figureWords('decision', 5, { noRole: 2, neverUsed: 1, notUsedLately: 1, endingSoon: 1, ended: 0 })!
    expect(f.says).toBe(`5 to decide: 2 with no role yet, 1 never used in ${DORMANT_DAYS} days, 1 not used in ${IDLE_DAYS} days and 1 ending within ${EXPIRING_DAYS} days. Give a role, renew it or end it.`)
    expect(f.says).not.toContain('ended')
  })

  it('the parts of Needs a decision add up to its number, a Member also on the review counted once', async () => {
    const { decisionParts, decisionSeats } = await import('@/lib/access-grant')
    const review = [{ contextId: 'a', finding: 'DORMANT' as const }, { contextId: 'b', finding: 'EXPIRING' as const }]
    const withAccess = [{ contextId: 'a', roleName: 'Member' }, { contextId: 'c', roleName: 'Member' }, { contextId: 'd', roleName: 'Recruiter' }]
    const p = decisionParts(review, withAccess)
    expect(p).toEqual({ noRole: 1, ended: 0, neverUsed: 1, notUsedLately: 0, endingSoon: 1 })
    expect(p.noRole + p.neverUsed + p.endingSoon).toBe(decisionSeats(review, withAccess).size)
  })

  it('a figure is a link that filters the lists below, the filter kept in the address as a query word', async () => {
    const { figureFromQuery } = await import('@/lib/access-grant')
    expect(figureFromQuery('invited')).toBe('invited')
    expect(figureFromQuery('everyone')).toBeNull()
    expect(page).toContain("new URLSearchParams(window.location.search).get('show')")
    expect(page).toContain('window.history.pushState(null')
    expect(page).toContain("window.addEventListener('popstate', read)")
  })

  it('a filtered list says what it shows and offers everyone again, directly under the figures', async () => {
    const { figureWords } = await import('@/lib/access-grant')
    expect(figureWords('invited', 3)!.showing).toBe('3 invited')
    expect(page).toContain('Showing {activeFigure.showing}')
    expect(page).toContain('Show everyone</a>')
    expect(page.indexOf('Showing {activeFigure.showing}')).toBeLessThan(page.indexOf('<h2 className="font-serif text-lg text-etyme-ink mb-3">Waiting for access</h2>'))
  })

  it('the number on a figure is the number of rows its filter shows, because both read the same seat states and decision set', () => {
    expect(route).toContain('figure: figureOf(c.id)')
    expect(route).toContain('decision: decisions.has(c.id)')
    expect(route).toContain('const decisions = decisionSeats(ownReview, ownWithAccess)')
    expect(page).toContain("!active || (active === 'decision' ? r.decision === true : r.figure === active)")
  })

  it('the rows a figure filters are read from the seat states the counts are, so an invited seat never signed in is counted once, as invited, and never as a decision', async () => {
    const { seatsFrom, peopleOf, countSeats } = await import('@/lib/company-seats')
    const row = (signedIn: boolean, id: string) => ({
      id, personId: id, type: 'EMPLOYEE', roleId: 'r-admin', orgUnitId: null,
      grantedAt: new Date('2026-11-01'), invitedAt: signedIn ? null : new Date('2026-11-10'),
      lastUsedAt: null, suspendedAt: null, revokedAt: null, role: { name: 'Admin' },
      person: { name: 'Partner', primaryEmail: `${id}@gmail.com`, credentials: signedIn ? [{ id: 'k' }] : [] },
    })
    const c = countSeats(peopleOf(seatsFrom([row(true, 'o'), row(false, 'x'), row(false, 'y'), row(false, 'z')], 'Tapin')))
    expect(c.invited).toBe(3)
    // The review reads only seats with access, so an invited seat is never one of the decisions.
    expect(route).toContain('const ownWithAccess = withAccess.filter(c => !isConsultant(c.id))')
  })

  it('consultants are under their own heading, say why they are not counted, and are never in the figures', () => {
    expect(page).toContain('Consultants on your books')
    expect(page).toContain('They are listed so their seats can be acted on, and are not counted in the figures above.')
    expect(page).toContain("data.people.filter((p: Person) => !p.consultant && counted(p))")
    expect(route).toContain('const ownReview = review.filter(r => !isConsultant(r.contextId))')
  })

  it('the Worth a look chip says never used, not dormant', async () => {
    const { FINDING_WORDS } = await import('@/lib/access-grant')
    expect(FINDING_WORDS.DORMANT).toBe('never used')
    expect(page).not.toContain('{r.finding.toLowerCase()}')
    expect(page).toContain('{r.findingWords ?? r.finding}')
  })

  it('a decision row says its own finding while Needs a decision filters the list', () => {
    expect(route).toContain('findings: findingsOf(c.id)')
    expect(page).toContain("show === 'decision' && p.findings && p.findings.length > 0")
  })

  it('the figures count the same people as the headline above them, from the one reader', () => {
    expect(route).toContain('const counts = countSeats(peopleOf(seats))')
    expect(route).toContain('waitingForRole: counts.waitingForRole')
    expect(route).toContain('peopleSays')
  })
})

/**
 * Tapin, 2026-11-12: timesheets@ was seated as AP & Payroll and read as a
 * person called "Timesheets". A shared sign-in is shown by its address,
 * with a quiet chip saying why, and is listed and counted as before.
 */
describe('a shared sign-in on Users and permissions', () => {
  const page = read('src/app/dashboard/access/page.tsx')
  const route = read('src/app/api/access/route.ts')
  type Row = Parameters<typeof import('@/lib/company-seats').seatsFrom>[0][number]
  const row = (name: string, email: string): Row => ({
    id: `c-${email}`, personId: email, type: 'EMPLOYEE', roleId: 'r', orgUnitId: null,
    grantedAt: new Date('2026-10-01'), invitedAt: null, lastUsedAt: null, suspendedAt: null, revokedAt: null,
    role: { name: 'AP & Payroll' }, person: { name, primaryEmail: email, credentials: [{ id: 'k' }] },
  })

  it('a mailbox such as timesheets at the company’s own address is shown by its sign-in address with the label Shared sign-in', async () => {
    const { seatsFrom } = await import('@/lib/company-seats')
    const [s] = seatsFrom([row('Timesheets', 'timesheets@tapin.example')], 'Tapin')
    expect(s.shared).toBe(true)
    expect(s.name).toBe('timesheets@tapin.example')
    expect(route).toContain('shared: sharedOf(c.id)')
    expect(route).toContain("const sharedOf = (id: string) => seatOf.get(id)?.shared ?? false")
    expect(page).toContain("const SHARED_LABEL = 'Shared sign-in'")
  })

  it('the chip says on hover and on a tap that several people may use the address and what to do', () => {
    expect(page).toContain('Several people may use this address, so the log cannot say which of them did something. Give each person a seat of their own, or rename this one if it is one person.')
    expect(page).toContain('title={SHARED_SAYS}')
    expect(page).toContain('{p.shared && sharedOpen === p.contextId && <div')
    expect(page).toContain('{w.shared && sharedOpen === w.contextId && <div')
  })

  it('oliver at the company is shown as Oliver and not as a shared sign-in', async () => {
    const { seatsFrom } = await import('@/lib/company-seats')
    const [s] = seatsFrom([row('Oliver', 'oliver@tapin.example')], 'Tapin')
    expect(s.shared).toBe(false)
    expect(s.name).toBe('Oliver')
  })

  it('a shared sign-in is never left off the list and is counted like any other seat', async () => {
    const { seatsFrom, peopleOf, countSeats } = await import('@/lib/company-seats')
    const seats = seatsFrom([row('Timesheets', 'timesheets@tapin.example'), row('Oliver', 'oliver@tapin.example')], 'Tapin')
    expect(peopleOf(seats)).toHaveLength(2)
    expect(countSeats(peopleOf(seats)).withAccess).toBe(2)
  })

  it('the row’s name is the one seat reader’s, never the raw Person.name', () => {
    expect(route).toContain('seatOf.get(c.id)?.name ?? personNameFor(c.person.name, c.person.primaryEmail, caller.company!.name)')
    expect(route).not.toContain('seatOf.get(c.id)?.name ?? c.person.name')
  })

  it('the shared sample seat never appears at a real company', async () => {
    const { seatsFrom, peopleOf } = await import('@/lib/company-seats')
    const { SAMPLE_PERSON_EMAIL } = await import('@/lib/sample-seat')
    const seats = seatsFrom([row('Sample', SAMPLE_PERSON_EMAIL), row('Oliver', 'oliver@tapin.example')], 'Tapin')
    expect(peopleOf(seats).map((s) => s.email)).toEqual(['oliver@tapin.example'])
    expect(route).toContain('const listed = contexts.filter(c => !isSample(c.id))')
  })
})

describe('renaming the person on a seat', () => {
  const facts = (over: Partial<import('@/app/api/access/row-acts').RenameFacts> = {}) => ({
    mayManage: true, actorIsOwner: true, targetIsOwner: false, seatElsewhere: false, onlyPersonOfOneFirm: false, ...over,
  })

  it('the Owner or an Admin may rename a seat at their own company', async () => {
    const { renameVerdict } = await import('@/app/api/access/row-acts')
    expect(renameVerdict(facts()).allowed).toBe(true)
    expect(renameVerdict(facts({ actorIsOwner: false })).allowed).toBe(true)
  })

  it('an Admin never renames an Owner', async () => {
    const { renameVerdict } = await import('@/app/api/access/row-acts')
    expect(renameVerdict(facts({ actorIsOwner: false, targetIsOwner: true }))).toMatchObject({ allowed: false, reason: 'Only an Owner renames an Owner.' })
    expect(renameVerdict(facts({ targetIsOwner: true })).allowed).toBe(true)
  })

  it('a person who also holds a live seat at another company changes their own name under Your data', async () => {
    const { renameVerdict } = await import('@/app/api/access/row-acts')
    expect(renameVerdict(facts({ seatElsewhere: true })).reason).toBe('They also have a seat at another company, so they change their own name under Your data.')
  })

  it('a one-person firm’s only person is never renamed from this page', async () => {
    const { renameVerdict } = await import('@/app/api/access/row-acts')
    expect(renameVerdict(facts({ onlyPersonOfOneFirm: true })).allowed).toBe(false)
  })

  it('a reader who cannot change access is offered no rename', async () => {
    const { renameVerdict } = await import('@/app/api/access/row-acts')
    expect(renameVerdict(facts({ mayManage: false })).allowed).toBe(false)
  })

  it('an empty name, the company’s own name and a name that is only a role word are refused in a sentence', async () => {
    const { renameNameSays, RENAME_SAYS } = await import('@/app/api/access/row-acts')
    expect(renameNameSays('   ', 'Tapin', [])).toBe(RENAME_SAYS.EMPTY)
    expect(renameNameSays('TAPIN', 'Tapin', [])).toBe(RENAME_SAYS.COMPANY)
    expect(renameNameSays('AP & Payroll', 'Tapin', ['AP & Payroll'])).toBe(RENAME_SAYS.ROLE)
    expect(renameNameSays('Timesheets', 'Tapin', [])).toBe(RENAME_SAYS.ROLE)
    expect(renameNameSays('Rosa Delgado', 'Tapin', ['AP & Payroll'])).toBeNull()
  })

  it('a person with a page of their own as a worker, or work with their name on it, changes their own name', async () => {
    const { renameVerdict, RENAME_SAYS } = await import('@/app/api/access/row-acts')
    expect(renameVerdict(facts({ ownRecord: true }))).toMatchObject({ allowed: false, reason: RENAME_SAYS.OWN_RECORD })
  })

  it('a seat of the person’s own with no company counts as a seat elsewhere, and the list and the route read one rule', () => {
    const helper = readFileSync(join(process.cwd(), 'src/app/api/access/[contextId]/rename.ts'), 'utf8')
    expect(helper).toContain('OR: [{ companyId: null }, { companyId: { not: companyId } }]')
    expect(helper).toContain('{ consultant: { isNot: null } }')
    expect(helper).toContain('{ sellContracts: { some: {} } }')
    const seatRoute = readFileSync(join(process.cwd(), 'src/app/api/access/[contextId]/route.ts'), 'utf8')
    expect(seatRoute).toContain("import { renameSeat } from './rename'")
    expect(read('src/app/api/access/route.ts')).toContain("import { knownBeyond } from './[contextId]/rename'")
  })

  it('a person whose papers, checks, visa, weeks, expenses, resume, bench listings or courses are on the record is never renamed by a company, because the name is one row every company reads', () => {
    const helper = readFileSync(join(process.cwd(), 'src/app/api/access/[contextId]/rename.ts'), 'utf8')
    for (const t of ['verifications', 'visas', 'timesheets', 'expenses', 'resumes', 'representations', 'doNotSubmit', 'enrollments', 'packetsAbout', 'documentSharesAbout']) {
      expect(helper).toContain(`{ ${t}: { some: {} } }`)
    }
    expect(helper).toContain("where: { subjectType: 'PERSON', subjectId: { in: ids } }")
  })

  it('a seat at another company that was ended still keeps the name out of this company’s hands', () => {
    const helper = readFileSync(join(process.cwd(), 'src/app/api/access/[contextId]/rename.ts'), 'utf8')
    const seatsQuery = helper.slice(helper.indexOf('prisma.context.findMany'), helper.indexOf('prisma.person.findMany'))
    expect(seatsQuery).not.toContain('revokedAt: null')
    expect(helper).toContain("if (s.revokedAt !== null && !out.has(s.personId)) out.set(s.personId, 'WORK')")
  })

  it('a rename is written with the old name beside the new one, and a refused one is logged before the reply', () => {
    const helper = readFileSync(join(process.cwd(), 'src/app/api/access/[contextId]/rename.ts'), 'utf8')
    expect(helper).toContain("action: 'PERSON_RENAMED'")
    expect(helper).toContain('from: before, to: name')
    const seatRoute = readFileSync(join(process.cwd(), 'src/app/api/access/[contextId]/route.ts'), 'utf8')
    const at = seatRoute.indexOf("if (out.kind === 'WRONG_NAME')")
    expect(at).toBeGreaterThan(-1)
    expect(seatRoute.slice(at, seatRoute.indexOf('status: 422', at))).toContain("await recordRefusal([target.personId]")
  })
})

describe('a link from Team structure lands on the row it names', () => {
  // Imported here rather than at the top so the block reads on its own.
  const focus = () => import('@/app/dashboard/access/focus')
  const page = () => readFileSync(join(__dirname, '../../src/app/dashboard/access/page.tsx'), 'utf8')

  it('reads the person and the team a link names from the address', async () => {
    const { focusFromQuery } = await focus()
    expect(focusFromQuery('?person=ctx_123')).toEqual({ person: 'ctx_123', unit: null })
    expect(focusFromQuery('?unit=u-9')).toEqual({ person: null, unit: 'u-9' })
    expect(focusFromQuery('')).toEqual({ person: null, unit: null })
  })

  it('ignores a value that is not a plain id rather than putting it into the page', async () => {
    const { focusFromQuery } = await focus()
    expect(focusFromQuery('?person=%22%3E%3Cscript%3E')).toEqual({ person: null, unit: null })
    expect(focusFromQuery(`?unit=${'a'.repeat(65)}`).unit).toBeNull()
  })

  it('gives every person row an anchor, marks the one a link named and scrolls to it once the register is drawn', async () => {
    const { personAnchor } = await focus()
    expect(personAnchor('ctx_1')).toBe('access-person-ctx_1')
    const src = page()
    expect(src.match(/id=\{personAnchor\(/g)?.length).toBe(2)
    expect(src).toMatch(/focus\.person === w\.contextId/)
    expect(src).toMatch(/focus\.person === p\.contextId/)
    expect(src).toMatch(/scrollIntoView/)
  })

  it('lands a team’s Give access link on Give access, with a sentence saying what to choose there', async () => {
    const { UNIT_LANDED_SAYS } = await focus()
    expect(UNIT_LANDED_SAYS).toMatch(/Give access/)
    expect(UNIT_LANDED_SAYS.split(/\s+/).length).toBeLessThanOrEqual(25)
    const src = page()
    expect(src).toMatch(/id=\{GIVE_ACCESS_ANCHOR\}/)
    expect(src).toMatch(/focus\.unit && <p[^>]*>\{UNIT_LANDED_SAYS\}/)
  })
})
