## Three skill sets copied in as files — 2026-11-16

**What he said.** This web environment cannot install plugins, so the
founder chose to bring three Markdown-based plugins in as project files,
in Claude Code's own layout:
- Superpowers (github.com/obra/superpowers, MIT): its skills.
- Karpathy skills (github.com/multica-ai/andrej-karpathy-skills, formerly
  forrestchang/andrej-karpathy-skills, MIT): the skill, with its
  guidelines appended to CLAUDE.md.
- I have ADHD (github.com/ayghri/i-have-adhd, MIT): its skill, kept
  invocable and never always-on.

He set five rules:
1. Fetch from those repositories only.
2. Markdown only: no scripts, no binaries, no change to application code
   or build config.
3. Keep every license file.
4. Leave Claude Octopus out: it is an orchestration plugin, not Markdown.
5. Run this as a small side batch.

**What landed.**
- `.claude/skills/`: fifteen Superpowers skills (65 Markdown files),
  `karpathy-guidelines/SKILL.md` and `i-have-adhd/SKILL.md`.
- `.claude/skills/_licenses/`: Superpowers' and I have ADHD's license
  files, and a README naming each source, commit and license.
- Superpowers is at commit 22f0b463, Karpathy skills at 2c606141 and I
  have ADHD at 1ecea199.
- The Karpathy guidelines are at the end of CLAUDE.md. Every rule above
  them wins where the two differ.

**What does not carry over from a real plugin install.**
- Superpowers' session-start hook, which loads `using-superpowers` into
  every conversation, does not run. The skills are found by their
  descriptions like any project skill.
- The skill scripts were not copied: the brainstorming visual server,
  the plan and subagent task helpers, the graph renderer, and the
  debugging helpers. Where a skill tells an agent to run one, there is
  nothing to run.
- I have ADHD's always-on hook was not copied. Its skill keeps
  `disable-model-invocation: true`, so only a person typing
  `/i-have-adhd` turns it on.
- No plugin manifest, so nothing appears in a plugin list and nothing
  updates on its own. Updating means copying again.

**Where.** The files are committed on the working branch of the source
repository. They reach the product repository, etyme2040, unchanged with
the next gated deploy, which replays the whole tree, `.claude/` and
CLAUDE.md included. A commit made directly to etyme2040's main would
deploy production outside the gates, and the next replay would undo it.
