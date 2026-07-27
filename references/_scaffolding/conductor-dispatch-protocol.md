# Conductor dispatch protocol (ultracode)

Shared dispatch mechanics for every apple-ui-craft skill running conductor-executor mode.
Skills state WHAT to scope (their split-of-labor table plus dimension-specific reference
sets); this file states HOW to dispatch. Read it once per task, before the first executor
dispatch. Keeping these rules in one file is deliberate: six per-skill copies drifted out
of sync with the fan-out doctrine once already.

## Mode

The session model CONDUCTS -- always the strongest available Claude, whichever model
that is -- and teams of conductor-selected executors (Sonnet 5 @ `xhigh` or Opus 5 --
rubric in your conductor policy § Executor model selection) run the scoped grunt
stages.
Judgment work never moves down: severity grades, rankings, apply/no-apply decisions,
design origination, and final synthesis are conductor-class (the session model) or
specialist-class (the reviewer agents, pinned to Opus 5 at dispatch), always.

## Dispatch mechanics

- Agent tool: `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped
  briefing>})` -- a session at xhigh means Sonnet executors inherit xhigh. The conductor
  may instead pick `model: "opus"` per the rubric in your conductor policy §
  Executor model selection when the task warrants it. In Workflow scripts pass
  `{model: 'sonnet', effort: 'xhigh'}` (or `{model: 'opus'}`) explicitly.
- Plugin specialist agents (`apple-ui-craft:*`) carry no `model` pin in their frontmatter
  but are pinned to `model: "opus"` (Opus 5) at dispatch -- judgment reviewers, never
  grunt executors.
  Executors are always plain `general-purpose` with the scoped briefing inlined.
- The executor-model gate is task TYPE, not agent count -- a single executor-class
  dispatch is fine.

## Fan-out

- Scale executor teams to the scope's natural breadth (one executor per screen group,
  surface, component family, or file set) -- never a round-number quota.
- Conductor-managed executors (Sonnet or Opus) are exempt from the session-model agent
  caps; the <=10/wave, <=20/turn caps apply to session-model agents only. More than 20
  Opus executors in one turn still needs user sign-off.
- Every dispatch loop needs a hard iteration cap; Workflow loops also guard on
  `budget.remaining()`.
- Executors writing files in parallel use `isolation: "worktree"`; read-only sweeps do
  not.

## Executor prompt contract

Every executor prompt MUST inline (the invoking skill adds its dimension-specific items
on top):

1. The exact file/surface set the executor owns (non-overlapping) and the deliverable
   format.
2. Absolute paths of the reference files for its dimension plus
   `references/_scaffolding/version-floor-registry.md`.
3. `BLACKBOARD: <path>` (first token = path) plus the escalation rule: 2 failed attempts
   at the same step, or spec ambiguity -> write `## ESCALATE` (blocker, options,
   recommendation) to the blackboard and return early instead of guessing.
4. The instruction that executors report evidence, never verdicts -- the conductor grades.

## Validation gate (before anything reaches the user)

Read the executor's blackboard, never the truncated final message alone. Spot-check
claims against the files, re-grade severity, and check the dispatch's acceptance criteria
item by item. For file-writing executors, review the `git diff`. One re-dispatch on
failure, with the concrete findings inlined; on a second failure the conductor takes the
work over directly. Never a third executor attempt.

## Hard invariants

Never Haiku. Never Sonnet below `xhigh`. Never an executor verdict. Nothing in this protocol
may block on, or wait for, a specific unavailable model -- if the session model
is already the strongest available tier and a stage is small enough, the conductor may run
it inline in the main context instead of dispatching, without weakening any read-only or
isolation guarantee a specialist agent carries.
