import { passwordSignIn, json, go, Jar, say } from './walk.mjs'
const seat = process.argv[2]
const g = await passwordSignIn('walk.partner@gmail.com', 'a-long-walk-password-2')
say('Gmail partner in:', g.ok, (await json(g.jar, '/api/timesheets')).status)
const owner = new Jar()
const d = await go(owner, '/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: 'world-brightmoor' }) })
say('Brightmoor Owner by the demo door:', d.status)
const rv = await json(owner, `/api/access/${seat}`, { method: 'POST', body: JSON.stringify({ action: 'revoke', reason: 'Demo walk: the partner leaves' }) })
say('Owner revokes the Gmail seat:', rv.status, rv.body?.error?.message ?? rv.body?.data?.says ?? '')
const after = await json(g.jar, '/api/timesheets')
say('Gmail partner next request:', after.status, after.body?.error?.message?.slice(0, 100) ?? '')
// 4: a supplier seat reads only its own supplier's records
const sup = new Jar()
await go(sup, '/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: 'world-techpeple' }) })
const me = await json(sup, '/api/me')
const mine = me.body?.data?.activeContext?.company?.id
const ts = await json(sup, '/api/timesheets?limit=200')
const rows = ts.body?.data ?? []
const foreign = rows.filter((t) => ![t.sellContract?.companyId, t.buyContract?.companyId, t.companyId, t.supplierCompanyId].includes(mine))
say('Techpeple timesheets:', ts.status, rows.length, 'rows; sample keys', Object.keys(rows[0] ?? {}).slice(0, 12).join(','))
say('  rows not naming Techpeple on any side:', foreign.length)
