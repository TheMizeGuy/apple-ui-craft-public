# Dispatch protocol

Shared dispatch mechanics for every apple-ui-craft skill. Skills state WHAT to scope (their
split-of-labor table plus dimension-specific reference sets); this file states HOW to dispatch.
Keeping these rules in one file is deliberate: six per-skill copies drifted out of sync once
already.

## Dispatch policy

1. **The session picks the model for each dispatch.** Nothing in this plugin sets a model or
   an effort level: agent frontmatter carries no model pin, and no skill or agent names one.
2. **Judgment happens where the whole picture is.** Severity calibration across screens,
   dedup, conflict resolution, rankings, and apply/no-apply decisions need every result in
   view, so they happen where the results come together: each specialist grades its own
   dimension, and the merge reconciles them. An evidence sweep on a wide scope sees only its
   slice, so it returns what it found rather than a verdict.
3. **Output goes in the final message.** A dispatched agent writes its findings to a file
   only if they exceed a few KB, and then returns the path; otherwise it returns them
   directly.

## Dispatch mechanics

- The skills dispatch specialists by their plugin name (`apple-ui-craft:<agent>`). The
  exception is `craft-ios-ui`: `craft-team-lead` needs the `Agent` tool to dispatch its team,
  and `Agent` access depends on runtime tool grants and nesting depth, so the lead is
  dispatched as `general-purpose` with its agent-file body inlined as the prompt prefix.
- The lead also inlines each of its five specialists' bodies under `general-purpose`. A
  specialist needs no `Agent` tool, and that dispatch drops its read-only tool grant (its
  frontmatter carries no `Edit` or `Write`), so each specialist prompt states that it is
  read-only: the inlined body carries the specialist's own read-only rule, which is why the
  body goes in whole.

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
4. What to do when blocked: on genuine spec ambiguity or a step that will not yield, report
   the blocker, the options, and a recommendation instead of guessing.

## Reading what comes back

Spot-check the claims against the files before anything reaches the user, and read the
`git diff` when the agent wrote files. Re-dispatch once with the concrete gap named; on a
second failure, take the work over directly rather than trying a third time.
