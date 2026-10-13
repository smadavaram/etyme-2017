import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { askTheDesk, hasAnyPermission, hasPermission } from '@/lib/permissions'
import { modelPromptsFor, modelSwitchFor, setModelOn } from '@/lib/model-boundary'

/**
 * GET   /api/settings/ask-etyme — whether Ask Etyme may send free-text
 *       questions to the model for this company, who set it and when, and
 *       the last twenty prompts that left, masked.
 * PATCH /api/settings/ask-etyme { on, reason } — turn it on or off.
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
  const [model, prompts] = await Promise.all([modelSwitchFor(caller.company.id), modelPromptsFor(caller.company.id, 20)])
  return NextResponse.json({
    data: {
      ...model,
      // Whether this deployment has a model at all. With the switch on and
      // no key, nothing leaves, and the panel says so rather than implying
      // questions go somewhere.
      modelSetUp: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      canEdit: hasPermission(caller.permissions, 'settings.manage'),
      prompts,
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
  return NextResponse.json({
    data: {
      on: out.on,
      message: out.on
        ? 'On. Ask Etyme may send free-text questions to the model, masked, and every one is logged below.'
        : 'Off. Ask Etyme answers from the rules only and sends nothing to the model.',
    },
  })
}
