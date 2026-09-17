import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor, GRANTED_SINCE } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'

vi.mock('@/lib/db', () => ({
  prisma: {
    role: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { ensureDefaultRoles } from '@/lib/company-roles'

/**
 * Which desk at a supplier may award a person onto its own requisition.
 *
 * `POST /api/submissions/[id]/award` started asking which seat rather than
 * only which company on 2026-09-17, and gated on `requirements.write`.
 * That is right at a client — it splits the hiring manager and the program
 * manager from the viewer, the AP clerk and the compliance officer. But the
 * same route admits the company a submission was sent to, which is a prime
 * or a GSI awarding a sub-vendor's candidate onto its own requisition, and
 * at a supplier the only desks holding `requirements.write` were Owner and
 * Admin.
 *
 * So the account manager who had just sold the person could not award them.
 * CLAUDE.md's "Who sells and who buys" exists to rule out exactly that
 * shape: a prime is both sell and buy, and it builds teams dynamically.
 *
 * Nothing in the suite exercised a prime awarding a sub's candidate at all,
 * which is why it got through. These are those sentences.
 */

const can = (kind: 'VENDOR' | 'GSI' | 'CLIENT' | 'MSP', role: string) => {
  const seed = rolesFor(kind).find((r) => r.name === role)
  expect(seed, `${kind} has no role called ${role}`).toBeDefined()
  return hasPermission(seed!.permissions, 'requirements.write')
}

describe('a prime awarding a sub-vendor’s consultant onto its own requisition', () => {

  it('a prime’s account manager can award the sub-vendor’s consultant they just sold', () => {
    expect(can('VENDOR', 'Account Manager')).toBe(true)
  })

  it('a prime’s resource manager can award the person they are putting on the project', () => {
    // They already decide who goes where. Without this they could move
    // somebody onto a project and not award them onto the requisition
    // that pays for it.
    expect(can('VENDOR', 'Resource Manager')).toBe(true)
  })

  it('a GSI’s delivery manager could always award, and still can', () => {
    expect(can('GSI', 'Delivery Manager')).toBe(true)
    expect(can('GSI', 'Account Manager')).toBe(true)
    expect(can('GSI', 'Resource Manager')).toBe(true)
  })

  it('a prime’s accounts receivable clerk still cannot award anybody', () => {
    expect(can('VENDOR', 'Accounts Receivable')).toBe(false)
    expect(can('VENDOR', 'AP & Payroll')).toBe(false)
  })

  it('a prime’s contract manager papers an award and does not choose who gets it', () => {
    // Deliberate, and the narrower half of this decision. A firm where the
    // same desk picks the candidate and writes the contract they are paid
    // under has no segregation on the one act that commits money.
    expect(can('VENDOR', 'Contract Manager')).toBe(false)
  })

  it('a recruiter who submitted the person does not also hand them the job', () => {
    expect(can('VENDOR', 'Recruiter')).toBe(false)
    expect(can('GSI', 'Contractor Desk')).toBe(false)
  })

  it('a prime’s HR and compliance desks are unchanged, because awarding is not their act', () => {
    expect(can('VENDOR', 'HR')).toBe(false)
    expect(can('VENDOR', 'Compliance Officer')).toBe(false)
    expect(can('VENDOR', 'Finance')).toBe(false)
  })

  it('a client’s desks are untouched by any of this', () => {
    expect(can('CLIENT', 'Hiring Manager')).toBe(true)
    expect(can('CLIENT', 'Program Manager')).toBe(true)
    expect(can('CLIENT', 'Viewer')).toBe(false)
    expect(can('CLIENT', 'AP Clerk')).toBe(false)
    expect(can('CLIENT', 'Compliance Officer')).toBe(false)
    expect(can('CLIENT', 'Approver')).toBe(false)
    expect(can('CLIENT', 'HR Partner')).toBe(false)
    expect(can('CLIENT', 'Procurement Lead')).toBe(false)
  })

  it('the route still asks which seat, and says who to ask when it refuses', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/submissions/[id]/award/route.ts'),
      'utf8'
    )
    expect(route).toContain("hasPermission(caller.permissions, 'requirements.write')")
    expect(route).toContain('Ask them to award')
  })
})

describe('a firm formed before today picks this up without a migration', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.role.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.role.findFirst).mockResolvedValue(null as any)
    vi.mocked(prisma.role.update).mockResolvedValue({} as any)
    vi.mocked(prisma.role.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.role.create).mockResolvedValue({} as any)
  })

  it('an account manager seated last month can award the next time somebody opens users and permissions', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue([
      { name: 'Account Manager' }, { name: 'Owner' },
    ] as any)
    vi.mocked(prisma.role.findFirst).mockImplementation(((args: any) =>
      args.where.name === 'Account Manager'
        ? ({ id: 'role-am', permissions: ['requirements.read', 'submissions.read'] })
        : null) as any)

    const result = await ensureDefaultRoles('brightmoor', 'VENDOR')

    expect(result.granted).toContain('Account Manager → requirements.write')
    const written = vi.mocked(prisma.role.update).mock.calls[0]![0] as any
    expect(written.data.permissions).toContain('requirements.write')
  })

  it('nothing is ever taken off a role a company narrowed itself', async () => {
    // The reason this is a declared list of grants and not a sync back
    // onto the seed: an admin who removed a permission meant it, and a
    // wholesale sync would undo that every time the screen was opened.
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ name: 'Account Manager' }] as any)
    vi.mocked(prisma.role.findFirst).mockImplementation(((args: any) =>
      args.where.name === 'Account Manager'
        ? ({ id: 'role-am', permissions: ['requirements.read'] })
        : null) as any)

    await ensureDefaultRoles('brightmoor', 'VENDOR')

    const written = vi.mocked(prisma.role.update).mock.calls[0]![0] as any
    expect(written.data.permissions).toContain('requirements.read')
    expect(written.data.permissions).not.toContain('rates.write')
    expect(written.data.permissions.length).toBe(2)
  })

  it('a role that already has it is left alone rather than written again', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ name: 'Account Manager' }] as any)
    vi.mocked(prisma.role.findFirst).mockImplementation(((args: any) =>
      args.where.name === 'Account Manager'
        ? ({ id: 'role-am', permissions: ['requirements.write'] })
        : null) as any)

    const result = await ensureDefaultRoles('brightmoor', 'VENDOR')

    expect(result.granted).toEqual([])
    expect(vi.mocked(prisma.role.update)).not.toHaveBeenCalled()
  })

  it('a client company is not widened by a grant written for suppliers', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ name: 'Account Manager' }] as any)
    vi.mocked(prisma.role.findFirst).mockResolvedValue({ id: 'x', permissions: [] } as any)

    const result = await ensureDefaultRoles('northbend', 'CLIENT')

    expect(result.granted).toEqual([])
  })

  it('every grant says why it was widened, so nobody has to guess later', () => {
    expect(GRANTED_SINCE.length).toBeGreaterThan(0)
    for (const g of GRANTED_SINCE) {
      expect(g.why.length, g.role).toBeGreaterThan(30)
      expect(g.permissions.length, g.role).toBeGreaterThan(0)
      expect(g.kinds.length, g.role).toBeGreaterThan(0)
    }
  })
})
