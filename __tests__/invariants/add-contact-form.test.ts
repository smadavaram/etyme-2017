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
    expect(modal).toContain('if (!email && !f.phone.trim()) p.email = NO_WAY_TO_REACH')
    expect(page).toContain("import { NO_WAY_TO_REACH } from '@/lib/contact-reach'")
  })

  it('says under the email and phone that either one is enough', () => {
    expect(modal).toContain('An email address or a phone number. Either one is enough.')
  })

  it('the name and the company they work for are marked required for the browser, and the form still explains a refusal itself', () => {
    expect(modal).toContain("{field('name', 'Name *', 'First and last name', 'text', true)}")
    expect(modal).toMatch(/<select\s+id="add-contact-works-for"\s+required\s+aria-required="true"\s+value=\{form\.atCompanyId\}/)
    expect(modal).toContain('required={required}')
    // A browser bubble inside a modal on a phone is a refusal nobody sees.
    expect(modal).toContain('<form onSubmit={handleSubmit} noValidate')
  })

  it('asks for their role at that firm, not what you call them about, and says it is optional', () => {
    expect(modal).toContain('Their role at that firm (optional)</label>')
    expect(modal).toContain("'Not sure? Leave it on Other.'")
    expect(page).not.toContain('What you call them about')
  })

  it('the role it starts on reads Other, because Other is what it saves', () => {
    expect(modal).toContain("kind: 'OTHER', newCompanyName: '' })")
    expect(KINDS.OTHER.label).toBe('Other')
  })

  it('every field the route refuses without, the form has a box for, so the screen can always satisfy its route', () => {
    const post = route.slice(route.indexOf('export async function POST'))
    const refusedFields = new Set([...post.matchAll(/field: '([a-zA-Z]+)'/g)].map((m) => m[1]))
    // problems() in lib/contacts answers for name, email and kind.
    for (const f of ['name', 'email', 'kind']) refusedFields.add(f)
    const formKeys = new Set([...(modal.match(/useState\(\{ ([^}]*) \}\)/)![1].matchAll(/([a-zA-Z]+):/g))].map((m) => m[1]))
    for (const f of refusedFields) expect(formKeys, `the route refuses without ${f}`).toContain(f)
  })

  it('marks only the name and the company they work for as required, and a new company’s name only while one is being added, never the role', () => {
    const required = [...modal.matchAll(/<label[^>]*>([^<]*\*)<\/label>/g)].map((m) => m[1])
    expect(modal).toContain("'Name *'")
    expect(required).toEqual(['Works for *', 'New company’s name *'])
    expect(modal).toContain('{addingCompany && (')
    expect(modal).not.toMatch(/Their role at that firm \*/)
  })

  it('a refusal that says the company is not on your list carries a link to Add a company, and the form draws it', () => {
    expect(route).toContain("href: ADD_A_COMPANY_HREF, hrefLabel: 'Add a company'")
    expect(modal).toContain('if (body.error?.href && mayOpen(body.error.href, permissions))')
  })
})
