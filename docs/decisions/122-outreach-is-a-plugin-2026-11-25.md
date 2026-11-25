# 122 — Outreach is a plugin, off by default — 2026-11-25

**The owner ruled, as relayed by the tester (BA and architect).**

Outreach gates every outbound letter and campaign sent in the firm's
name. It is off by default for every tenant, the internal tenant
included.

## While it is off

Nothing is sent. Drafting is allowed, because a draft sends nothing.

## While it is on

The standing rules still bind:

- the mass-mail rules (record 116);
- one yes per task;
- agents never send beyond an approved task.

## Switching

Switching follows record 120. The tenant's Owner switches their own. A
Superadmin may switch it, switch only, logged, and shown to the Owner.
No agent ever switches it.

## Build order

Outreach is the fourth module, after website and content. It goes
through its own plan gate. Its flag is carried in the switch build now.
