import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KINDS, problems } from '@/lib/contacts'
import { NO_WAY_TO_REACH, reachable } from '@/lib/contact-reach'

/**
 * The Add contact form, after an outside review of the live demo,
 * 2026-10-05: the starred fields did not say so to the browser, a row
 * could be saved that nobody could call, and the role picker was headed
 * with a question and defaulted to a label that did not match its value.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/contacts/page.tsx')
const route = read('src/app/api/contacts/route.ts')
const modal = page.slice(page.indexOf('function AddContactModal'))

describe('the Add contact form', () => {
  it('a contact with neither an email address nor a phone number is refused in a sentence', () => {
    expect(reachable({ email: '', phone: '  ' })).toBe(false)
    const p = problems({ name: 'Dana Whitfield', email: '', phone: '' })
    expect(p).toEqual([{ field: 'email', says: NO_WAY_TO_REACH }])
    expect(NO_WAY_TO_REACH).toBe('Give an email address or a phone number, so somebody can reach them. Either one is enough.')
  })

  it('a phone number alone is enough, and so is an email address alone', () => {
    expect(problems({ name: 'Dana Whitfield', phone: '(303) 555-0100' })).toEqual([])
    expect(problems({ name: 'Dana Whitfield', email: 'dana@client.example' })).toEqual([])
  })

  it('the route refuses a contact nobody can reach, in the same sentence the form uses', () => {
    // The route hands problems() the phone as well as the email, so a
    // script that skips the form is refused in the same words.
    expect(route).toMatch(/problems\(\{[\s\S]*?phone: body\?\.phone \?\? null,[\s\S]*?\}\)/)
    expect(modal).toContain('if (!email && !form.phone.trim()) p.email = NO_WAY_TO_REACH')
    expect(page).toContain("import { NO_WAY_TO_REACH } from '@/lib/contact-reach'")
  })

  it('says under the email and phone that either one is enough', () => {
    expect(modal).toContain('An email address or a phone number. Either one is enough.')
  })

  it('the name and the company they work at are marked required for the browser, and the form still explains a refusal itself', () => {
    expect(modal).toContain("{field('name', 'Name *', 'Dana Whitfield — first and last', 'text', true)}")
    expect(modal).toMatch(/<select\s+required\s+aria-required="true"\s+value=\{form\.atCompanyId\}/)
    expect(modal).toContain('required={required}')
    // A browser bubble inside a modal on a phone is a refusal nobody sees.
    expect(modal).toContain('<form onSubmit={handleSubmit} noValidate')
  })

  it('asks for their role at that firm, not what you call them about', () => {
    expect(modal).toContain('Their role at that firm</label>')
    expect(page).not.toContain('What you call them about')
  })

  it('the role it starts on reads Other, because Other is what it saves', () => {
    expect(modal).toContain("kind: 'OTHER' })")
    expect(KINDS.OTHER.label).toBe('Other')
  })
})
