# Run Artifacts: the Review Ledger and the CI Verdict

> Owner: `references/review/04-run-artifacts.md` owns both persisted data contracts -- the review ledger a skill writes into the REVIEWED repo, and the CI verdict artifact a gate consumes. Finding shape, severity and confidence come from `references/review/01-finding-format.md`; this file owns only what gets written to disk and how it is read back. Both schemas are versioned independently.

A review that leaves nothing behind cannot answer the second-most-useful
question a user asks, which is not "what is wrong" but **"what changed since
last time"**. These two files are how the plugin answers it, and how a CI job
can act on a verdict it did not itself produce.

## Finding (canonical, used in both artifacts)

```json
{
  "id": "<dimension-slug>-<kebab-slug>",
  "dimension": "<a verbatim entry from the dimension registry>",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|NIT",
  "confidence": "Hard defect|Quality defect|Pattern smell|Taste note",
  "file": "<repo-relative path>",
  "line": 42,
  "title": "<short>",
  "evidence": "<optional>"
}
```

`line` and `evidence` are optional. When `line` is present the CI schema requires
an integer `>= 1`, so **omit the key rather than writing 0**. The dimension
registry lives in `references/review/01-finding-format.md`; the CI schema carries
a coarser enum, explained below.

## Review ledger, schema v1

**Path (in the reviewed repo, not this one):** `.claude/apple-ui-craft/last-review.json`

Written on every run, without asking, by `review-ios-ui`, `craft-ios-ui`,
`optimize-ios-ui`, `audit-accessibility` and `integrate-platform`.
`design-ios` writes none: it generates rather than reviews, so it has no prior
run to diff against.

```json
{
  "schemaVersion": 1,
  "timestamp": "<ISO-8601>",
  "scope": "<the resolved scope that produced this run>",
  "commit": "<git sha if available>",
  "evidenceMode": "Runtime|Source|Screenshots|Design file",
  "dimensions": [ "<each dimension actually reviewed this run>" ],
  "notAssessed": [ "<dimensions the evidence mode could not reach>" ],
  "findings": [ /* canonical finding shape, each with "status": "open" */ ]
}
```

### Reading it back: the delta report

The next run against the same scope matches its fresh findings against this file
on `id` + `file`:

| Condition | Reported as |
|---|---|
| Absent from the ledger | **NEW** |
| In the ledger, absent now, re-verified as actually fixed | **RESOLVED** |
| In both at the same severity | **STILL OPEN** |
| Higher severity now | **REGRESSED** |
| Lower severity now | **IMPROVED** |

Two fields exist to prevent a narrower run from lying about a wider one:

- **`dimensions`** -- a prior finding whose dimension is not in THIS run's
  `dimensions` is carried forward unchanged, never counted RESOLVED. Without
  this, running `optimize-ios-ui` after `craft-ios-ui` would report every
  accessibility finding as fixed, because nobody looked.
- **`notAssessed`** -- a dimension the prior run could not reach is not evidence
  of anything. A finding under it is carried forward, and the delta report says
  the dimension was not assessed rather than implying a clean history.

A missing or unreadable ledger is an **empty prior run** (everything reports
NEW), never an error. A ledger from a different `scope` is not a prior run for
this scope; either diff against nothing or say which scope you are comparing to.

Nothing outside this plugin parses the ledger, so its `schemaVersion` is
informational rather than enforced. Every skill that writes one must still write
the same shape: a ledger written by one skill and read by another is the entire
point.

## CI verdict artifact, schema v1

**Canonical schema:** `ci/verdict-artifact-schema.json`. `ci/gate.mjs` parses
that file at runtime rather than reimplementing it, so the schema is the single
source of truth for the enums.

**Path (in the reviewed repo):** the configured artifact directory, default
`.claude/apple-ui-craft-artifacts/<short-sha>.json`.

```json
{
  "schemaVersion": 1,
  "sha": "<git sha, lowercase hex 7-40, REQUIRED: the gate's binding key>",
  "pr": "<pr number, optional lookup convenience, never a substitute for sha>",
  "timestamp": "<ISO-8601>",
  "reviewer": "craft-team-lead",
  "scope": "<resolved scope>",
  "evidenceMode": "Runtime|Source|Screenshots|Design file",
  "verdicts": {
    "visual": "GREEN|YELLOW|RED",
    "usability": "GREEN|YELLOW|RED|NOT_ASSESSED",
    "adaptive": "GREEN|YELLOW|RED|NOT_ASSESSED",
    "accessibility": "GREEN|YELLOW|RED|NOT_ASSESSED",
    "motion": "GREEN|YELLOW|RED|NOT_ASSESSED",
    "performance": "GREEN|YELLOW|RED|NOT_ASSESSED",
    "density": "<optional>",
    "platform": "<optional: genuinely inapplicable on some projects>"
  },
  "overall": "GREEN|YELLOW|RED",
  "blocker_findings": [ /* canonical shape, the CRITICAL findings */ ],
  "high_findings": [ /* canonical shape, the HIGH findings */ ]
}
```

