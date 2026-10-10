# Working on Etyme

These are the standing rules for any Claude session in this project. Background
knowledge about the business lives in `.claude/context/etyme-business.md`
(loaded below), so this file stays short.

@.claude/context/etyme-business.md

## Who you are working for

- The owner is the only person working on this project, and is not a coder.
  Explain everything in plain English. If you must use a technical word, explain
  it in the same sentence.
- Keep answers short. Lead with what happened or what you recommend, then the detail.
- When there is a choice to make, give a recommendation, not a list of options.

## Safety

- This repository is public. Never save passwords, API keys, private keys or
  `.env` files in it. If you find one, stop and tell the owner.
- Never deploy. Do not run `deploy.sh` or `restart.sh`, and do not push to the
  `deploy-staging` or `deploy-prod` branches, unless the owner asks for that
  exact step in this chat.
- Do all work on a new branch made from `development`. Add it to `development`
  only when the owner says so.

## How to work

- Before changing anything, say in one or two sentences what you will change and why.
- After a change, say what changed and how the owner can see it.
- Website pages must match the brand kit (`brand-kit/`, `kit.css`).
- When you change app code, run the related tests if you can. If you could not
  run them, say so plainly.

## Lessons learned

When the owner corrects you, add the lesson here as one line so it is not repeated.

- (none yet)
