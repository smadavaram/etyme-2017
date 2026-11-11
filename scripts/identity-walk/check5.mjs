import { directorySignIn, json, say } from './walk.mjs'
const T = process.argv[2]
const H = { authorization: `Bearer ${T}`, 'content-type': 'application/scim+json' }
let r = await fetch(`http://localhost:3123/scim/v2/Users?filter=${encodeURIComponent('userName eq "ines.okafor@northbend.example"')}`, { headers: H })
const id = (await r.json()).Resources[0].id
r = await fetch(`http://localhost:3123/scim/v2/Users/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ Operations: [{ op: 'replace', value: { active: true } }] }) })
say('SCIM turns Ines back on:', r.status, (await r.json()).active)
const ines = await directorySignIn('ines.okafor@northbend.example', 'nb-0001')
say('Ines signs in again:', ines.ok)
const ov = await json(ines.jar, '/api/settings/sign-in/overview')
const ev = ov.body?.data?.events ?? []
const seen = [...new Set(ev.map((e) => e.action))]
say('Activity feed:', ov.status, ev.length, 'rows; events:', seen.join(', '))
for (const e of ev.slice(0, 8)) say('  ', e.action, e.allowed ? '' : '(refused)', e.surface, '·', e.says.slice(0, 110))
const g = await json(ines.jar, '/api/settings/sign-in/groups', { method: 'POST', body: JSON.stringify({ groupId: 'nb-owners', roleId: 'x' }) })
say('Map a group to an unknown role:', g.status, g.body?.error?.message)
