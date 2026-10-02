#!/usr/bin/env bash
# Run every apple-ui-craft gate. Exit 0 if all pass, 1 if any fail.
# Zero dependencies beyond Node >= 18.
set -uo pipefail

cd "$(dirname "$0")/.."

fail=0

run() {
  local name="$1"; shift
  echo "=== $name"
  if "$@"; then
    echo "--- $name: PASS"
  else
    echo "--- $name: FAIL"
    fail=1
  fi
  echo
}

run "reference integrity" node tests/check-references.mjs
run "scorer selftest"     node tests/harness/selftest.mjs
run "CI gate selftest"      node ci/selftest.mjs
run "corpus recall (example run)" node tests/harness/score-review.mjs tests/harness/examples/sample-findings.json

# Manifest sanity: the four version-lockstep files must agree, and the JSON must parse.
echo "=== manifest and version lockstep"
if node -e '
const fs = require("fs");
const plugin = JSON.parse(fs.readFileSync(".claude-plugin/plugin.json", "utf8"));
const market = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const own = (market.plugins || []).find(p => p.name === plugin.name || (market.plugins || []).length === 1);
const errors = [];
if (!own) errors.push("marketplace.json has no entry for " + plugin.name);
else if (own.version !== plugin.version) errors.push(`marketplace.json ${own.version} != plugin.json ${plugin.version}`);
const top = (changelog.match(/^##\s+([0-9]+\.[0-9]+\.[0-9]+)/m) || [])[1];
if (top !== plugin.version) errors.push(`CHANGELOG top entry ${top} != plugin.json ${plugin.version}`);
const unreleasedAt = changelog.search(/^##\s+Unreleased\b/m);
const topAt = changelog.search(/^##\s+[0-9]+\.[0-9]+\.[0-9]+/m);
if (unreleasedAt > -1 && topAt > -1 && unreleasedAt > topAt) errors.push(`CHANGELOG "## Unreleased" sits below release ${top}; a release folds that section into its own entry`);
if (errors.length) { errors.forEach(e => console.error("  " + e)); process.exit(1); }
console.log(`  plugin.json, marketplace.json and CHANGELOG.md all at ${plugin.version}`);
'; then
  echo "--- manifest and version lockstep: PASS"
else
  echo "--- manifest and version lockstep: FAIL"
  fail=1
fi
echo

# Model naming: text names model classes only (opus, sonnet, fable). No versioned or dated
# model ID, no version word such as "<Class> 5", no model: frontmatter pin. CHANGELOG.md is
# release history, so only the dated-ID rule applies to it. scripts/regenerate-mirror.sh runs
# the same check as a scrub-gate row.
echo "=== model naming"
if node -e '
const fs = require("fs");
const path = require("path");
const SKIP = new Set([".git", ".serena", ".claude", ".anti-slop", ".remember", "node_modules"]);
const EXT = /\.(md|json|mjs|sh|swift|ya?ml)$/;
const DATED = [/claude-[a-z]+-[0-9.]+-[0-9]{8}/, "dated model ID"];
const RULES = [
  DATED,
  [/claude-(opus|sonnet|haiku|fable)-[0-9]/, "versioned model ID"],
  [/\b(Opus|Sonnet|Haiku|Fable) [0-9]/, "model version name"],
  [/^model:/, "model: pin"],
];
const hits = [];
let scanned = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!EXT.test(e.name)) continue;
    const rel = path.relative(".", full);
    const rules = rel === "CHANGELOG.md" ? [DATED] : RULES;
    scanned++;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      for (const [re, what] of rules) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}: ${what}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
})(".");
if (hits.length) { hits.forEach(h => console.error("  " + h)); process.exit(1); }
console.log(`  ${scanned} files name model classes only`);
'; then
  echo "--- model naming: PASS"
else
  echo "--- model naming: FAIL"
  fail=1
fi
echo

if [ "$fail" -eq 0 ]; then
  echo "ALL GATES PASS"
else
  echo "ONE OR MORE GATES FAILED"
fi
exit "$fail"
