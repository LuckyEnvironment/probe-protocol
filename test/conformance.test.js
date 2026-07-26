// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { formatReport, loadVectors, runConformance } from "../src/conformance.js";
import { subprocessImplementation } from "../src/subprocess.js";

test("every committed vector is well-formed and names the section it covers", () => {
  const files = loadVectors();
  assert.ok(files.length >= 6, `expected the full vector set, found ${files.length} files`);

  const ids = new Set();
  for (const file of files) {
    assert.ok(typeof file.rule === "string" && file.rule.length > 0, "vector file is missing a rule");
    assert.match(file.section, /^SPEC\.md §/, `${file.rule} does not cite a specification section`);
    assert.ok(file.cases.length > 0, `${file.rule} has no cases`);
    for (const testCase of file.cases) {
      assert.ok(typeof testCase.id === "string" && testCase.id.length > 0);
      assert.ok("expect" in testCase, `${file.rule}/${testCase.id} has no expectation`);
      const key = `${file.rule}/${testCase.id}`;
      assert.equal(ids.has(key), false, `duplicate vector id ${key}`);
      ids.add(key);
    }
  }
});

test("the vectors cover every normative rule the reference implements", () => {
  const covered = new Set(loadVectors().map((file) => file.rule));
  for (const rule of [
    "classifyOutcome",
    "parseRetryAfter",
    "waitMs",
    "aggregate",
    "assertAllowedMethod",
    "isConformantUserAgent"
  ]) {
    assert.ok(covered.has(rule), `no vector file covers ${rule}`);
  }
});

test("the reference implementation passes its own conformance suite", async () => {
  const run = await runConformance();
  assert.equal(run.failed, 0, `reference implementation fails its own vectors:\n${formatReport(run)}`);
  assert.ok(run.passed >= 50, `expected a substantial suite, ran ${run.passed} cases`);
});

test("the suite detects a non-conformant implementation", async () => {
  // The failure mode the specification exists to prevent: treating a 429 as a
  // failure, which drags a well-behaved operator's availability down.
  const run = await runConformance((rule, given) => {
    if (rule === "classifyOutcome") {
      const observation = /** @type {Record<string, any>} */ (given);
      if (observation.status === 429) return { outcome: "failure", reason: "http_429" };
    }
    return { outcome: "success" };
  });
  assert.ok(run.failed > 0, "a deliberately wrong implementation passed the suite");
  const rateLimit = run.results.find((result) => result.id === "rate-limited-429-is-not-a-failure");
  assert.equal(rateLimit?.passed, false, "the 429 vector did not catch a 429-as-failure implementation");
});

test("an implementation in another process can be driven through the contract", async () => {
  const adapter = fileURLToPath(new URL("../bin/reference-adapter.js", import.meta.url));
  const implementation = subprocessImplementation(process.execPath, [adapter]);
  try {
    const run = await runConformance(implementation.apply);
    assert.equal(run.failed, 0, `subprocess contract failed:\n${formatReport(run)}`);
  } finally {
    await implementation.close();
  }
});

test("the report is plain text with no colour or box drawing", async () => {
  const report = formatReport(await runConformance());
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(report, /\[/, "report contains ANSI escapes");
  assert.doesNotMatch(report, /[─│┌┐└┘├┤┬┴┼]/, "report depends on box drawing");
  assert.match(report, /passed, 0 failed/);
});
