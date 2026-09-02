# Conductor dispatch protocol (ultracode)

Shared dispatch mechanics for every apple-ui-craft skill running conductor-executor mode.
Skills state WHAT to scope (their split-of-labor table plus dimension-specific reference
sets); this file states HOW to dispatch. Read it once per task, before the first executor
dispatch. Keeping these rules in one file is deliberate: six per-skill copies drifted out
of sync with the fan-out doctrine once already.

## Mode

The session model CONDUCTS -- always the strongest available Claude, whichever model
that is -- and teams of conductor-selected executors (Opus 5 @ `xhigh` for every
dispatched agent, Sonnet 5 @ `xhigh` for non-coding grunt only -- the lane table below)
run the scoped stages: the specialist reviews, the architect, `craft-team-lead` when it is
dispatched as a subagent rather than read inline, every stage that writes or modifies UI
code, and the grunt stages (recon inventory, evidence collection, instrumentation sweeps).
Judgment work never moves down: severity grades, rankings, apply/no-apply decisions,
design origination, and final synthesis are conductor-class (the session model) or
specialist-class (the reviewer agents, pinned to Opus 5 at dispatch), always.

## Model lanes

Pinned at DISPATCH, never in agent frontmatter. Undated aliases only.

| Lane | Pin | Runs |
|---|---|---|
| Opus lane -- every dispatched agent: judgment work (review, design, verify) and ordinary code alike | `model: "opus"` (Opus 5 @ `xhigh`) | Every specialist reviewer, the architect, `craft-team-lead` when dispatched; recon and inventory, per-screen evidence collection (evidence, never verdicts), instrumentation sweeps, component scaffolding, and post-approval application of UI changes |
| Sonnet lane -- non-coding grunt only | `model: "sonnet"` (Sonnet 5 @ `xhigh`) | Data collation, doc transforms from a full template, find-stages that only locate and never judge |
| Session model -- orchestrator only, never dispatched to itself | no pin; runs in the main context | Scope decisions, severity verdicts, dedup and conflict resolution, apply/no-apply judgment, final synthesis |

Judgment never moves down a lane: a specialist review, a design origination, or a verdict is
never a Sonnet stage. Nothing here blocks on a specific model -- dispatch with the pinned
alias, or, when the session model is already the strongest available tier and the stage is
small, run it inline in the main context instead.

## Dispatch mechanics

- Plugin specialist agents (`apple-ui-craft:*`) carry no `model` pin in their frontmatter
  but are pinned to `model: "opus"` (Opus 5) at dispatch -- judgment reviewers, never
  grunt executors. The same pin covers `craft-team-lead` dispatched as a subagent and
  every stage that writes or modifies UI code (component scaffolding, the post-approval
  apply step):

```
Agent({
  subagent_type: "general-purpose",
  model: "opus",
  prompt: "<body of agents/apple-ui-reviewer.md>\nPLUGIN ROOT: <abs-path>\nREFERENCES: <abs-path>/references/  SCOPE: <files>  BLACKBOARD: <path>",
  description: "Apple UI review"
})
```

- Non-UI grunt stages: `Agent({subagent_type: "general-purpose", model: "sonnet", prompt:
  <scoped briefing>})` -- a session at xhigh means Sonnet executors inherit xhigh. The
  conductor may instead pick `model: "opus"` per the lane table above when the task
  warrants it. In
  Workflow scripts pass `{model: 'sonnet', effort: 'xhigh'}` (or `{model: 'opus'}`)
  explicitly.
  Executors are always plain `general-purpose` with the scoped briefing inlined.
- Never omit `model` on a dispatch -- an omitted pin silently inherits the session model
  and is denied.
- Every dispatch prompt carries `PLUGIN ROOT: <abs>` and `REFERENCES: <abs>/references/`;
  a specialist that cannot resolve `references/` reviews from memory and says so.
- The executor-model gate is task TYPE, not agent count -- a single executor-class
  dispatch is fine.

## Fan-out

- Scale executor teams to the scope's natural breadth (one executor per screen group,
  surface, component family, or file set) -- never a round-number quota.
- Conductor-managed Sonnet/Opus executors are exempt from the session-model agent caps;
  the <=10/wave, <=20/turn caps apply to session-model agents only. More than 20 Opus
  executors in one turn still needs user sign-off.
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

Never Haiku. Never Sonnet below `xhigh`. Never an omitted `model`. Never a dated model
ID. Never an executor verdict. Never a specialist review or a UI change below the Opus
lane. Nothing in this protocol may block on, or wait for, a specific unavailable model --
if the session model is already the strongest available tier and a non-UI grunt stage is
small enough, the conductor may run it inline in the main context instead of dispatching,
without weakening any read-only or isolation guarantee a specialist agent carries.
