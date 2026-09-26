import { describe, it, expect } from 'vitest'

/**
 * Import invariants — from BUILD.md §4.A.
 *
 * POST /api/imports → PATCH mapping → GET rows → POST commit
 *   → incomplete rows commit at INTERNAL visibility rather than failing
 *   → any row with an endDate inside 8 weeks creates a RolloffEvent
 *
 * The import flow is the screen everything else depends on,
 * because without data nothing else can be demonstrated.
 */

import { mapColumns, parseRow, parseValue } from '@/lib/import-mapper'

describe('Import Mapper (BUILD.md §4.A)', () => {
  describe('Column mapping', () => {
    it('maps standard column headers to Etyme fields with high confidence', () => {
      const result = mapColumns(['Full Name', 'Email', 'Pay Rate', 'Start Date'])
      expect(result.mappings).toHaveLength(4)
      expect(result.mappings[0]).toEqual({
        sourceColumn: 'Full Name',
        targetField: 'name',
        confidence: 1.0,
        flagged: false,
      })
      expect(result.mappings[1]).toEqual({
        sourceColumn: 'Email',
        targetField: 'email',
        confidence: 1.0,
        flagged: false,
      })
    })

    it('flags fuzzy matches with confidence below 0.9', () => {
      const result = mapColumns(['Consultant Full Name'])
      const mapping = result.mappings[0]
      expect(mapping.flagged).toBe(true)
      expect(mapping.confidence).toBeLessThan(0.9)
    })

    it('reports unmapped columns', () => {
      const result = mapColumns(['Name', 'Favorite Color', 'Shoe Size'])
      expect(result.unmapped).toContain('Favorite Color')
      expect(result.unmapped).toContain('Shoe Size')
    })

    it('warns when two columns map to the same field', () => {
      const result = mapColumns(['Full Name', 'Candidate Name'])
      // Second one should be marked as duplicate
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('duplicate')
    })

    it('maps first name + last name separately', () => {
      const result = mapColumns(['First Name', 'Last Name', 'Email'])
      const firstMapping = result.mappings.find((m) => m.targetField === 'firstName')
      const lastMapping = result.mappings.find((m) => m.targetField === 'lastName')
      expect(firstMapping).toBeDefined()
      expect(lastMapping).toBeDefined()
    })

    it('recognizes visa/immigration as work authorization', () => {
      const result = mapColumns(['Visa Status'])
      expect(result.mappings[0].targetField).toBe('workAuth')
    })

    it('recognizes skill synonyms: Technologies, Tech Stack', () => {
      const r1 = mapColumns(['Technologies'])
      expect(r1.mappings[0].targetField).toBe('skills')
      const r2 = mapColumns(['Tech Stack'])
      expect(r2.mappings[0].targetField).toBe('skills')
    })
  })

  describe('Value parsing', () => {
    it('strips dollar signs and commas from rates', () => {
      expect(parseValue('payRate', '$85')).toEqual({ value: 85, issue: null })
      expect(parseValue('payRate', '$1,200')).toEqual({ value: 1200, issue: null })
    })

    it('rejects negative rates', () => {
      const result = parseValue('payRate', '-50')
      expect(result.value).toBeNull()
      expect(result.issue).toContain('Negative rate')
    })

    it('parses dates in standard formats', () => {
      const result = parseValue('startDate', '2026-01-15')
      expect(result.issue).toBeNull()
      expect(result.value).toContain('2026-01-15')
    })

    it('rejects garbage dates', () => {
      const result = parseValue('startDate', 'not a date')
      expect(result.value).toBeNull()
      expect(result.issue).toContain('Invalid date')
    })

    it('splits comma-separated skills', () => {
      const result = parseValue('skills', 'Java, Spring Boot, PostgreSQL')
      expect(result.value).toEqual(['Java', 'Spring Boot', 'PostgreSQL'])
    })

    it('splits semicolon-separated skills', () => {
      const result = parseValue('skills', 'SAP FI/CO;ABAP;S/4HANA')
      expect(result.value).toEqual(['SAP FI/CO', 'ABAP', 'S/4HANA'])
    })

    it('normalizes contract types to uppercase', () => {
      expect(parseValue('contractType', 'w2')).toEqual({ value: 'W2', issue: null })
      expect(parseValue('contractType', 'c2c')).toEqual({ value: 'C2C', issue: null })
    })

    it('flags unknown contract types with an issue', () => {
      const result = parseValue('contractType', 'freelance')
      expect(result.issue).toContain('Unknown contract type')
    })

    it('normalizes known work authorizations', () => {
      expect(parseValue('workAuth', 'h1b')).toEqual({ value: 'H1B', issue: null })
      expect(parseValue('workAuth', 'us citizen')).toEqual({ value: 'US_CITIZEN', issue: null })
    })

    it('returns null for empty strings without an issue', () => {
      expect(parseValue('name', '')).toEqual({ value: null, issue: null })
      expect(parseValue('payRate', '  ')).toEqual({ value: null, issue: null })
    })
  })

  describe('Row parsing', () => {
    const mappings = [
      { sourceColumn: 'Name', targetField: 'name', confidence: 1, flagged: false },
      { sourceColumn: 'Email', targetField: 'email', confidence: 1, flagged: false },
      { sourceColumn: 'Rate', targetField: 'payRate', confidence: 1, flagged: false },
      { sourceColumn: 'Skills', targetField: 'skills', confidence: 1, flagged: false },
    ]

    it('parses a clean row with no issues', () => {
      const { parsed, issues } = parseRow(
        { Name: 'Jane Doe', Email: 'jane@acme.com', Rate: '95', Skills: 'Java, AWS' },
        mappings
      )
      expect(issues).toHaveLength(0)
      expect(parsed.name).toBe('Jane Doe')
      expect(parsed.email).toBe('jane@acme.com')
      expect(parsed.payRate).toBe(95)
      expect(parsed.skills).toEqual(['Java', 'AWS'])
    })

    it('reports missing required fields as issues', () => {
      const { issues } = parseRow(
        { Name: '', Email: '', Rate: '85', Skills: '' },
        mappings
      )
      expect(issues).toContain('Missing required field: name')
      expect(issues).toContain('Missing required field: email')
    })

    it('combines firstName + lastName when no full name column exists', () => {
      const fnLnMappings = [
        { sourceColumn: 'First', targetField: 'firstName', confidence: 1, flagged: false },
        { sourceColumn: 'Last', targetField: 'lastName', confidence: 1, flagged: false },
        { sourceColumn: 'Email', targetField: 'email', confidence: 1, flagged: false },
      ]
      const { parsed } = parseRow(
        { First: 'Jane', Last: 'Doe', Email: 'jane@acme.com' },
        fnLnMappings
      )
      expect(parsed.name).toBe('Jane Doe')
    })

    it('skips unmapped columns (targetField is null)', () => {
      const withUnmapped = [
        ...mappings,
        { sourceColumn: 'Favorite Color', targetField: null, confidence: 0, flagged: true },
      ]
      const { parsed } = parseRow(
        { Name: 'Jane', Email: 'jane@acme.com', Rate: '85', Skills: 'Java', 'Favorite Color': 'blue' },
        withUnmapped
      )
      expect(parsed).not.toHaveProperty('Favorite Color')
      expect(parsed).not.toHaveProperty('favoriteColor')
    })
  })
})
