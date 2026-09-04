import { describe, it, expect } from 'vitest'
import {
  mayText, dueAPing, freshnessText, consentText, outcomeText, placedText,
  readReply, applyReply, PING_EVERY_DAYS, GIVE_UP_AFTER, type Person,
} from '@/lib/texts'

/**
 * A bench record says somebody is free at $78 and knows Java. That was
 * true three weeks ago. Since then they took a contract or raised their
 * rate, and nobody updated it because updating records is nobody's job.
 *
 * Every clever thing in this product sits on top of that record. If it is
 * wrong, all of it produces confident nonsense faster than a human could
 * produce it slowly.
 *
 * Three texts. Not a portal — a working consultant already has six of
 * those, and one nobody uses is worse than none because it makes you
 * believe the data is fresh.
 */

const NOW = new Date('2026-08-21T00:00:00Z')

function person(over: Partial<Person> = {}): Person {
  return {
    name: 'Ravi Patel',
    mobile: '+13035550142',
    textsOffAt: null,
    confirmedAt: new Date('2026-08-01'),
    askedAt: null,
    unanswered: 0,
    onBench: true,
    ...over,
  }
}

describe('may we text them at all', () => {
  it('yes, normally', () => {
    expect(mayText(person()).ok).toBe(true)
  })

  it('never again once they have said stop', () => {
    const v = mayText(person({ textsOffAt: new Date('2026-01-01') }))
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/asked us to stop/)
  })

  it('says email instead when there is no mobile, which is not a failure', () => {
    expect(mayText(person({ mobile: null })).reason).toMatch(/Email instead/)
  })
})

describe('who is due a check-in', () => {
  it('somebody on the bench who has not been asked for a fortnight', () => {
    expect(dueAPing(person({ confirmedAt: new Date('2026-08-01') }), NOW).ok).toBe(true)
  })

  it('not somebody asked three days ago', () => {
    const v = dueAPing(person({ askedAt: new Date('2026-08-18') }), NOW)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe(`Asked 3 days ago. Next one in ${PING_EVERY_DAYS - 3}.`)
  })

  it('not somebody who is working — that is how you teach people to ignore you', () => {
    const v = dueAPing(person({ onBench: false }), NOW)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('Working. Nothing to ask.')
  })

  it('stops after two silences, and says the silence is itself an answer', () => {
    // A third ask is not going to work. The record goes down the ranking
    // rather than being deleted or believed.
    const v = dueAPing(person({ unanswered: GIVE_UP_AFTER }), NOW)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/marked unconfirmed and ranks below people we have heard from/)
  })
})

describe('the freshness ping', () => {
  it('asks one question and offers three replies, with no link to open', () => {
    // A message that needs a browser is a message answered at the weekend
    // or never.
    const t = freshnessText({ personName: 'Ravi Patel', vendorName: 'Cloudepa', rateCents: 7800 })
    expect(t).toBe(
      'Hi Ravi — Cloudepa here. Still looking for your next contract? Still around $78/hr?\n' +
        "Reply 1 yes, all the same · 2 something's changed · 3 stop texting me"
    )
  })

  it('goes out in the vendor’s name, never ours', () => {
    // The moment a vendor suspects disintermediation, benches stop being
    // uploaded, and with no benches there is nothing to score.
    const t = freshnessText({ personName: 'Ravi Patel', vendorName: 'Cloudepa', rateCents: null })
    expect(t).toMatch(/Cloudepa here/)
    expect(t).not.toMatch(/Etyme/i)
  })

  it('leaves the rate out when we do not have one, rather than asking about nothing', () => {
    expect(freshnessText({ personName: 'Ravi', vendorName: 'Cloudepa', rateCents: null }))
      .not.toMatch(/\$/)
  })
})

describe('the consent ask, before every submission', () => {
  it('says enough to answer without a phone call', () => {
    const t = consentText({
      personName: 'Ravi Patel',
      vendorName: 'Cloudepa',
      clientLabel: 'a large bank',
      title: 'SAP FICO Consultant',
      location: 'Dallas',
      rateCents: 8000,
      startsOn: new Date('2026-03-03'),
    })
    expect(t).toBe(
      'Dallas · SAP FICO Consultant · $80/hr · starts 2026-03-03 · a large bank.\n' +
        'OK for Cloudepa to submit you? Reply YES or NO'
    )
  })

  it('works on a blind role, where the client has no name to give', () => {
    const t = consentText({
      personName: 'Ravi',
      vendorName: 'Cloudepa',
      clientLabel: 'this client',
      title: 'Java Developer',
      location: null,
      rateCents: null,
      startsOn: null,
    })
    expect(t).toBe('Java Developer · this client.\nOK for Cloudepa to submit you? Reply YES or NO')
  })
})

