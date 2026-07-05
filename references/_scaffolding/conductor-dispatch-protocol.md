# Conductor dispatch protocol (ultracode)

Shared dispatch mechanics for every apple-ui-craft skill running conductor-executor mode.
Skills state WHAT to scope (their split-of-labor table plus dimension-specific reference
sets); this file states HOW to dispatch. Read it once per task, before the first executor
dispatch. Keeping these rules in one file is deliberate: six per-skill copies drifted out
of sync with the fan-out doctrine once already.

## Mode

The session model CONDUCTS -- always the strongest available Claude, whichever model
that is -- and teams of Sonnet 5 executors at `xhigh` effort run the scoped grunt stages.
Judgment work never moves down: severity grades, rankings, apply/no-apply decisions,
design origination, and final synthesis are conductor-class or specialist-class (running
on the session model), always.

## Dispatch mechanics

- Agent tool: `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped
  briefing>})` -- a session at xhigh means executors inherit xhigh. In Workflow scripts
  pass `{model: 'sonnet', effort: 'xhigh'}` explicitly.
- Plugin specialist agents (`apple-ui-craft:*`) stay on the session model (`model`
  omitted from their frontmatter -- it inherits) -- judgment reviewers, never executors.
  Sonnet executors are always plain `general-purpose` with the scoped briefing inlined.
- The Sonnet gate is task TYPE, not agent count -- a single executor-class dispatch is
  fine.

## Fan-out

- Scale executor teams to the scope's natural breadth (one executor per screen group,
  surface, component family, or file set) -- never a round-number quota.
- Conductor-managed Sonnet-5-xhigh executor teams are exempt from the session-model agent
  caps; the <=10/wave, <=20/turn caps apply to session-model agents only.
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

Never Haiku. Never Sonnet below `xhigh`. Never a Sonnet verdict. Nothing in this protocol
may block on, or call out to, a model that isn't the session model -- if the session model
is already the strongest available tier and a stage is small enough, the conductor may run
it inline in the main context instead of dispatching, without weakening any read-only or
isolation guarantee a specialist agent carries.
