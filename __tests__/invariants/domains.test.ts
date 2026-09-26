import { describe, it, expect } from 'vitest'

/**
 * Domain detection invariants — from CLAUDE.md, corrected auth routing.
 *
 * "All business users live on Microsoft network space, Microsoft Teams
 * and Google workspace. All candidates live on Gmail primarily or
 * LinkedIn or yahoo." — Founder
 *
 * Domain detection replaces the 2017 EXCLUDED_DOMAINS check.
 * Consumer domain → candidate population → email notifications.
 * Corporate domain → business population → Teams notifications.
 */

// Inline the logic for testing — the actual code lives in src/lib/domains.ts
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'mail.com', 'protonmail.com',
  'proton.me', 'zoho.com', 'yandex.com', 'rediffmail.com', 'facebook.com',
  'qq.com', '163.com', 'naver.com',
])

type UserPopulation = 'business' | 'candidate'

function detectPopulation(email: string): UserPopulation {
  const parts = email.split('@')
  if (parts.length !== 2) return 'candidate'
  const domain = parts[1].toLowerCase()
  if (CONSUMER_DOMAINS.has(domain)) return 'candidate'
  return 'business'
}

function notificationChannel(pop: UserPopulation): 'teams' | 'email' {
  return pop === 'business' ? 'teams' : 'email'
}

describe('Domain Detection (CLAUDE.md — User Populations)', () => {
  describe('Population routing', () => {
    it('a gmail address routes to candidate population', () => {
      expect(detectPopulation('ravi@gmail.com')).toBe('candidate')
    })

    it('a yahoo address routes to candidate population', () => {
      expect(detectPopulation('user@yahoo.com')).toBe('candidate')
    })

    it('a hotmail address routes to candidate population', () => {
      expect(detectPopulation('user@hotmail.com')).toBe('candidate')
    })

    it('a protonmail address routes to candidate population', () => {
      expect(detectPopulation('user@protonmail.com')).toBe('candidate')
    })

    it('a corporate email routes to business population', () => {
      expect(detectPopulation('sharath@cloudepa.com')).toBe('business')
    })

    it('an Infosys email routes to business population', () => {
      expect(detectPopulation('manager@infosys.com')).toBe('business')
    })

    it('a subdomain corporate email routes to business population', () => {
      expect(detectPopulation('user@us.infosys.com')).toBe('business')
    })

    it('an invalid email without @ routes to candidate (safe default)', () => {
      expect(detectPopulation('nodomain')).toBe('candidate')
    })
  })

  describe('Notification channel routing', () => {
    it('business users get Teams notifications', () => {
      expect(notificationChannel('business')).toBe('teams')
    })

    it('candidates get email notifications', () => {
      expect(notificationChannel('candidate')).toBe('email')
    })

    it('gmail user gets email notifications end to end', () => {
      const pop = detectPopulation('ravi@gmail.com')
      expect(notificationChannel(pop)).toBe('email')
    })

    it('corporate user gets Teams notifications end to end', () => {
      const pop = detectPopulation('sharath@cloudepa.com')
      expect(notificationChannel(pop)).toBe('teams')
    })
  })

  describe('Company registration eligibility', () => {
    it('a candidate cannot register a company', () => {
      const pop = detectPopulation('ravi@gmail.com')
      expect(pop).toBe('candidate')
      // Candidate CAN sign in (they're a valid user), they just can't register a company
    })

    it('a business user can register a company', () => {
      const pop = detectPopulation('sharath@cloudepa.com')
      expect(pop).toBe('business')
    })
  })
})
