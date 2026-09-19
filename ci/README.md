# CI verdict gate

Fails a build when the craft review covering the current UI change is missing,
stale, unreadable, or not green.

The gate reviews nothing itself. It consumes an artifact that `craft-ios-ui`
writes, so adopting it means adopting a workflow where a craft review happens
before merge, not just a script.

| File | Role |
|---|---|
| `gate.mjs` | The gate. Node >= 18, zero dependencies |
| `verdict-artifact-schema.json` | Canonical schema. `gate.mjs` parses it at runtime rather than reimplementing it |
| `selftest.mjs` | 30 cases verifying the gate, including every fail-closed path |

Narrative contract, including how verdicts are derived and what each field
means: `references/review/04-run-artifacts.md`.

## Adoption

**1. Produce an artifact.** Run `craft-ios-ui` and ask it to write the CI
artifact. It is the only skill that runs every specialist, so it is the only one
that can fill the required verdict set honestly; a partial `review-ios-ui` pass
will point you here rather than write a padded artifact with invented verdicts.

The artifact lands in `.claude/apple-ui-craft-artifacts/<short-sha>.json`.
Commit it.

**2. Run the gate in CI.** It is a Node script with no dependencies, so any
runner that has Node 20 will do -- substitute the label your fleet uses for
`<your-runner-label>`:

```yaml
name: ui-craft-gate
on: pull_request

jobs:
  craft-gate:
    runs-on: <your-runner-label>
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # the gate resolves the last UI-touching commit
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: apple-ui-craft verdict gate
        run: node path/to/apple-ui-craft/ci/gate.mjs --repo .
```

`fetch-depth: 0` is not optional. The gate resolves the reviewed sha with
`git log` over UI paths, and a shallow clone will not find it.

**3. Tune the path list if the defaults are wrong.**

```bash
node ci/gate.mjs --repo . --paths '*.swift,*.storyboard,Sources/UI/**'
```

Defaults: `*.swift`, `*.xib`, `*.storyboard`, `*.xcassets`, `*.strings`,
`*.stringsdict`. Deliberately broad -- a missed path means a UI change ships
ungated, which is the failure that matters. An empty list is a usage error, not
a free pass.

## What passes

All four, with no soft option:

1. A schema-valid artifact exists for the reviewed sha.
2. `schemaVersion` matches the schema's `const` exactly.
3. Every present verdict, plus `overall`, is `GREEN`.
4. `blocker_findings` is empty **and** no `CRITICAL` appears anywhere.

`YELLOW` fails. `NOT_ASSESSED` fails.

**`NOT_ASSESSED` failing is deliberate.** It is what a review returns when its
evidence could not reach a dimension -- a screenshots-only pass cannot judge task
flow or adaptive layout. Treating it as a pass would make "review less" the
cheapest route to a green build, inverting the whole evidence rule in
`references/review/02-evidence-pipeline.md`. A gate that cannot see a dimension
has not cleared it.

## Two design rules, both learned from a gate that shipped broken

**The artifact binds to the last UI-touching commit, not `HEAD`.** An artifact
can never name the commit it is committed into: writing it and committing it
changes `HEAD`. A `HEAD`-bound gate is unsatisfiable by its own documented happy
path. Binding to the last UI-touching commit means committing the artifact does
not invalidate it, while the next real UI change does.

**The gate fails closed.** A broken `git` query, an empty path list, a missing
directory, a malformed artifact, or a repo whose history contains no UI-adjacent
commit all **fail**. The tempting alternative -- "no UI-adjacent files changed,
PASS" -- means a gate reports safety whenever its own inputs break, which is
worse than having no gate. `selftest.mjs` pins every one of those paths.

## Verdict key mapping

Artifact keys follow CI naming; findings carry the reviewer's dimension names.

| Artifact key | Review dimensions it summarises |
|---|---|
| `visual` | Liquid Glass, Typography hierarchy, Color system, SF Symbols, Navigation patterns, Layout and spacing, Micro-interactions |
| `usability` | Task flow and journey, Information architecture and navigation structure, Error recovery and state integrity |
| `adaptive` | Adaptive layout and Dynamic Type |
| `accessibility` | VoiceOver, Dynamic Type, Visual, Motor, Cognitive and hearing |
| `motion` | Animation, Haptics (each mapped through its own family; the lower colour wins) |
| `performance` | Rendering, Scroll and list, Launch and memory |
| `density` (optional) | Density and economy |
| `platform` (optional) | Platform integration, Cross-platform reach |

## Verifying the gate

```bash
node ci/selftest.mjs      # 30 cases
```

Run it after any change to `gate.mjs` or the schema. A gate nobody tests can
silently pass everything.
