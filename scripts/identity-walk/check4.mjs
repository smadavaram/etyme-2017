import { json, go, Jar, say } from './walk.mjs'
const id = process.argv[2]
const sup = new Jar()
await go(sup, '/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: 'world-techpeple' }) })
const one = await json(sup, `/api/timesheets/${id}`)
say('Techpeple opens a Brightmoor week it is not party to:', one.status, one.body?.error?.message?.slice(0, 100) ?? '')
const list = await json(sup, '/api/timesheets')
const rows = list.body?.data?.timesheets ?? list.body?.data?.rows ?? list.body?.data ?? []
say('Techpeple timesheet list:', list.status, Array.isArray(rows) ? rows.length : Object.keys(list.body?.data ?? {}).join(','), 'contains the Brightmoor week?', JSON.stringify(list.body).includes(id))
