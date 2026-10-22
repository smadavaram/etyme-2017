/**
 * The switch and the address: on, off, and replaced.
 *
 * Only an Owner or Admin turns it (the route checks the seat; this checks
 * the company). Off by default. Turning it on the first time makes the
 * address; replacing it makes a new one and the old one stops at once,
 * because the only copy of the old token's hash is overwritten. The
 * address is returned from the call that made it and from nowhere else:
 * the table holds a hash and four characters.
 *
 * Every turn writes an automation row naming who did it. Never the token.
 */
import { prisma } from '@/lib/db'
import { addressFor, hashToken, labelFor, mintToken, tokenHint, INTAKE_DOMAIN } from './address'

/** The roles that may turn forwarded email on, off, or replace its address. */
export const INTAKE_ROLES = ['Owner', 'Admin'] as const

export interface IntakeState {
  enabled: boolean
  /** "<label>-…abcd@in.etyme.com", or null where no address was ever made. */
  addressHint: string | null
  enabledAt: Date | null
  enabledById: string | null
  disabledAt: Date | null
  disabledById: string | null
  replacedAt: Date | null
  replacedById: string | null
}

export async function intakeStateFor(companyId: string): Promise<IntakeState> {
  const row = await prisma.emailIntake.findUnique({ where: { companyId } })
  return {
    enabled: row?.enabled === true,
    addressHint: row?.addressLabel && row.tokenHint ? `${row.addressLabel}-…${row.tokenHint}@${INTAKE_DOMAIN}` : null,
    enabledAt: row?.enabledAt ?? null,
    enabledById: row?.enabledById ?? null,
    disabledAt: row?.disabledAt ?? null,
    disabledById: row?.disabledById ?? null,
    replacedAt: row?.replacedAt ?? null,
    replacedById: row?.replacedById ?? null,
  }
}

export type IntakeChange = { on?: boolean; replace?: boolean }

export type IntakeChangeOutcome =
  | { ok: true; state: IntakeState; address: string | null; says: string }
  | { ok: false; says: string }

/**
 * Turn the intake on or off, and/or replace its address. `address` is the
 * whole new address where one was made by this call, and null otherwise.
 */
export async function changeIntake(companyId: string, personId: string, change: IntakeChange): Promise<IntakeChangeOutcome> {
  if (change.on === undefined && !change.replace) {
    return { ok: false, says: 'Say whether to turn forwarded email on or off, or to replace its address.' }
  }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true, isDemo: true } })
  if (!company) return { ok: false, says: 'There is no such company.' }
  if (company.isDemo) return { ok: false, says: 'A demo company cannot receive email.' }

  const now = new Date()
  const existing = await prisma.emailIntake.findUnique({ where: { companyId } })
  const needsAddress = change.replace === true || (change.on === true && !existing?.tokenHash)
  const token = needsAddress ? mintToken() : null
  const label = existing?.addressLabel ?? labelFor(company.slug)

  const data: Record<string, unknown> = {}
  if (token) {
    data.addressLabel = label
    data.tokenHash = hashToken(token)
    data.tokenHint = tokenHint(token)
    if (existing?.tokenHash) {
      data.replacedById = personId
      data.replacedAt = now
    }
  }
  if (change.on === true && !existing?.enabled) {
    data.enabled = true
    data.enabledById = personId
    data.enabledAt = now
  }
  if (change.on === false && existing?.enabled) {
    data.enabled = false
    data.disabledById = personId
    data.disabledAt = now
  }

  const replaced = Boolean(token && existing?.tokenHash)
  const turned = data.enabled === true ? 'ON' : data.enabled === false ? 'OFF' : null
  const hint = `${label}-…${token ? tokenHint(token) : existing?.tokenHint ?? ''}@${INTAKE_DOMAIN}`

  await prisma.$transaction(async (tx) => {
    await tx.emailIntake.upsert({ where: { companyId }, create: { companyId, ...data }, update: data })
    if (turned || token) {
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'EMAIL_INTAKE_SET',
          summary: [
            turned === 'ON' ? 'Forwarded email was turned on.' : turned === 'OFF' ? 'Forwarded email was turned off.' : null,
            replaced ? 'Its address was replaced; the old one stopped at once.' : token ? 'Its address was made.' : null,
          ].filter(Boolean).join(' '),
          reason: 'An Owner or Admin changed the company’s forwarded email setting.',
          // The hint only: the address is shown once to the person who made it and kept nowhere.
          payload: { byPersonId: personId, turned, replaced, addressHint: hint },
          // The switch turns back; a replaced address does not come back.
          reversible: !replaced,
        },
      })
    }
  })

  const state = await intakeStateFor(companyId)
  const address = token ? addressFor(label, token) : null
  const says = [
    turned === 'ON' ? 'Forwarded email is on.' : turned === 'OFF' ? 'Forwarded email is off. Nothing sent to the address is kept.' : state.enabled ? 'Forwarded email is still on.' : 'Forwarded email is still off.',
    replaced ? 'The old address stopped working just now.' : null,
    address ? 'This is the only time the address is shown. Copy it into your mail rule now; if it is lost, replace it.' : null,
    turned === 'ON' && !address ? `The address you made before works again (${state.addressHint}). Replace it if you no longer have it.` : null,
  ].filter(Boolean).join(' ')
  return { ok: true, state, address, says }
}
