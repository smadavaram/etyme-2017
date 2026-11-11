import { passwordSignIn, json, go, Jar, say } from './walk.mjs'
const r = await passwordSignIn('rosa.lindqvist@northbend.example', 'a-long-walk-password-1')
say('Password door for rosa@northbend.example under directory only:', JSON.stringify({ ok: r.ok, location: r.location }))
// the demo door into a Northbend seat
const jar = new Jar()
const d = await go(jar, '/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: 'world-nike', desk: 'hiring' }) })
say('Demo door into a Northbend seat:', d.status)
const q = await json(jar, '/api/requirements')
say('  then a Northbend route:', q.status, q.body?.error?.code, q.body?.error?.message?.slice(0, 90) ?? '')
// 3: the Gmail partner at a hybrid supplier
const g = await passwordSignIn('walk.partner@gmail.com', 'a-long-walk-password-2')
say('Gmail partner at hybrid Brightmoor signs in:', g.ok)
const me = await json(g.jar, '/api/me')
const perms = JSON.stringify(me.body?.data ?? {})
say('  seated:', me.status, 'holds invoices.issue?', perms.includes('invoices.issue'), 'holds payments.record?', perms.includes('payments.record'))
const t = await json(g.jar, '/api/timesheets')
say('  reads timesheets:', t.status)
process.stdout.write('GJAR=' + JSON.stringify([...g.jar.c]) + '\n')
