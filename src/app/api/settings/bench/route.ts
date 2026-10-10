import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  BENCH_POLICIES, EXIT_WORDS, POLICY_WORDS, RESERVE_ON_EXIT,
  firmHolidayView, policySentence, readPolicyChange, readSwitch, turnedSays, asSwitch,
  type PolicyNow,
} from '@/lib/bench-holiday-switch'
import { benchPayDesk } from './desk'

/**
 * GET   /api/settings/bench — the firm's bench pay policy and its holiday setting
 * PATCH /api/settings/bench — change either
 *
 * Read and changed by the owner, the admin and the finance desk of a firm
 * that carries people between projects (`mayChangeBenchPay`), and by
 * nobody else: the policy is what bench cost, bench burn and bench profit
 * are worked out under.
 *
 * The holiday setting is not a column. Turning it writes a
 * BenchHolidaySwitch row with no person, and the latest row is the
 * setting (founder, 2026-10-03). Every change here also writes an
 * automation log row with the name of whoever made it.
 */

const POLICY_SELECT = {
  name: true, kind: true,
  benchPolicy: true, benchRateBps: true, benchCarryDays: true, reserveBps: true, reserveOnExit: true,
} as const

async function view(companyId: string) {
  const [firm, turns] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: POLICY_SELECT }),
    prisma.benchHolidaySwitch.findMany({
      where: { companyId, personId: null },
      orderBy: { setAt: 'desc' },
      take: 20,
      select: { personId: true, paid: true, setAt: true, setBy: { select: { name: true } } },
    }),
  ])
  const policy: PolicyNow = {
    benchPolicy: firm.benchPolicy,
    benchRateBps: firm.benchRateBps,
    benchCarryDays: firm.benchCarryDays,
    reserveBps: firm.reserveBps,
    reserveOnExit: firm.reserveOnExit,
  }
  return {
    policy: { ...policy, says: policySentence(policy) },
    choices: {
      policies: BENCH_POLICIES.map((value) => ({ value, ...POLICY_WORDS[value] })),
      onExit: RESERVE_ON_EXIT.map((value) => ({ value, means: EXIT_WORDS[value] })),
    },
    holidays: {
      ...firmHolidayView(firm.kind, turns),
      // Every turn, newest first, so the screen can show the history under the switch.
      history: turns.map((t) => turnedSays(asSwitch(t))!),
    },
  }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = await benchPayDesk(caller)
  if (refused) return refused

  return NextResponse.json({ data: await view(caller.company!.id) })
}

/**
 * PATCH /api/settings/bench
 *
 *   { benchPolicy?, benchRateBps?, benchCarryDays?, reserveBps?, reserveOnExit? }
 *   { holidayPay: true | false }
 *
 * Either or both in one call. A policy that could not be paid — part pay
 * with no share, a reserve with nothing held back — is refused in a
 * sentence and nothing is written.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = await benchPayDesk(caller)
  if (refused) return refused

  const companyId = caller.company!.id
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const wantsPolicy = ['benchPolicy', 'benchRateBps', 'benchCarryDays', 'reserveBps', 'reserveOnExit'].some((k) => k in body)
  const wantsHoliday = 'holidayPay' in body

  if (!wantsPolicy && !wantsHoliday) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Nothing to change.' } }, { status: 422 })
  }

  const firm = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: POLICY_SELECT })

  let policyChange: Extract<ReturnType<typeof readPolicyChange>, { ok: true }> | null = null
  if (wantsPolicy) {
    const c = readPolicyChange(body, firm)
    if (!c.ok) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: c.message, field: c.field } }, { status: 422 })
    }
    policyChange = c
  }

  let holidayPay: boolean | null = null
  if (wantsHoliday) {
    const s = readSwitch({ paid: body.holidayPay })
    if (!s.ok) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: s.message, field: 'holidayPay' } }, { status: 422 })
    }
    holidayPay = s.paid
  }

  const messages: string[] = []
  await prisma.$transaction(async (tx) => {
    if (policyChange) {
      await tx.company.update({ where: { id: companyId }, data: policyChange.data })
      const after = { ...firm, ...policyChange.data }
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'BENCH_PAY_POLICY_CHANGED',
          summary: `${caller.person.name} changed the bench pay policy: ${policySentence(after)}`,
          reason: 'Edited in settings by the owner, admin or finance desk',
          payload: {
            changed: policyChange.changed,
            before: {
              benchPolicy: firm.benchPolicy, benchRateBps: firm.benchRateBps, benchCarryDays: firm.benchCarryDays,
              reserveBps: firm.reserveBps, reserveOnExit: firm.reserveOnExit,
            },
            after: policyChange.data,
            byPersonId: caller.person.id,
          },
          reversible: true,
        },
      })
      messages.push('Saved. Bench pay is worked out under the new policy from now on.')
    }
    if (holidayPay != null) {
      await tx.benchHolidaySwitch.create({
        data: { companyId, personId: null, paid: holidayPay, setById: caller.person.id },
      })
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'BENCH_HOLIDAY_PAY_SWITCHED',
          summary: `${caller.person.name} switched ${holidayPay ? 'on' : 'off'} paying public holidays on the bench for ${firm.name}`,
          reason: 'Turned in settings by the owner, admin or finance desk',
          payload: { paid: holidayPay, personId: null, byPersonId: caller.person.id },
          // Turning it back is one more row; this one stays as history.
          reversible: true,
        },
      })
      messages.push(holidayPay ? 'Public holidays on the bench are paid.' : 'Public holidays on the bench are not paid.')
    }
  })

  return NextResponse.json({ data: { ...(await view(companyId)), message: messages.join(' ') } })
}
