import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { importRefusal, ownImport } from '../../door'
import { prisma } from '@/lib/db'
import { invitation } from '@/lib/bench-consent'
import { isOwnEmployeeRow } from '@/lib/import-mapper'

/**
 * POST /api/imports/:id/commit
 *
 * Creates people, and their contracts where the row carries them.
 *
 * A W2 row at a firm that employs people is its own employee: an EMPLOYEE
 * seat and no bench listing. Every other row is a record kept to the firm
 * and a bench invitation the person answers (2026-10-27). Nothing an
 * import writes is shown outside the firm: every profile is INTERNAL.
 *
 * BUILD.md: "any row with an endDate inside 8 weeks immediately creates a
 * RolloffEvent". Rows with gaps still commit; the review lists the gaps.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // One door, then the caller's own company's import only (./door).
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = importRefusal(caller)
  if (refused) return refused

  const { id } = await params

  const { import: importRecord, error: notOurs } = await ownImport(caller, id)
  if (notOurs) return notOurs

  if (importRecord.committedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_COMMITTED', message: 'This import has already been committed.' } },
      { status: 409 }
    )
  }

  const rows = await prisma.importRow.findMany({
    where: { importId: id },
    orderBy: { id: 'asc' },
  })

  const now = new Date()
  const eightWeeksOut = new Date(now.getTime() + 8 * 7 * 24 * 60 * 60 * 1000)

  let created = 0
  let skipped = 0
  let rolloffCount = 0
  let employees = 0
  let invited = 0
  let employeeRoleId: string | undefined
  const companyKind = (await prisma.company.findUniqueOrThrow({ where: { id: importRecord.companyId }, select: { kind: true } })).kind
  const fileName = importRecord.fileName ?? 'a file'

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const parsed = row.parsed as Record<string, any>

        // Skip rows that are truly unparseable (no name and no email)
        if (!parsed.name && !parsed.email) {
          skipped++
          continue
        }

        // Find or create Person
        let person
        if (parsed.email) {
          person = await tx.person.findUnique({
            where: { primaryEmail: parsed.email },
          })

          if (!person) {
            person = await tx.person.create({
              data: {
                name: parsed.name || parsed.email.split('@')[0],
                primaryEmail: parsed.email,
              },
            })
          }
        } else {
          // No email — create with a placeholder. The import log records this gap.
          person = await tx.person.create({
            data: {
              name: parsed.name,
              primaryEmail: `import-${id}-${row.id}@placeholder.etyme.local`,
            },
          })
        }

        // ── Whose person this row is ──────────────────────────────
        //
        // The onboarding walk of 2026-10-27, at an integrator: two W2 rows
        // became CONSULTANT seats "RETAINED on bench" — a listing born
        // granted, which no person had agreed to. Two cases now:
        //
        //   - A W2 row at a firm that employs people is its own employee:
        //     an EMPLOYEE seat holding a role that reads only their own
        //     work, the way the seeded integrators' engineers are seated,
        //     and no bench listing. The employment is the consent.
        //   - Every other row is a contractor the firm knows: a record,
        //     kept to the firm, and a bench listing that is an INVITATION
        //     (`invitation` in lib/bench-consent). Only the person moves it
        //     to granted; the firm sends the ask from Bench.
        const ownEmployee = isOwnEmployeeRow(parsed, companyKind)

        // The record of their skills, never marketed by an import: a
        // profile written here is INTERNAL and stays so until the person
        // says yes to a bench.
        let profile = await tx.consultantProfile.findUnique({
          where: { personId: person.id },
        })

        if (!profile) {
          profile = await tx.consultantProfile.create({
            data: {
              personId: person.id,
              headline: parsed.headline ?? null,
              skills: parsed.skills ?? [],
              location: parsed.location ?? null,
              workAuth: parsed.workAuth ?? null,
              availableFrom: parsed.availableFrom ? new Date(parsed.availableFrom) : null,
              visibility: 'INTERNAL',
            },
          })
        }

        if (!ownEmployee) {
          const existingListing = await tx.benchListing.findUnique({
            where: {
              consultantId_companyId: {
                consultantId: profile.id,
                companyId: importRecord.companyId,
              },
            },
          })

          if (!existingListing) {
            await tx.benchListing.create({
              data: {
                consultantId: profile.id,
                companyId: importRecord.companyId,
                tier: 'RETAINED',
                rateMin: parsed.payRate ?? null,
                rateMax: parsed.billRate ?? null,
                ...invitation(now),
              },
            })
          }
          invited++
        }

        const existingContext = await tx.context.findFirst({
          where: {
            personId: person.id,
            companyId: importRecord.companyId,
            revokedAt: null,
          },
        })

        if (!existingContext) {
          await tx.context.create({
            data: ownEmployee
              ? {
                  personId: person.id,
                  type: 'EMPLOYEE',
                  companyId: importRecord.companyId,
                  roleId: (employeeRoleId ??= await employeeRole(tx, importRecord.companyId)),
                  grantReason: `Imported as a W2 employee from ${fileName} on ${now.toISOString().slice(0, 10)}`,
                }
              : {
                  personId: person.id,
                  type: 'CONSULTANT',
                  companyId: importRecord.companyId,
                },
          })
        }
        if (ownEmployee) employees++

        // If there's contract data (payRate or billRate, startDate), create contracts
        if ((parsed.payRate || parsed.billRate) && parsed.startDate) {
          const contractStart = new Date(parsed.startDate)
          const contractEnd = parsed.endDate ? new Date(parsed.endDate) : null
          const isEnded = contractEnd && contractEnd < now

          // Create sell contract if billRate is present
          let sellContract = null
          if (parsed.billRate) {
            sellContract = await tx.sellContract.create({
              data: {
                companyId: importRecord.companyId,
                clientCompanyId: importRecord.companyId, // placeholder — enriched later
                personId: person.id,
                billRate: parsed.billRate,
                state: isEnded ? 'ENDED' : 'IN_PROGRESS',
                startDate: contractStart,
                endDate: contractEnd,
              },
            })
          }

          // Create buy contract if payRate is present
          let buyContract = null
          if (parsed.payRate) {
            buyContract = await tx.buyContract.create({
              data: {
                companyId: importRecord.companyId,
                contractType: parsed.contractType ?? 'W2',
                state: isEnded ? 'ENDED' : 'IN_PROGRESS',
                startDate: contractStart,
                endDate: contractEnd,
                candidates: {
                  create: {
                    personId: person.id,
                    payRate: parsed.payRate,
                    startDate: contractStart,
                    endDate: contractEnd,
                  },
                },
              },
            })
          }

          // Link them if both exist
          if (sellContract && buyContract) {
            await tx.contractLink.create({
              data: {
                sellContractId: sellContract.id,
                buyContractId: buyContract.id,
                effectiveFrom: contractStart,
                effectiveTo: contractEnd,
              },
            })
          }

          // BUILD.md: "any row with an endDate inside 8 weeks immediately creates a RolloffEvent"
          if (sellContract && parsed.endDate) {
            const endDate = new Date(parsed.endDate)
            if (endDate > now && endDate <= eightWeeksOut) {
              await tx.rolloffEvent.create({
                data: {
                  sellContractId: sellContract.id,
                  endDate,
                  notified: {},
                  checklist: {
                    knowledgeTransfer: false,
                    finalTimesheet: false,
                    accessRevocation: false,
                    assets: false,
                  },
                },
              })
              rolloffCount++
            }
          }
        }

        // Update the row with the created person ID
        await tx.importRow.update({
          where: { id: row.id },
          data: { createdId: person.id },
        })

        created++
      }

      // Mark import as committed
      await tx.import.update({
        where: { id },
        data: { committedAt: now },
      })

      // Write AutomationLog
      await tx.automationLog.create({
        data: {
          companyId: importRecord.companyId,
          action: 'IMPORT_COMMITTED',
          summary: `Imported ${created} people: ${employees} as the firm\u2019s own W2 employees, ${invited} asked to join its bench (${skipped} skipped). ${rolloffCount} ending within eight weeks flagged.`,
          reason: 'A person at the firm pressed Import on the review page',
          payload: {
            importId: id,
            kind: importRecord.kind,
            created,
            skipped,
            rolloffCount,
            employees,
            invited,
            totalRows: rows.length,
          },
          reversible: true,
        },
      })
    })

    return NextResponse.json({
      data: {
        importId: id,
        committed: true,
        created,
        skipped,
        rolloffCount,
        employees,
        invited,
        message: committedSentence({ employees, invited, skipped, rolloffCount }),
      },
    })
  } catch (err: any) {
    reportError('Import commit failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The import did not go through, and nothing was written. Try again; if it fails twice, Etyme staff have been told.' } },
      { status: 500 }
    )
  }
}

/**
 * The role an imported W2 employee holds: their own work and their own
 * week, nothing else — the seeded integrators' engineers hold the same
 * two reads. Found by name, made once per firm, never a default role, so
 * `ensureDefaultRoles` leaves it alone.
 */
async function employeeRole(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const found = await tx.role.findFirst({ where: { companyId, name: 'Employee' }, select: { id: true } })
  if (found) return found.id
  return (await tx.role.create({
    data: { companyId, name: 'Employee', isDefault: false, permissions: ['assignments.read', 'timesheets.read'] },
    select: { id: true },
  })).id
}

/** What the page says once the import is in, in the trade's words. */
function committedSentence(o: { employees: number; invited: number; skipped: number; rolloffCount: number }): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const parts: string[] = []
  if (o.employees) parts.push(`${n(o.employees, 'person is', 'people are')} on your payroll as your own employee${o.employees === 1 ? '' : 's'}`)
  if (o.invited) parts.push(`${n(o.invited, 'person is', 'people are')} on your records, waiting to be asked to join your bench from Bench`)
  if (o.skipped) parts.push(`${n(o.skipped, 'row was', 'rows were')} skipped for having no name and no email`)
  if (o.rolloffCount) parts.push(`${n(o.rolloffCount, 'contract ends', 'contracts end')} within eight weeks and ${o.rolloffCount === 1 ? 'is' : 'are'} on Rolloff`)
  return parts.length ? `${parts.join('. ')}.` : 'Nothing was imported.'
}
