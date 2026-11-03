import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor } from '@/lib/company-defaults'

/**
 * Who hears that a paper arrived through a document request (the second
 * screen walk, 2026-11-03): a worker's own I-9, sent from her page, told
 * every seat at her employer. The answer route now tells the roles whose
 * work papers are, once each, and never the sender.
 */

const seats: { personId: string; role: { permissions: string[] } }[] = []
vi.mock('@/lib/db', () => ({
  prisma: { context: { findMany: async () => seats } },
}))

import { paperExaminersAt } from '@/lib/notify/paper-examiners'

const role = (name: string) => rolesFor('GSI').find((r) => r.name === name)!.permissions as string[]
const seat = (personId: string, name: string) => ({ personId, role: { permissions: role(name) } })

describe('a worker’s own paper is told to the roles whose work papers are', () => {
  beforeEach(() => {
    seats.length = 0
    seats.push(
      seat('owner', 'Owner'), seat('admin', 'Admin'), seat('farah', 'HR'), seat('comp', 'Compliance Officer'),
      seat('rec', 'Recruiter'), seat('am', 'Account Manager'), seat('ar', 'Accounts Receivable'),
      seat('felix', 'Delivery Manager'), seat('ifeoma', 'Team Lead'),
    )
  })

  it('a worker’s own I-9 upload tells HR and the compliance officer once each and nobody else', async () => {
    const told = await paperExaminersAt('teleworld', 'ifeoma')
    expect(told.sort()).toEqual(['comp', 'farah'])
  })

  it('the answer route reads who to tell from the selector, not from every seat at the firm that asked', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/documents/[id]/act.ts'), 'utf8')
    expect(src).toContain('paperExaminersAt(issuer.id, caller.person.id)')
    expect(src).not.toMatch(/companyId: issuer\.id, revokedAt: null[\s\S]{0,200}take: 10/)
  })
})