### Verdict derivation

Each review dimension has a four-point family. Best token maps to **GREEN**,
second to **YELLOW**, third and fourth to **RED**:

| Artifact key | Family | GREEN | YELLOW | RED |
|---|---|---|---|---|
| `visual` | Apple-native | APPLE-NATIVE | CLOSE | NEEDS WORK, GENERIC |
| `usability` | Flow | COMPLETABLE | WORKABLE | OBSTRUCTED, BROKEN |
| `adaptive` | Adaptation | ROBUST | ADEQUATE | FRAGILE, BROKEN |
| `accessibility` | Inclusion | INCLUSIVE | ADEQUATE | GAPS, EXCLUDING |
| `motion` | Feel | FLUID | ADEQUATE | STIFF, BROKEN |
| `performance` | Smoothness | SMOOTH | ADEQUATE | JANKY, BROKEN |
| `density` | Economy | EARNED | ACCEPTABLE | WASTEFUL, STRETCHED-PHONE |
| `platform` | Integration | DEEPLY INTEGRATED | SURFACE-LEVEL | UNTAPPED |

**`NOT_ASSESSED` is a first-class value on the four evidence-bounded keys and it
FAILS the gate.** That is deliberate. The alternative -- treating it as a pass --
would make a screenshots-only review a way to get a green build, which inverts
the entire evidence rule in `references/review/02-evidence-pipeline.md`. A gate
that cannot see a dimension has not cleared it.

`platform` and `density` may be omitted, because only those two can be
genuinely inapplicable to a project.

### What the gate requires

`ci/gate.mjs` passes only when **all** of these hold:

1. A schema-valid artifact exists for the reviewed sha.
2. `schemaVersion` equals the schema's `const`. Any other value is a hard reject,
   not a warning.
3. Every present verdict, and `overall`, is `GREEN`.
4. `blocker_findings` is empty, **and** no finding anywhere in the artifact
   carries `severity: "CRITICAL"`. A GREEN verdict shipped alongside a blocker is
   a self-contradicting artifact, not a judgement call.

There is no soft pass. `YELLOW` fails. `NOT_ASSESSED` fails. A missing artifact,
a malformed one, a wrong `schemaVersion`, and a sha mismatch all fail.

### The sha binding, and why it is not HEAD

**The reviewed sha is the last commit that touched a UI-adjacent path, and
deliberately not `HEAD`.** An artifact can never name the commit it is committed
into: writing the artifact and committing it changes `HEAD`, so a gate binding to
`HEAD` makes its own documented happy path unsatisfiable. Binding to the last
UI-touching commit means committing the artifact does not invalidate it, while
the next real UI change does.

The gate also **fails closed**. If the git query for that sha errors, or the
UI-path pattern list is empty, the gate fails rather than reporting "no
UI-adjacent files changed, PASS". A gate that passes when its own inputs are
broken is worse than no gate, because it reports safety it never checked.

### Changing the schema

Widening an enum is a schema change, not an edit:

1. Edit `ci/verdict-artifact-schema.json` (canonical).
2. Bump `schemaVersion`'s `const` there.
3. Update the two surfaces that restate the shape: this file and `ci/README.md`.
4. Re-run `node ci/selftest.mjs`.

All in the same commit. The gate hardcodes nothing about the enums; it reads the
schema. But the `id` pattern must be widened alongside a `dimension` enum, or
findings with the new value fail on the id slug instead and the error points at
the wrong field.

## Which skill writes what

| Skill | Ledger | CI artifact |
|---|---|---|
| `design-ios` | no (generates, does not review) | no |
| `review-ios-ui` | yes | no -- it is a 3-specialist pass and cannot fill the required verdict set |
| `optimize-ios-ui` | yes | no |
| `audit-accessibility` | yes | no |
| `integrate-platform` | yes | no |
| `craft-ios-ui` | yes | **yes, on request** -- the only skill that runs every specialist, so the only one that can fill the required verdicts honestly |

A partial pass never writes a padded artifact with invented verdicts. It points
the user at `craft-ios-ui` instead. That restriction is the whole reason the
required-verdict set can be trusted.

## See also

- `references/review/01-finding-format.md` -- finding shape, severity, confidence, dimension registry
- `references/review/02-evidence-pipeline.md` -- evidence modes, and why NOT_ASSESSED fails the gate
- `ci/README.md` -- adoption guide for a reviewed repo
- `ci/verdict-artifact-schema.json` -- the canonical schema the gate parses
