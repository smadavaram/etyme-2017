import { describe, it, expect } from 'vitest'
import {
  readCv, readName, readHeadline, readSkills, readLocation, readYears,
  readPhone, cvSentence,
} from '@/lib/cv-reader'

/**
 * A supplier signs in because a client sent them a role, and is then
 * asked to build a bench before they can answer it — which is exactly
 * the friction the invitation was designed to skip.
 *
 * Two minutes after arriving, a recruiter has one CV open in another
 * window and wants to send it. These tests are about that paste.
 */

const CV = `Rohan Menon
Senior Java Developer
Dallas, TX · rohan.menon@example.com · (214) 555-0142

PROFESSIONAL SUMMARY
Senior engineer with 9 years of experience building payment systems.
Spring Boot microservices, 2018–present. Migrated 40 services to AWS EKS.

SKILLS
Java, Spring Boot, AWS, Kafka, PostgreSQL, Docker
`

describe('reading a pasted CV', () => {
  it('takes the name off the top, where CVs put it', () => {
    expect(readCv(CV).name).toBe('Rohan Menon')
  })

  it('takes the line under the name as what they do', () => {
    expect(readCv(CV).headline).toBe('Senior Java Developer')
  })

  it('finds the address and the phone number', () => {
    const cv = readCv(CV)
    expect(cv.email).toBe('rohan.menon@example.com')
    expect(cv.phone).toBe('(214) 555-0142')
  })

  it('finds where they are', () => {
    expect(readCv(CV).location).toBe('Dallas, TX')
  })

  it('reads years of experience where the CV says so plainly', () => {
    expect(readCv(CV).years).toBe(9)
  })

  it('names the skills a client actually asks for', () => {
    expect(readCv(CV).skills).toEqual(
      expect.arrayContaining(['Java', 'Spring Boot', 'AWS', 'Kafka', 'PostgreSQL', 'Docker'])
    )
  })

  it('keeps the CV whole, so a better reader can be run over it later', () => {
    expect(readCv(CV).text).toContain('Migrated 40 services to AWS EKS')
  })
})

describe('what it refuses to guess', () => {
  it('never reads a work authorisation out of a CV', () => {
    // "Visa" in a CV is as likely to be a payment card as a permit, and
    // a wrong permit is how a placement collapses in week two.
    const cv = readCv(CV + '\nVisa status: current\n')
    expect(cv.unknowns).toContain('Work authorisation is not read from a CV. Say what they hold.')
  })

  it('says plainly when it could not find a name', () => {
    const cv = readCv('SKILLS\nJava, AWS\n')
    expect(cv.name).toBeNull()
    expect(cv.unknowns).toContain('Could not find a name. Type it in.')
  })

  it('says plainly when there is no address', () => {
    expect(readCv('Rohan Menon\nSenior Java Developer\n').unknowns).toContain(
      'No email address in the CV.'
    )
  })
})

describe('finding the name', () => {
  it('skips a Curriculum Vitae heading', () => {
    expect(readName(['CURRICULUM VITAE', 'Anita Desai', 'SAP FICO Lead'], null)).toBe('Anita Desai')
  })

  it('does not mistake the job title for the person', () => {
    expect(readName(['Senior SAP Consultant', 'Anita Desai'], null)).toBe('Anita Desai')
  })

  it('does not mistake a contact line for the person', () => {
    expect(readName(['anita@x.com', 'Anita Desai'], 'anita@x.com')).toBe('Anita Desai')
  })

  it('falls back to the address when the CV starts with prose', () => {
    // Last resort, and flagged as one — better than an empty field the
    // recruiter has to notice is empty.
    expect(readName(['A dedicated professional with...'], 'anita.desai@x.com')).toBe('Anita Desai')
  })

  it('will not invent a name from a single-word address', () => {
    expect(readName(['A dedicated professional with...'], 'careers@x.com')).toBeNull()
  })
})

describe('finding the skills', () => {
  it('does not fire Go on the word Google', () => {
    expect(readSkills('Worked at Google on search.')).not.toContain('Go')
  })

  it('does not fire React on the word reaction', () => {
    expect(readSkills('Measured the reaction time.')).not.toContain('React')
  })

  it('reads S/4HANA, slash and all', () => {
    expect(readSkills('Three S/4HANA rollouts')).toContain('S/4HANA')
  })

  it('reads .NET, which starts with punctuation', () => {
    expect(readSkills('Ten years of .NET')).toContain('.NET')
  })

  it('lists two CVs claiming the same things in the same order', () => {
    // Otherwise the same bench reads differently depending on how the CV
    // was typed, and a recruiter comparing two of them cannot.
    expect(readSkills('AWS then Java')).toEqual(readSkills('Java then AWS'))
  })
})

describe('finding the place', () => {
  it('reads a city and a state', () => {
    expect(readLocation(['Anita Desai', 'Denver, CO · anita@x.com'])).toBe('Denver, CO')
  })

  it('reads remote as a place, because to a client it is one', () => {
    expect(readLocation(['Anita Desai', 'Remote'])).toBe('Remote')
  })
})

describe('finding the years', () => {
  it('reads it written before the word experience', () => {
    expect(readYears('12 years of experience in SAP')).toBe(12)
  })

  it('reads it written after', () => {
    expect(readYears('Experience: 7 years')).toBe(7)
  })

  it('returns nothing rather than a guess', () => {
    expect(readYears('Worked on many projects')).toBeNull()
  })
})

describe('finding the phone number', () => {
  it('reads the shapes people actually type', () => {
    expect(readPhone('call me on (214) 555-0142')).toBe('(214) 555-0142')
    expect(readPhone('+1 303 555 9921')).toBe('+1 303 555 9921')
    expect(readPhone('303.555.9921')).toBe('303.555.9921')
  })
})

describe('the sentence above the reading', () => {
  it('says who and what', () => {
    expect(cvSentence(readCv(CV))).toMatch(/^Rohan Menon — Java, Spring Boot, AWS and \d more\.$/)
  })

  it('names what is still missing, because that is the only part to act on', () => {
    expect(cvSentence(readCv('Rohan Menon\nSenior Java Developer\nJava, AWS'))).toMatch(
      /Still needs an email address\.$/
    )
  })

  it('says nothing clever about an empty box', () => {
    expect(cvSentence(readCv(''))).toBe('Paste a CV and it will fill this in.')
  })
})
