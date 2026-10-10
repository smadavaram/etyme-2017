/**
 * The cost coding an award carries, for a placement a seed writes directly.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * A real placement is made by `POST /api/submissions/:id/award`. That
 * route reads the requisition's cost center and department and carries
 * both forward: the department onto the sell line, and a 100% allocation
 * of the line to the cost center. The client's budget
 * (`GET /api/program/budget`) charges a signed week to a cost center only
 * through that allocation.
 *
 * The pay-rise seed (Rosa Delgado, Northbend Athletic) and the sector
 * seed (Adaeze Obi at Talvern Medical, Wendell Price at Cavanaugh
 * Glassworks) wrote the job, the submission and the line directly and
 * left the coding out. So the client signed for every one of their weeks
 * and its budget counted none of them: Northbend's budget read $35,800
 * against $168,072 of approved work.
 *
 * ── Which department ─────────────────────────────────────────────────
 *
 * The world seed gives every client a Technology business unit and
 * nothing else, because every job in it was a software job. None of these
 * three is. A warehouse systems analyst at a distribution center, an
 * occupational health nurse and a forming-line maintenance technician
 * are charged to an Operations department of the client's own, never to
 * "Apps — contingent". A budget screen that puts a nurse in the Apps
 * department is a wrong fact on a page the buyer reads.
 *
 * The plan on each cost center is one head for a year at the job's bill
 * rate, rounded up to the next ten thousand dollars. It is computed from
 * the rate rather than typed, so it moves if the rate does.
 *
 * ── Dates and re-seeding ─────────────────────────────────────────────
 *
 * Every row is found before it is written. A world seeded before this
 * existed gets the coding on its next seeding; after that, a seeding
 * writes nothing.
 */

import { prisma as db } from '@/lib/db'
import { seedPlanYear } from '@/lib/seed-days'

/** The business unit the non-technology departments sit under. */
export const OPERATIONS = 'Operations'

/** A department of a client, under Operations, with the cost center that funds it. */
export interface SeedDepartment {
  /** What the client calls it: "Distribution", "Employee Health". */
  name: string
  /** The short code its cost center is numbered from: "DIST", "EHS". */
  code: string
}

/** Hours in a working year, for sizing a plan to one head. */
const YEAR_HOURS = 2_080

/**
 * The client's part of a seeded cost center code: the first word of the
 * name a person reads — `NORTHBEND` for Northbend Athletic.
 *
 * It was the first four letters of the slug, and the slugs are the
 * retired real names kept as addresses (`world-nike`), so the budget
 * picker on the job request form read `APPS-NIKE-4100`. A slug is an
 * address nobody reads; a cost center code is printed on the form, the
 * job request and the program page, so it is built from the display
 * name like every other word on a screen.
 */
export function clientTag(clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0] ?? ''
  return first.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'CLIENT'
}

/** The cost center's code, in the one shape every seed numbers them: `APPS-NORTHBEND-4100`. */
export function costCenterCode(deptCode: string, clientName: string): string {
  return `${deptCode}-${clientTag(clientName)}-4100`
}

/**
 * The code a world seeded before 2026-09-30 wrote, from the slug. Read
 * only to rename that row in place, so a re-seed moves the code rather
 * than writing a second budget beside the first.
 */
export function legacyCostCenterCode(deptCode: string, clientSlug: string): string {
  return `${deptCode}-${clientSlug.slice(0, 4).toUpperCase()}-4100`
}

/**
 * The cost center at this code, found in one read whether it was written
 * under today's code or the slug-shaped one, and renamed in place if it
 * was the old one. Null when neither exists.
 */
export async function findCostCenter(
  companyId: string,
  code: string,
  legacyCode: string
): Promise<{ id: string } | null> {
  const rows = await db.costCenter.findMany({
    where: { companyId, code: { in: code === legacyCode ? [code] : [code, legacyCode] } },
    select: { id: true, code: true },
  })
  const found = rows.find((r) => r.code === code) ?? rows[0]
  if (!found) return null
  if (found.code !== code) await db.costCenter.update({ where: { id: found.id }, data: { code } })
  return { id: found.id }
}

/** One head for a year at this bill rate, rounded up to the next $10,000. In dollars. */
export function planFor(billCents: number): number {
  return Math.ceil((billCents * YEAR_HOURS) / 100 / 10_000) * 10_000
}

/**
 * The department and its cost center at a client, found or written.
 *
 * The cost center's owner is the client's account owner, the same person
 * who owns every other seeded cost center there.
 */
export async function departmentAt(input: {
  clientId: string
  clientSlug: string
  /** The name a person reads, which the cost center's code is built from. */
  clientName: string
  ownerId: string
  dept: SeedDepartment
  billCents: number
}): Promise<{ orgUnitId: string; costCenterId: string }> {
  const { clientId, clientSlug, clientName, ownerId, dept, billCents } = input

  const ops =
    (await db.orgUnit.findFirst({ where: { companyId: clientId, name: OPERATIONS } })) ??
    (await db.orgUnit.create({ data: { companyId: clientId, name: OPERATIONS, kind: 'BU' } }))
  const unit =
    (await db.orgUnit.findFirst({ where: { companyId: clientId, name: dept.name } })) ??
    (await db.orgUnit.create({
      data: { companyId: clientId, name: dept.name, kind: 'DEPARTMENT', parentId: ops.id },
    }))

  const code = costCenterCode(dept.code, clientName)
  const cc =
    (await findCostCenter(clientId, code, legacyCostCenterCode(dept.code, clientSlug))) ??
    (await db.costCenter.create({
      data: { companyId: clientId, code, name: `${dept.name} — contingent`, orgUnitId: unit.id, ownerId },
    }))

  const period = seedPlanYear()
  if (!(await db.headcountPlan.findFirst({ where: { costCenterId: cc.id, period } }))) {
    await db.headcountPlan.create({
      data: { costCenterId: cc.id, period, approvedHeads: 1, annualBudget: planFor(billCents), currency: 'USD' },
    })
  }

  return { orgUnitId: unit.id, costCenterId: cc.id }
}

/**
 * The coding an award writes, onto a job and its sell line.
 *
 * The job carries its cost center and department; the line carries the
 * department and is allocated wholly to the cost center. Only what is
 * missing is written, so a line somebody has since recoded keeps its
 * coding.
 */
export async function codeTheLine(input: {
  requirementId: string
  sellContractId: string
  orgUnitId: string
  costCenterId: string
}): Promise<void> {
  const { requirementId, sellContractId, orgUnitId, costCenterId } = input

  const job = await db.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    select: { costCenterId: true, orgUnitId: true },
  })
  if (job.costCenterId == null || job.orgUnitId == null) {
    await db.requirement.update({
      where: { id: requirementId },
      data: {
        ...(job.costCenterId == null ? { costCenterId } : {}),
        ...(job.orgUnitId == null ? { orgUnitId } : {}),
      },
    })
  }

  const line = await db.sellContract.findUniqueOrThrow({ where: { id: sellContractId }, select: { orgUnitId: true } })
  if (line.orgUnitId == null) {
    await db.sellContract.update({ where: { id: sellContractId }, data: { orgUnitId } })
  }

  // As the award writes it: the whole line, to the job's cost center.
  if (!(await db.contractCostAllocation.findFirst({ where: { sellContractId } }))) {
    const charged = (await db.requirement.findUniqueOrThrow({ where: { id: requirementId }, select: { costCenterId: true } }))
      .costCenterId ?? costCenterId
    await db.contractCostAllocation.create({ data: { sellContractId, costCenterId: charged, shareBps: 10_000 } })
  }
}
