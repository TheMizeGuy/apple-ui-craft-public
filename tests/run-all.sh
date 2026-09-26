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

if [ "$fail" -eq 0 ]; then
  echo "ALL GATES PASS"
else
  echo "ONE OR MORE GATES FAILED"
fi
exit "$fail"
