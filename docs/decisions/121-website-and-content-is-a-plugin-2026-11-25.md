# 121 — Website and content is a plugin, off by default — 2026-11-25

**The owner ruled, as relayed by the tester (BA and architect): both are plugins.**

Website and content is one plugin, not two. It gates the tenant's public
website and its content editor together. It is off by default for every
tenant.

## What it covers, and what it does not

- **The firm's identity stays on the record.** Its name, logo and
  contact details stay whether the plugin is on or off. The plugin
  gates the public site and the editor, never the identity that the
  invoices use.
- **Etyme's own site is never a tenant plugin.** It belongs to the
  platform.

## Before the site goes public

All three must be true:

1. The firm's Owner has approved the branding.
2. The firm's own domain points at the door.
3. Where the firm's business requires a compliance pass, it has passed one.

## Switching

- **Switching off** takes the site dark and hides the editor. The
  content is kept, never deleted.
- **Who switches** follows record 120. The tenant's Owner switches
  their own. A Superadmin may switch it, switch only, logged, and
  shown to the Owner. No agent ever switches it.
- **The two existing tenants' doors start off.** They render today but
  were never launched.

## Build order

The website and content module is the third module, after train-to-bench
and pods. It goes through its own plan gate. Its flag is carried in the
switch build now.

## Overtaken, 2026-11-26

The two live doors are grandfathered and the deploy takes nothing dark (record 123, the tester's follow-up rulings and six answers).
