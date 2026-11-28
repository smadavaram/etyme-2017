/**
 * The free training door's page (Etyme's own door, Pax's ruling of
 * 2026-11-28): the tiles, the four answers, and what the page may say.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  TILES, DOOR_ANSWERS, DOOR_WORDS, CONSENT_LINE, GUARDIAN_LINE, IT_TRACK_NAME, COURSE_DOOR_PATH,
} from '@/lib/public-site/course-door-page'
import { TRACK_FOR, IT_TRACK, CONSENT_WORDS, GUARDIAN_WORDS, LEAD_TYPES } from '@/lib/public-site/course-door'
import { PUBLIC_PAGES, NOT_MARKETING } from '@/lib/public-site/pages'

const ROOT = process.cwd()
const DIR = 'src/app/(site)/ai-from-zero'
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const doorFiles = ['page.tsx', 'door-form.tsx', 'icons.tsx', 'door.module.css'].map((f) => `${DIR}/${f}`)

describe('the free training door: the tiles', () => {
  it('the grid has ten tiles, in the order the owner named them', () => {
    expect(TILES.map((t) => t.name)).toEqual([
      'LLMs', 'Agents', 'MCP', 'RAG + Data', 'Training', 'Compute', 'Cloud', 'Cost', 'Performance', 'Deploy',
    ])
  })

  it('only the Deploy tile has a sub-line, and it reads "Docker · Kubernetes"', () => {
    expect(TILES.filter((t) => t.sub).map((t) => [t.name, t.sub])).toEqual([['Deploy', 'Docker · Kubernetes']])
  })

  it('Docker and Kubernetes are named nowhere else on the door', () => {
    for (const f of doorFiles) expect(read(f), f).not.toMatch(/Docker|Kubernetes/)
    expect(DOOR_WORDS.gridHeading + TILES.map((t) => t.name + t.gloss).join(' ')).not.toMatch(/Docker|Kubernetes/)
  })

  it('every tile has its own icon, drawn in the icons file', () => {
    const icons = read(`${DIR}/icons.tsx`)
    for (const t of TILES) expect(icons, t.key).toContain(`${t.key}:`)
    expect(new Set(TILES.map((t) => t.key)).size).toBe(TILES.length)
  })

  it.todo('every tile names at least one lesson from the architect’s content map, and no tile is invented (waits: the map could not be read from Drive)')
})

describe('the free training door: what are you', () => {
  it('the four answers are Worker, Recruiter, Fresher and Kid, as the lead route takes them', () => {
    expect(DOOR_ANSWERS.map((a) => a.label)).toEqual(['Worker', 'Recruiter', 'Fresher', 'Kid'])
    expect(new Set(DOOR_ANSWERS.map((a) => a.label))).toEqual(new Set(LEAD_TYPES))
  })

  it('each answer shows the same track the lead route will give it', () => {
    for (const a of DOOR_ANSWERS) expect(a.track).toBe(TRACK_FOR[a.label])
    expect(IT_TRACK_NAME).toBe(IT_TRACK)
  })

  it('the words beside the tick are the words the lead route checks', () => {
    expect(CONSENT_LINE).toBe(CONSENT_WORDS)
    expect(GUARDIAN_LINE).toBe(GUARDIAN_WORDS)
  })

  it('a visible "I work in IT" switch is offered to a Worker and to nobody else', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(DOOR_WORDS.itSwitch).toBe('I work in IT')
    expect(form).toMatch(/who === 'Worker' && \(/)
    expect(form).toContain("worksInIT: who === 'Worker' && inIT")
  })

  it('a Kid is asked for a parent or guardian’s address and nothing about the child', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(form).toContain('guardianEmail: who === \'Kid\'')
    expect(form).toContain('GUARDIAN_LINE')
    expect(form).not.toMatch(/name="(name|age|school|dob)"/i)
  })
})

describe('the free training door: lead capture and the paused course', () => {
  it('the form sends the tick only as the visitor left it, to the existing leads route', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(form).toContain('consent: yes')
    expect(form).toContain('COURSE_DOOR_ENDPOINT')
    expect(read('src/lib/public-site/course-door-page.ts')).toContain("'/api/market/leads'")
  })

  it('the page says plainly the course is not open and no date is set', () => {
    expect(DOOR_WORDS.paused).toBe('The course is not open yet. We have not set a date for it.')
    expect(DOOR_WORDS.free).toBe('Free')
  })

  it('after capture the page says an email comes only where email can leave, and links to no course', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(form).toContain('mailCanLeave')
    expect(form).toContain('No email can be sent from here yet')
    expect(form).not.toMatch(/href=|router\.push|\/learn/)
    expect(read(`${DIR}/page.tsx`)).toContain('mailLeaves()')
  })

  it('the form, a browser file, imports no server-only file', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(form.startsWith("'use client'")).toBe(true)
    expect(form).not.toMatch(/public-site\/course-door'/)
    expect(form).not.toMatch(/from 'crypto'|@\/lib\/db/)
  })

  it('a script’s hidden box and the time on screen travel with the entry', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(form).toContain('company_website')
    expect(form).toContain('filledInMs')
  })
})

describe('the free training door: the page itself', () => {
  it('the page is on the list of public pages held to their own test, with its reason, and its file exists', () => {
    const e = NOT_MARKETING.find((x) => x.prefix === `${DIR}/`)
    expect(e?.why).toContain('free training door')
    expect(existsSync(join(ROOT, DIR, 'page.tsx'))).toBe(true)
  })

  it('the door does not take /start, which is still the signed-in setup page', () => {
    expect(COURSE_DOOR_PATH).not.toBe('/start')
    expect(existsSync(join(ROOT, 'src/app/(auth)/start/page.tsx'))).toBe(true)
    expect(PUBLIC_PAGES.some((x) => x.route === '/start')).toBe(false)
  })

  it('the page says nothing about Tapin selling training, and names no price', () => {
    for (const f of doorFiles.slice(0, 2)) expect(read(f), f).not.toMatch(/Tapin|\$\s?\d|per month/i)
  })

  it('the look is light and warm with Sora and Manrope, and motion stops for a visitor who asks', () => {
    const css = read(`${DIR}/door.module.css`)
    expect(css).toContain('Sora')
    expect(css).toContain('Manrope')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toMatch(/--warm: #fbf7ef/)
    expect(css).not.toMatch(/background:\s*#0|#000\b/)
  })
})
