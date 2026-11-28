# 131. Pax makes deployment decisions — 2026-11-27

## The owner's words

On 2026-11-27, after the Friday deploy of batch 4647b73e9: *"I have hired
pax to make deployment decisions"*.

## What it decides

- Pax, the architect, decides when a batch deploys, and which batch. His
  word in session is enough; it no longer goes back to the owner.
- The weekend rule of record 107 stands as the default, and Pax may make an
  exception to it, as the owner did on Nov 26 and Nov 27.
- Every gate still holds: the release check green, reviewers' blockers
  fixed, the replay gates, and the smoke after. Pax decides when, never
  whether a red batch ships.
- Merging a pull request is a separate decision; a deploy authorization does
  not merge one.
- Money, signing, a person and outside sends stay with the owner (record 123).

## What happened that day

Pax authorized batch 4647b73e9 on Friday. The lead held it under record 107
and the development branch's "never deploy unless the owner asks" line; the
owner then said "Go ahead and deploy". It went out as deploy 32609ec5, and the
public smoke passed.