describe('the outcome notice, always, even when it is bad', () => {
  it('says what happened without blaming them', () => {
    // "They went with someone at a lower rate", not "you were too
    // expensive" — and never a code.
    const t = outcomeText({
      personName: 'Ravi',
      vendorName: 'Cloudepa',
      title: 'Java role',
      location: 'Dallas',
      reason: 'RATE',
    })
    expect(t).toMatch(/they went with someone at a lower rate/)
    expect(t).not.toMatch(/RATE/)
  })

  it('says the profile stays active, because that is the useful part', () => {
    const t = outcomeText({
      personName: 'Ravi', vendorName: 'Cloudepa', title: 'Java role',
      location: null, reason: 'INTERVIEW',
    })
    expect(t).toMatch(/Your profile stays active with Cloudepa/)
  })

  it('is honest when the client simply never came back', () => {
    const t = outcomeText({
      personName: 'Ravi', vendorName: 'Cloudepa', title: 'Java role',
      location: null, reason: 'NO_REPLY',
    })
    expect(t).toMatch(/we have not heard back and are treating it as closed/)
  })

  it('has something to say when they got the job', () => {
    // A product that only texts people bad news is one people learn to
    // dread.
    const t = placedText({
      personName: 'Ravi', vendorName: 'Cloudepa', title: 'Java role', location: 'Dallas',
    })
    expect(t).toMatch(/You got the Dallas Java role/)
    expect(t).toMatch(/Congratulations/)
  })
})

describe('reading what comes back', () => {
  it('understands "1"', () => {
    expect(readReply('1', 'FRESHNESS')).toBe('SAME')
  })

  it('understands a digit with words after it, which is how people actually reply', () => {
    // Nobody sends a bare "1". Matching only on equality read "1 yes still
    // looking thanks" as unintelligible, so the loop asked again a
    // fortnight later and the bench never got any fresher — the exact
    // failure the whole thing exists to prevent.
    expect(readReply('1 yes still looking thanks', 'FRESHNESS')).toBe('SAME')
    expect(readReply('2 - just started somewhere', 'FRESHNESS')).toBe('CHANGED')
    expect(readReply('3 please', 'FRESHNESS')).toBe('STOP')
    expect(readReply('1 go ahead', 'CONSENT')).toBe('YES')
    expect(readReply('2 not this one', 'CONSENT')).toBe('NO')
  })

  it('does not read a rate as a menu choice', () => {
    // "1 yes" is a menu choice. "150/hr now" is a number, and reading its
    // first digit as "yes, all the same" would confirm a stale rate.
    expect(readReply('150/hr now', 'FRESHNESS')).toBe('UNCLEAR')
  })

  it('understands the way people actually reply', () => {
    expect(readReply('yes still looking thanks', 'FRESHNESS')).toBe('SAME')
    expect(readReply('2 - just started a contract', 'FRESHNESS')).toBe('CHANGED')
    expect(readReply('my rate has changed', 'FRESHNESS')).toBe('CHANGED')
  })

  it('takes stop from anywhere, whatever was asked', () => {
    expect(readReply('STOP', 'FRESHNESS')).toBe('STOP')
    expect(readReply('3', 'FRESHNESS')).toBe('STOP')
    expect(readReply('please remove me from this list', 'CONSENT')).toBe('STOP')
  })

  it('reads yes and no on a consent ask', () => {
    expect(readReply('YES', 'CONSENT')).toBe('YES')
    expect(readReply('yep go ahead', 'CONSENT')).toBe('YES')
    expect(readReply('No', 'CONSENT')).toBe('NO')
    expect(readReply("don't, im not interested", 'CONSENT')).toBe('NO')
  })

  it('treats "someone already put me forward there" as a no', () => {
    // The duplicate this message exists to catch, and the cheapest
    // deduplication anybody will ever build.
    expect(readReply('no someone else has me for that one', 'CONSENT')).toBe('NO')
    expect(readReply('already been submitted for this', 'CONSENT')).toBe('NO')
  })

  it('says it cannot tell rather than guessing', () => {
    // Guessing NO loses a placement. Guessing YES submits somebody who
    // said no. Neither is worth avoiding a person reading one message.
    expect(readReply('call me', 'CONSENT')).toBe('UNCLEAR')
    expect(readReply('hmm', 'FRESHNESS')).toBe('UNCLEAR')
  })
})

describe('what a reply does to the record', () => {
  it('re-stamps the record as confirmed today, which is the whole point', () => {
    const a = applyReply('SAME', NOW)
    expect(a.confirmedAt).toBe(NOW)
    expect(a.unanswered).toBe(0)
  })

  it('does not guess the new numbers when they say something has changed', () => {
    // A rate somebody has just said is wrong is worse than a rate nobody
    // has confirmed.
    const a = applyReply('CHANGED', NOW)
    expect(a.confirmedAt).toBeNull()
    expect(a.sendLink).toBe(true)
    expect(a.says).toMatch(/No password needed/)
  })

  it('turns texts off permanently and says email instead', () => {
    const a = applyReply('STOP', NOW)
    expect(a.textsOffAt).toBe(NOW)
    expect(a.says).toMatch(/no more texts/)
  })

  it('counts a no as a confirmation, because they just told us they are there', () => {
    // Saying "no, not that one" is a live person answering. Treating it as
    // silence would push a responsive consultant down the rankings.
    expect(applyReply('NO', NOW).confirmedAt).toBe(NOW)
  })

  it('leaves an unclear reply for a person', () => {
    const a = applyReply('UNCLEAR', NOW)
    expect(a.confirmedAt).toBeNull()
    expect(a.says).toBe('Somebody will read this one.')
  })
})
