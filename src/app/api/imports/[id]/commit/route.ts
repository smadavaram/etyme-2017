import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/imports/:id/commit
 *
 * Creates People, ConsultantProfiles, Assignments from the import rows.
 *
 * BUILD.md:
 *   - "Rows with issues still commit at INTERNAL visibility rather than failing"
 *   - "any row with an endDate inside 8 weeks immediately creates a RolloffEvent"
 *
 * Incomplete data does not block import — it sets visibility to INTERNAL
 * where it would otherwise be FEED, and logs the gaps. The human can
 * enrich later. This is the "progressive enrichment" model from CLAUDE.md.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params

  const importRecord = await prisma.import.findUnique({
    where: { id },
    select: { id: true, companyId: true, kind: true, committedAt: true, rowCount: true },
  })

  if (!importRecord) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Import not found' } },
      { status: 404 }
    )
  }

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

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const parsed = row.parsed as Record<string, any>
        const issues = row.issues as string[]

        // Skip rows that are truly unparseable (no name and no email)
        if (!parsed.name && !parsed.email) {
          skipped++
          continue
        }

        // Determine visibility based on completeness
        // Rows with issues → INTERNAL. Clean rows → FEED (ready for matching).
        const visibility = issues.length > 0 ? 'INTERNAL' : 'FEED'

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

        // Create ConsultantProfile if it doesn't exist
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
              visibility: visibility as 'INTERNAL' | 'FEED',
            },
          })
        }

        // Create BenchListing (retained, from this company)
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
            },
          })
        }

        // Create Context: EMPLOYEE at this company
        const existingContext = await tx.context.findFirst({
          where: {
            personId: person.id,
            companyId: importRecord.companyId,
            revokedAt: null,
          },
        })

        if (!existingContext) {
          await tx.context.create({
            data: {
              personId: person.id,
              type: 'CONSULTANT',
              companyId: importRecord.companyId,
            },
          })
        }

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
          summary: `Imported ${created} people from ${importRecord.kind} file (${skipped} skipped). ${rolloffCount} near-term rolloffs flagged.`,
          reason: 'Data import committed by user',
          payload: {
            importId: id,
            kind: importRecord.kind,
            created,
            skipped,
            rolloffCount,
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
        message: `Committed ${created} records. ${skipped} rows skipped (missing name and email). ${rolloffCount} near-term rolloffs flagged for review.`,
      },
    })
  } catch (err: any) {
    console.error('Import commit failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Import commit failed. No records were created.' } },
      { status: 500 }
    )
  }
}
