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

const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/consultants/page.tsx'), 'utf8')

describe('A refusal is always visible, never a button that does nothing', () => {

  it('the form does its own checking rather than leaving it to the browser', () => {
    expect(PAGE).toContain('noValidate')
    expect(PAGE).toContain('function problems()')
  })

  it('no required attribute silently blocks a submit that would explain itself', () => {
    // `required` inside a modal on a phone is a refusal with nowhere to
    // put its message.
    const inModal = PAGE.slice(PAGE.indexOf('function AddConsultantModal'), PAGE.indexOf('export default'))
    expect(inModal).not.toMatch(/\n\s+required\n/)
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

  it('marks the field itself, for anybody who cannot see the colour', () => {
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
