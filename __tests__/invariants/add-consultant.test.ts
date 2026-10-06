/**
 * Adding a consultant, and the two bugs a real person hit on a phone.
 *
 * The button did nothing and said nothing. `type="email" required` looks
 * like free validation and is not: the browser refuses to submit, the
 * submit handler never runs, and the form's own error banner never
 * fires. Inside a modal on a phone the native bubble has nowhere to
 * appear, so a refusal is completely invisible.
 *
 * Underneath that was the cause of the mistake itself. "Full name" and
 * "Email" sat side by side in a two-column grid with no mobile
 * breakpoint, so on a phone they read as first name and last name — and
 * a surname went into the email field.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addSkillTags, savingSays, ADD_TIER_OPTION, TIER_WORD } from '@/lib/bench-filter'

const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/consultants/page.tsx'), 'utf8')

describe('A refusal is always visible, never a button that does nothing', () => {

  it('the form does its own checking rather than leaving it to the browser', () => {
    expect(PAGE).toContain('noValidate')
    expect(PAGE).toContain('function problems()')
  })

  it('full name and email are marked required, and the form still explains a refusal itself because noValidate stops the browser blocking silently', () => {
    // `required` alone inside a modal on a phone is a refusal with nowhere
    // to put its message. With noValidate on the form the browser does not
    // block the submit, so problems() runs and the sentence shows, while a
    // screen reader still hears the field is required (outside review,
    // 2026-10-05).
    const inModal = PAGE.slice(PAGE.indexOf('function AddConsultantModal'), PAGE.indexOf('// ── Consultant Detail Drawer'))
    expect(inModal).toContain('<form onSubmit={handleSubmit} noValidate')
    expect(inModal.match(/\n\s+required\n/g)?.length).toBe(2)
    const name = inModal.slice(inModal.indexOf('Full name *'), inModal.indexOf('Email *'))
    const email = inModal.slice(inModal.indexOf('Email *'), inModal.indexOf('>Headline<'))
    expect(name).toMatch(/\n\s+required\n/)
    expect(email).toMatch(/\n\s+required\n/)
  })

  it('the submit handler runs on a bad email, so something is shown', () => {
    const handler = PAGE.slice(PAGE.indexOf('async function handleSubmit'), PAGE.indexOf('return ('))
    expect(handler).toContain('const found = problems()')
    expect(handler).toContain('setFieldErrors(found)')
  })

  it('quotes back what was typed, rather than saying "invalid email"', () => {
    // "Invalid email" leaves somebody staring at a field they have
    // already read twice.
    expect(PAGE).toContain('is not an email address')
    expect(PAGE).toContain('It needs an @ and a domain')
  })

  it('shows the message beside the field as well as at the top', () => {
    expect(PAGE).toContain('fieldErrors.email &&')
    expect(PAGE).toContain('fieldErrors.name &&')
  })

  it('marks the field itself, for anybody who cannot see the color', () => {
    expect(PAGE).toContain('aria-invalid')
  })

  it('shows the server’s refusal against the field the server named', () => {
    expect(PAGE).toContain('body.error?.field')
  })
})

describe('The layout does not invite the mistake in the first place', () => {

  it('stacks name and email on a phone', () => {
    // Side by side on a narrow screen they read as first and last name.
    expect(PAGE).not.toContain('grid grid-cols-2 gap-4')
    expect(PAGE).toContain('grid-cols-1 sm:grid-cols-2')
  })

  it('the name placeholder says it wants both names', () => {
    expect(PAGE).toContain('first and last')
  })
})

describe('The add form says what is true before anybody presses the button', () => {
  const MODAL = PAGE.slice(PAGE.indexOf('function AddConsultantModal'), PAGE.indexOf('// ── Consultant Detail Drawer'))

  it('a new consultant is still shown to partners by default, as the founder decided', () => {
    expect(MODAL).toContain("tier: 'MARKETING' as 'MARKETING' | 'RETAINED'")
  })

  it('the default choice says partners see them only once they say yes', () => {
    expect(ADD_TIER_OPTION.MARKETING).toBe('Shown to our partners once they say yes')
    expect(MODAL).toContain('{ADD_TIER_OPTION.MARKETING}')
    expect(MODAL).toContain('{ADD_TIER_OPTION.RETAINED}')
  })

  it('the bench keeps its short words, because a listing there shows its answer beside it', () => {
    expect(TIER_WORD.MARKETING).toBe('Shown to our partners')
    expect(ADD_TIER_OPTION.RETAINED).toBe(TIER_WORD.RETAINED)
  })

  it('the sentence right above the button names the person who will be emailed', () => {
    expect(savingSays('Jane Smith')).toBe(
      'Saving emails Jane Smith to ask if they will join your bench. Nobody outside your firm sees them, and nobody puts them forward, until they say yes.'
    )
    const sentence = MODAL.indexOf('{savingSays(form.name)}')
    const buttons = MODAL.indexOf('<button type="submit"')
    expect(sentence).toBeGreaterThan(-1)
    expect(sentence).toBeLessThan(buttons)
    // Nothing else sits between the sentence and the buttons.
    expect(MODAL.slice(sentence, buttons)).not.toContain('<p')
  })

  it('before a name is typed the sentence still reads as English', () => {
    expect(savingSays('  ')).toMatch(/^Saving emails this person to ask/)
  })

  it('there is one button, and the old small print after the rates is gone', () => {
    expect(MODAL.match(/type="submit"/g)?.length).toBe(1)
    expect(MODAL).not.toContain('Adding them also emails them')
  })
})

describe('Skills are entered as tags and sent as the same list', () => {
  it('Enter or a comma ends a skill', () => {
    expect(addSkillTags([], 'ICU nursing')).toEqual(['ICU nursing'])
    expect(addSkillTags(['ICU nursing'], 'GMP validation,')).toEqual(['ICU nursing', 'GMP validation'])
  })

  it('a pasted list with commas becomes one tag per skill', () => {
    expect(addSkillTags([], 'Telemetry, ACLS ,  , Med-surg')).toEqual(['Telemetry', 'ACLS', 'Med-surg'])
  })

  it('a skill already there is not added twice, whatever its case, and the first spelling stays', () => {
    expect(addSkillTags(['GMP Validation'], 'gmp validation, CSV')).toEqual(['GMP Validation', 'CSV'])
  })

  it('blank typing adds nothing', () => {
    expect(addSkillTags(['ACLS'], '   ')).toEqual(['ACLS'])
  })

  it('the form submits the tags as an array, including a skill typed but not yet ended', () => {
    expect(MODAL_SRC()).toContain('skills: addSkillTags(form.skills, form.skillDraft)')
    expect(MODAL_SRC()).not.toContain("form.skills.split(',')")
  })

  it('each tag has a remove button that names the skill', () => {
    expect(MODAL_SRC()).toContain('aria-label={`Remove ${skill}`}')
  })

  it('Enter in the skills field ends a skill and does not save the form', () => {
    const field = MODAL_SRC().slice(MODAL_SRC().indexOf('id="add-skills"'))
    expect(field).toContain("if (e.key === 'Enter') {")
    expect(field).toContain('e.preventDefault()')
  })
})

describe('Location has no country, because the profile has nowhere to keep one', () => {
  it('the form asks no country it would throw away', () => {
    // ConsultantProfile carries location and no country column. A field
    // whose answer is thrown away is the thing CLAUDE.md forbids; the
    // column is a schema request for the architect.
    expect(MODAL_SRC()).not.toMatch(/>Country</)
  })
})

function MODAL_SRC() {
  return PAGE.slice(PAGE.indexOf('function AddConsultantModal'), PAGE.indexOf('// ── Consultant Detail Drawer'))
}
