# Dispatch protocol

Shared dispatch mechanics for every apple-ui-craft skill. Skills state WHAT to scope (their
split-of-labor table plus dimension-specific reference sets); this file states HOW to dispatch.
Read it once per task, before the first dispatch. Keeping these rules in one file is deliberate:
six per-skill copies drifted out of sync once already.

## Dispatch policy

Three rules, and nothing else about models belongs in this plugin:

1. **The dispatching session chooses the model, per dispatch.** Dispatch on the model the
   session chooses (Opus 5 is the usual default for design, review and implementation). Never
   pin `model:` or `effort:` on a dispatch, and never put a model pin in agent frontmatter.
2. **Judgment stays with the session that dispatched.** Severity grades, rankings,
   apply/no-apply decisions, design origination, and final synthesis are the dispatching
   session's. A specialist returns what it found; the session decides what it means.
3. **Output goes in the final message.** A dispatched agent writes its findings to a file
   only if they exceed a few KB, and then returns the path; otherwise it returns them
   directly. There is no report-file contract to satisfy.

## Dispatch mechanics

- Plugin specialist agents (`apple-ui-craft:*`) are dispatched as `general-purpose` with the
  agent file's body inlined as the prompt prefix:

```
Agent({
  subagent_type: "general-purpose",
  prompt: "<body of agents/apple-ui-reviewer.md>\nPLUGIN ROOT: <abs-path>\nREFERENCES: <abs-path>/references/  SCOPE: <files>",
  description: "Apple UI review"
})
```

- Every dispatch prompt carries `PLUGIN ROOT: <abs>` and `REFERENCES: <abs>/references/`;
  a specialist that cannot resolve `references/` reviews from memory and says so.
- A small stage runs inline in the main context. Dispatching buys a separate scope and a
  separate context window -- it is not a step every stage has to pass through.

## Fan-out

- Scale a team to the scope's natural breadth: one agent per screen group, surface, component
  family, or file set. Never a round-number quota.
- Every dispatch loop carries a hard iteration cap.
- Agents writing files in parallel use `isolation: "worktree"`; read-only sweeps do not.

## What a dispatch prompt carries

Every specialist prompt inlines this much (the invoking skill adds its dimension-specific
items on top):

1. The exact file or surface set the agent owns -- non-overlapping -- and the deliverable
   format.
2. Absolute paths of the reference files for its dimension, plus
   `references/_scaffolding/version-floor-registry.md`.
3. Whether it is collecting evidence or forming a verdict, so it knows which one to return.
4. The escalation rule: two failed attempts at the same step, or genuine spec ambiguity ->
   report the blocker, the options, and a recommendation, and return early instead of guessing.

## Reading what comes back

Spot-check the claims against the files before anything reaches the user, and read the
`git diff` when the agent wrote files. Re-dispatch once with the concrete gap named; on a
second failure, take the work over directly rather than trying a third time.
