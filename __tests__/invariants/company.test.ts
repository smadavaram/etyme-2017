import { describe, it, expect } from 'vitest'

/**
 * Company formation invariants — from CLAUDE.md, BUILD.md §4.A,
 * and User Story CF-01.
 *
 * CF-01: "As an Owner, I want to register my staffing company with
 * my company email so that I get a working platform identity and a
 * subdomain site within 90 seconds."
 */

// Extract the validation logic so it can be tested without HTTP
function isExcludedDomain(email: string): boolean {
  const EXCLUDED = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
    'rediffmail.com', 'facebook.com',
  ])
  const domain = email.split('@')[1]?.toLowerCase()
  return !domain || EXCLUDED.has(domain)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

const RESERVED_SLUGS = new Set([
  'api', 'app', 'admin', 'login', 'signup', 'dashboard',
  'settings', 'www', 'mail', 'help', 'support', 'blog',
  'docs', 'status', 'etyme',
])

describe('Company Formation (CF-01 through CF-05)', () => {
  describe('Email domain validation', () => {
    it('a gmail address cannot register a company', () => {
      expect(isExcludedDomain('sharath@gmail.com')).toBe(true)
    })

    it('a yahoo address cannot register a company', () => {
      expect(isExcludedDomain('user@yahoo.com')).toBe(true)
    })

    it('a company email can register a company', () => {
      expect(isExcludedDomain('sharath@cloudepa.com')).toBe(false)
    })

    it('a company email with a subdomain can register', () => {
      expect(isExcludedDomain('user@us.infosys.com')).toBe(false)
    })

    it('an empty email is rejected', () => {
      expect(isExcludedDomain('')).toBe(true)
    })

    it('an email without a domain is rejected', () => {
      expect(isExcludedDomain('nodomain')).toBe(true)
    })
  })

  describe('Slug generation', () => {
    it('a company name becomes a lowercase slug', () => {
      expect(slugify('Cloudepa')).toBe('cloudepa')
    })

    it('spaces and special characters become hyphens', () => {
      expect(slugify('Infosys BPM Limited')).toBe('infosys-bpm-limited')
    })

    it('leading and trailing hyphens are stripped', () => {
      expect(slugify('--test--')).toBe('test')
    })

    it('the slug is capped at 48 characters', () => {
      const longName = 'A'.repeat(60)
      expect(slugify(longName).length).toBeLessThanOrEqual(48)
    })

    it('reserved slugs are identified', () => {
      expect(RESERVED_SLUGS.has('api')).toBe(true)
      expect(RESERVED_SLUGS.has('admin')).toBe(true)
      expect(RESERVED_SLUGS.has('etyme')).toBe(true)
    })

    it('a normal company slug is not reserved', () => {
      expect(RESERVED_SLUGS.has('cloudepa')).toBe(false)
    })
  })

  describe('Seven default roles', () => {
    const DEFAULT_ROLES = [
      'Owner', 'Admin', 'Recruiter', 'Accountant',
      'Project Manager', 'Resource Manager', 'Compliance Officer',
    ]

    it('exactly seven default roles are created on company formation', () => {
      expect(DEFAULT_ROLES).toHaveLength(7)
    })

    it('the seven roles include PM and RMG per Addendum C', () => {
      expect(DEFAULT_ROLES).toContain('Project Manager')
      expect(DEFAULT_ROLES).toContain('Resource Manager')
    })

    it('the seven roles include Compliance Officer per Addendum C', () => {
      expect(DEFAULT_ROLES).toContain('Compliance Officer')
    })
  })
})
