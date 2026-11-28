/**
 * The free course door's lead capture: the arithmetic, with no database.
 *
 * The home page asks "What are you?" and the answer picks a track. The
 * course itself is paused; the door runs ahead of it. These sentences
 * hold the rules that do not need a route: what counts as a yes, what a
 * child's entry may carry, which junk is refused, and that the
 * unsubscribe link cannot be forged for somebody else's address.
 */
import { describe, it, expect } from 'vitest'
import {
  LEAD_TYPES,
  TRACK_FOR,
  IT_TRACK,
  CONSENT_WORDS,
  GUARDIAN_WORDS,
  checkCourseDoorAsk,
  unsubscribeToken,
  tokenMatches,
  confirmationLetter,
} from '@/lib/public-site/course-door'

const yes = { leadType: 'Worker', email: 'asha@work.example', consent: true }

describe('the course door: what are you, and where does it route', () => {
  it('the door offers exactly four answers to "What are you?"', () => {
    expect([...LEAD_TYPES]).toEqual(['Worker', 'Recruiter', 'Fresher', 'Kid'])
  })

  it('each answer routes to its track from one table', () => {
    expect(TRACK_FOR).toEqual({
      Worker: 'Non-IT',
      Recruiter: 'Entry Level',
      Fresher: 'Entry Level',
      Kid: 'Kids/student',
    })
    for (const t of LEAD_TYPES) {
      const r = checkCourseDoorAsk({ ...yes, leadType: t, guardianEmail: true })
      expect(r.ok && r.value.track).toBe(TRACK_FOR[t])
    }
  })

  it('a Worker who switches on "I work in IT" routes to IT — Upgrade and the switch is kept', () => {
    const r = checkCourseDoorAsk({ ...yes, worksInIT: true })
    expect(r.ok && r.value.track).toBe(IT_TRACK)
    expect(IT_TRACK).toBe('IT — Upgrade')
    expect(r.ok && r.value.worksInIT).toBe(true)
  })

  it('a Worker who leaves the switch off routes to Non-IT and the switch is kept as off', () => {
    const r = checkCourseDoorAsk(yes)
    expect(r.ok && r.value.track).toBe('Non-IT')
    expect(r.ok && r.value.worksInIT).toBe(false)
  })

  it('the IT switch changes nothing for a Recruiter, a Fresher or a Kid', () => {
    for (const t of ['Recruiter', 'Fresher', 'Kid'] as const) {
      const r = checkCourseDoorAsk({ ...yes, leadType: t, guardianEmail: true, worksInIT: true })
      expect(r.ok && r.value.track).toBe(TRACK_FOR[t])
      expect(r.ok && r.value.worksInIT).toBe(false)
    }
  })

  it('a track sent by the visitor is ignored, because the table decides it', () => {
    const r = checkCourseDoorAsk({ ...yes, track: 'Kids/student' })
    expect(r.ok && r.value.track).toBe('Non-IT')
  })

  it('an answer that is not one of the four is refused, naming the four', () => {
    const r = checkCourseDoorAsk({ ...yes, leadType: 'Manager' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('TYPE_NOT_KNOWN')
      for (const t of LEAD_TYPES) expect(r.says).toContain(t)
    }
  })
})

describe('the course door: no yes, no lead', () => {
  it('the yes is worded plainly, with the way out in the same sentence', () => {
    expect(CONSENT_WORDS).toBe(
      "Email me when the course opens and about Etyme's free training. I can stop anytime."
    )
  })

  it('a request with no yes is refused and says why', () => {
    const r = checkCourseDoorAsk({ leadType: 'Worker', email: 'asha@work.example' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('CONSENT_NEEDED')
      expect(r.says).toMatch(/nothing was saved/i)
    }
  })

  it('only a real yes counts: the word "true", 1 and "yes" are not a tick', () => {
    for (const consent of ['true', 1, 'yes', 'on', null, false]) {
      const r = checkCourseDoorAsk({ ...yes, consent })
      expect(r.ok).toBe(false)
    }
  })

  it('a refusal for a missing yes comes before a complaint about anything else', () => {
    const r = checkCourseDoorAsk({ leadType: 'Worker', email: 'nonsense' })
    expect(!r.ok && r.code).toBe('CONSENT_NEEDED')
  })
})

describe('the course door: a child enters through a parent or guardian', () => {
  it('a Kid entry must say the address is a parent\'s or guardian\'s', () => {
    const r = checkCourseDoorAsk({ ...yes, leadType: 'Kid' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('GUARDIAN_NEEDED')
      expect(r.says).toMatch(/parent or guardian/i)
    }
  })

  it('the words beside a Kid entry say the address is a parent\'s or guardian\'s', () => {
    expect(GUARDIAN_WORDS).toMatch(/parent or guardian/i)
    expect(GUARDIAN_WORDS).toMatch(/not a child/i)
  })

  it('a Kid entry with a child\'s name or age is refused, so nothing about a child is kept', () => {
    for (const field of ['name', 'childName', 'age', 'dateOfBirth', 'birthday', 'school', 'grade']) {
      const r = checkCourseDoorAsk({ ...yes, leadType: 'Kid', guardianEmail: true, [field]: 'Mira 9' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('NO_CHILD_DETAILS')
    }
  })

  it('a Kid entry that is complete carries the email and the type and nothing else', () => {
    const r = checkCourseDoorAsk({ ...yes, leadType: 'Kid', guardianEmail: true })
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['email', 'guardian', 'leadType', 'track', 'worksInIT'])
    expect(r.ok && r.value.guardian).toBe(true)
  })

  it('an adult entry never needs the guardian line', () => {
    expect(checkCourseDoorAsk(yes).ok).toBe(true)
  })
})

describe('the course door: junk is refused', () => {
  it('an address with no @ or no domain is refused, quoting what was typed', () => {
    for (const email of ['asha', 'asha@', 'asha@work', '@work.example', 'a b@work.example']) {
      const r = checkCourseDoorAsk({ ...yes, email })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('EMAIL_NOT_USABLE')
    }
  })

  it('an address longer than any real one is refused', () => {
    const r = checkCourseDoorAsk({ ...yes, email: `${'a'.repeat(250)}@work.example` })
    expect(r.ok).toBe(false)
  })

  it('obvious throwaway addresses are refused', () => {
    for (const email of ['test@test.com', 'a@a.aa', 'asdf@asdf.com', 'no@example.com']) {
      const r = checkCourseDoorAsk({ ...yes, email })
      expect(r.ok, email).toBe(false)
    }
  })

  it('a form field only a script can see, once filled, is refused', () => {
    const r = checkCourseDoorAsk({ ...yes, company_website: 'http://spam.example' })
    expect(!r.ok && r.code).toBe('SCRIPTED')
  })

  it('a form sent faster than anybody types is refused', () => {
    const r = checkCourseDoorAsk({ ...yes, filledInMs: 200 })
    expect(!r.ok && r.code).toBe('SCRIPTED')
  })

  it('the address is lowercased and trimmed so one person is one row', () => {
    const r = checkCourseDoorAsk({ ...yes, email: '  Asha@Work.Example ' })
    expect(r.ok && r.value.email).toBe('asha@work.example')
  })
})

describe('the course door: the unsubscribe link', () => {
  it('a link made for one address works for that address', () => {
    const t = unsubscribeToken('asha@work.example', 'a-secret')
    expect(tokenMatches('asha@work.example', t, 'a-secret')).toBe(true)
  })

  it('a link made for one address does not work for another', () => {
    const t = unsubscribeToken('asha@work.example', 'a-secret')
    expect(tokenMatches('someone@else.example', t, 'a-secret')).toBe(false)
  })

  it('a made-up or empty token is refused, and so is any token when no secret is set', () => {
    expect(tokenMatches('asha@work.example', 'abc', 'a-secret')).toBe(false)
    expect(tokenMatches('asha@work.example', '', 'a-secret')).toBe(false)
    expect(tokenMatches('asha@work.example', unsubscribeToken('asha@work.example', 'a-secret'), '')).toBe(false)
  })
})

describe('the course door: the one confirmation letter', () => {
  const letter = confirmationLetter({ leadType: 'Worker', unsubscribeUrl: 'https://etyme.example/u?x=1' })

  it('says the course is not open yet and who asked for it', () => {
    expect(letter.body).toMatch(/not open yet/i)
    expect(letter.body).toMatch(/you asked/i)
  })

  it('carries the one-step unsubscribe link and the way to stop', () => {
    expect(letter.body).toContain('https://etyme.example/u?x=1')
    expect(letter.body).toMatch(/stop/i)
  })

  it('names Etyme and its postal address, like every other letter', () => {
    expect(letter.body).toContain('Etyme Inc., 3201 Yorktown Ave, Ste. 110B, Durham, NC 27713')
  })

  it('a guardian\'s letter says it went to a parent or guardian', () => {
    const k = confirmationLetter({ leadType: 'Kid', unsubscribeUrl: 'https://etyme.example/u' })
    expect(k.body).toMatch(/parent or guardian/i)
  })

  it('promises no price, no date and no result', () => {
    expect(letter.body).not.toMatch(/\$|\bfree forever\b|guarantee|certif/i)
    expect(letter.body).not.toMatch(/\b(20\d\d|january|february|march)\b/i)
  })
})
