import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CLIENT_CANDIDATE_ORDER, FILTER_WORD, filterOrderFor, openingFilter, NETWORK_FILTERS } from '@/lib/network-filters'
import { peopleListWords, personWord } from '@/app/dashboard/people/list-words'

/**
 * The founder, 2026-11-03: "People = candidates", and "Contracts, not
 * Contractors". A client's Candidates is its memory of people: everybody
 * a supplier put in front of it, the ones it starred, the people who
 * worked here, each with "Ask for them". The people placed today are its
 * Contracts.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/people/page.tsx')
const person = read('src/app/dashboard/people/[id]/page.tsx')

describe('a client’s Candidates page is its memory of people', () => {
  it('at a client the list is headed Candidates, with one line saying it is the people this company has met and can ask for again', () => {
    const w = peopleListWords('CLIENT')
    expect(w.title).toBe('Candidates')
    expect(w.subtitle).toContain('everybody a supplier put in front of you')
    expect(w.subtitle).toContain('the ones you starred')
    expect(w.subtitle).toContain('the people who worked here')
    expect(w.subtitle).toContain('Ask for any of them again')
    const all = `${w.title} ${w.subtitle} ${w.loading} ${w.refused}`
    expect(all).not.toMatch(/Contractors|\bPeople\b/)
    expect(all).not.toMatch(/\bdesk\b|program office/i)
  })

  it('a firm reading the same page keeps the words it had', () => {
    expect(peopleListWords('FIRM').title).toBe('Contractors')
  })

  it('the page draws the heading from the reader, never a fixed "Contractors"', () => {
    expect(page).toContain('title={words.title}')
    expect(page).not.toContain('title="Contractors"')
    expect(page).toContain("session.company && session.company.kind !== 'CLIENT' && !session.seat ? 'FIRM' : 'CLIENT'")
  })

  it('a client’s filters go Favorites, Recent engagement, Everyone, On site now, then Blocked', () => {
    const words = CLIENT_CANDIDATE_ORDER.filter((f) => f !== 'PENDING').map((f) => FILTER_WORD[f])
    expect(words).toEqual(['Favorites', 'Recent engagement', 'Everyone', 'On site now', 'Blocked'])
    expect(filterOrderFor('CLIENT')).toBe(CLIENT_CANDIDATE_ORDER)
    expect(filterOrderFor('FIRM')).toBe(NETWORK_FILTERS)
  })

  it('the page opens on Favorites where anybody is starred, as Northbend opens on Helena Marsh', () => {
    expect(openingFilter(CLIENT_CANDIDATE_ORDER, { FAVORITES: 1, RECENT: 3, ALL: 9, ON_SITE: 4, BLOCKED: 1 })).toBe('FAVORITES')
  })

  it('with nobody starred it opens on Recent engagement, and with nobody recent on Everyone', () => {
    expect(openingFilter(CLIENT_CANDIDATE_ORDER, { FAVORITES: 0, RECENT: 2, ALL: 5, ON_SITE: 0, BLOCKED: 0 })).toBe('RECENT')
    expect(openingFilter(CLIENT_CANDIDATE_ORDER, { FAVORITES: 0, RECENT: 0, ALL: 5, ON_SITE: 0, BLOCKED: 0 })).toBe('ALL')
  })

  it('the page never opens on Blocked, even where the only rows are blocked, and an empty list opens on Everyone', () => {
    expect(openingFilter(CLIENT_CANDIDATE_ORDER, { FAVORITES: 0, RECENT: 0, ALL: 0, ON_SITE: 0, BLOCKED: 2 })).toBe('ALL')
    expect(openingFilter(CLIENT_CANDIDATE_ORDER, {})).toBe('ALL')
  })

  it('somebody the client asked for itself and nobody has put forward yet is opened on where that is all there is', () => {
    expect(openingFilter(CLIENT_CANDIDATE_ORDER, { FAVORITES: 0, RECENT: 0, ALL: 0, ON_SITE: 0, PENDING: 1, BLOCKED: 0 })).toBe('PENDING')
  })

  it('the opening filter is decided once after the first read, and a filter named in the address or pressed wins', () => {
    expect(page).toContain('setFilter(openingFilter(order, counts))')
    expect(page).toContain("if (asked && (NETWORK_FILTERS as readonly string[]).includes(asked)) choose(asked as NetworkFilter)")
    expect(page).toContain('onFilter={choose}')
  })

  it('a person’s page goes back to the list under its own menu word, and says Candidate under the name unless they are on site', () => {
    expect(person).toContain("back={section ? { href: '/dashboard/people', label: section } : undefined}")
    expect(person).not.toContain("label: 'Contractors'")
    expect(personWord(true)).toBe('Contractor')
    expect(personWord(false)).toBe('Candidate')
  })

  it('a sentence pointing a client at somebody it asked for names Candidates, not Contractors', () => {
    expect(read('src/lib/contractor-invite.ts')).toContain('Read where it got to on Candidates, under Pending.')
    expect(read('src/app/api/contractor-welcome/[token]/route.ts')).toContain('open Candidates, under Pending.')
  })
})
