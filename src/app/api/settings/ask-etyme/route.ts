import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { askTheDesk, hasAnyPermission, hasPermission } from '@/lib/permissions'
import { modelPromptsFor, modelSetUpHere, modelSwitchFor, setModelOn } from '@/lib/model-boundary'
import { allowanceUsageFor } from '@/lib/model-allowance'

/**
 * GET   /api/settings/ask-etyme — whether Ask Etyme may send free-text
 *       questions to the model for this company, who set it and when, and
 *       the last twenty prompts that left, masked.
 * PATCH /api/settings/ask-etyme { on, reason } — turn it on or off; the
 *       answer is the switch as the panel draws it, with who and when.
 *
 * Read by the desks that read the company's rules; changed only by the
 * settings desk (founder, 2026-10-13, "The model boundary"). The rules are
 * lib/model-boundary; this finds the caller's company and says the answer
 * in a sentence.
 */
const READERS = ['settings.manage', 'governance.read'] as const

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Ask Etyme is set for a company, and you are not signed in at one.' } }, { status: 403 })
  }
  if (!hasAnyPermission(caller.permissions, [...READERS])) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Reading what Ask Etyme sends to the model', needs: [...READERS], kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  const [model, prompts, allowance] = await Promise.all([
    modelSwitchFor(caller.company.id),
    modelPromptsFor(caller.company.id, 20),
    // Usage in plain words beside the log (lib/model-allowance): the
    // company's month and the reader's own day, never another person's.
    allowanceUsageFor(caller.company.id, caller.person.id).then((u) => ({ lines: u.lines })).catch(() => null),
  ])
  return NextResponse.json({
    data: {
      ...model,
      // Whether this deployment has a model at all. With the switch on and
      // no key, nothing leaves, and the panel says so rather than implying
      // questions go somewhere.
      modelSetUp: modelSetUpHere(),
      canEdit: hasPermission(caller.permissions, 'settings.manage'),
      prompts,
      allowance,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Ask Etyme is set for a company, and you are not signed in at one.' } }, { status: 403 })
  }
  if (caller.isService || !hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Turning the model on or off for Ask Etyme', needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  const body = await request.json().catch(() => ({}))
  if (typeof body.on !== 'boolean') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say on or off.', field: 'on' } }, { status: 422 })
  }
  const out = await setModelOn(caller.company.id, caller.person.id, body.on, typeof body.reason === 'string' ? body.reason : '')
  if (!out.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: out.says, field: 'reason' } }, { status: 422 })
  }
  // The answer is what the panel draws, so it never has to guess who set it.
  const now = await modelSwitchFor(caller.company.id)
  const modelSetUp = modelSetUpHere()
  return NextResponse.json({
    data: {
      ...now,
      modelSetUp,
      canEdit: true,
      message: !out.on
        ? 'Off. Ask Etyme answers from the rules only and sends nothing to the model.'
        : modelSetUp
          ? 'On. A question the rules do not answer may be sent to the model, masked, and every one is logged below.'
          : 'On, recorded. The model is not set up on this deployment yet, so nothing leaves until it is.',
    },
  })
}
