# Vendored skills: sources and licenses

These skills were copied as Markdown files on 2026-11-16, at the founder's
instruction. This environment cannot install plugins, so only the
Markdown came over. No script, hook, binary or package file was copied.

| Skills in .claude/skills | Source | Commit | License |
|---|---|---|---|
| brainstorming, diagnosing-superpowers, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills | github.com/obra/superpowers | 22f0b463e7a5e579904dd6211a520321035526f7 (2026-11-03) | MIT, Copyright (c) 2025 Jesse Vincent. Full text in `_licenses/superpowers/LICENSE` |
| karpathy-guidelines | github.com/multica-ai/andrej-karpathy-skills (formerly forrestchang/andrej-karpathy-skills) | 2c606141936f1eeef17fa3043a72095b4765b9c2 (2026-04-20) | MIT, as its README states. The repository holds no separate license file. |
| i-have-adhd | github.com/ayghri/i-have-adhd | 1ecea1993b7fce257ffbd686c070948b5e07eda6 (2026-10-11) | MIT. Full text in `_licenses/i-have-adhd/LICENSE` |

Superpowers' hooks, its session-start automation and its skill scripts
are not here. They would not run in this environment, and the founder
asked for Markdown only. i-have-adhd's always-on hook is not here either.
Its skill keeps `disable-model-invocation: true`, so it runs only when
somebody types `/i-have-adhd`.
