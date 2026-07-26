// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { SUMMARY_SCHEMA_VERSION } from "../src/index.js";
import { summarySchema, validateSummary } from "../src/summary.js";
import { validate } from "../src/validate.js";

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function summary(overrides = {}) {
  return {
    specVersion: "1.0.0",
    target: "https://agent.example.invalid/a2a",
    startedAt: "2026-07-26T12:00:00.000Z",
    finishedAt: "2026-07-26T12:00:03.000Z",
    vantagePoint: "single-local",
    vantagePointNote: "Local probes are a single vantage point, not BNA's multi-region trust score.",
    requested: 2,
    attempted: 2,
    success: 2,
    failure: 0,
    notAttempted: 0,
    uptimePct: 100,
    avgLatencyMs: 150,
    method: "GET",
    userAgent: "BNA CLI/0.1.0 (+https://bna.dev/trust-methodology)",
    samples: [
      { index: 1, outcome: "success", ms: 100, at: "2026-07-26T12:00:01.000Z", status: 200 },
      { index: 2, outcome: "success", ms: 200, at: "2026-07-26T12:00:02.000Z", status: 200 }
    ],
    ...overrides
  };
}

test("the schema declares the version this package ships", () => {
  assert.equal(summarySchema.properties.specVersion.const, SUMMARY_SCHEMA_VERSION);
  assert.equal(summarySchema.$id, "https://bna.dev/schemas/probe-summary/1.0.0.json");
});

test("a conformant summary validates", () => {
  assert.deepEqual(validateSummary(summary()), []);
});

test("a single-local summary must carry its disclaimer", () => {
  const withoutNote = summary();
  delete withoutNote.vantagePointNote;
  const errors = validateSummary(withoutNote);
  assert.ok(
    errors.some((error) => error.includes("vantagePointNote")),
    `expected a missing-disclaimer error, got ${JSON.stringify(errors)}`
  );
});

test("a probe run cannot claim availability it did not measure", () => {
  const errors = validateSummary(
    summary({
      requested: 2,
      attempted: 0,
      success: 0,
      failure: 0,
      notAttempted: 2,
      uptimePct: 0,
      avgLatencyMs: 0,
      samples: [
        { index: 1, outcome: "not_attempted", ms: 5, at: "2026-07-26T12:00:01.000Z", reason: "rate_limited" },
        { index: 2, outcome: "not_attempted", ms: 5, at: "2026-07-26T12:00:02.000Z", reason: "rate_limited" }
      ]
    })
  );
  assert.ok(
    errors.some((error) => error.includes("must be null")),
    `0% must not stand in for unmeasured, got ${JSON.stringify(errors)}`
  );
});

test("counters must agree with the samples they claim to summarise", () => {
  const errors = validateSummary(summary({ success: 2, failure: 0, attempted: 2, uptimePct: 50 }));
  assert.ok(errors.some((error) => error.includes("uptimePct")), JSON.stringify(errors));
});

test("rate-limited samples stay out of the denominator", () => {
  const errors = validateSummary(
    summary({
      requested: 3,
      attempted: 2,
      success: 2,
      failure: 0,
      notAttempted: 1,
      uptimePct: 100,
      avgLatencyMs: 150,
      samples: [
        { index: 1, outcome: "success", ms: 100, at: "2026-07-26T12:00:01.000Z", status: 200 },
        {
          index: 2,
          outcome: "not_attempted",
          ms: 5,
          at: "2026-07-26T12:00:02.000Z",
          status: 429,
          reason: "rate_limited",
          retryAfterMs: 30000
        },
        { index: 3, outcome: "success", ms: 200, at: "2026-07-26T12:00:03.000Z", status: 200 }
      ]
    })
  );
  assert.deepEqual(errors, []);
});

test("a single-origin implementation cannot claim the multi-region vantage point", () => {
  const errors = validateSummary(summary({ vantagePoint: "local" }));
  assert.ok(errors.some((error) => error.includes("vantagePoint")), JSON.stringify(errors));
});

test("a non-conformant User-Agent is rejected", () => {
  assert.ok(validateSummary(summary({ userAgent: "curl/8.4.0" })).length > 0);
  assert.ok(validateSummary(summary({ userAgent: "BNA CLI/0.1.0" })).length > 0);
});

test("a side-effecting method is rejected", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(validateSummary(summary({ method })).length > 0, `${method} was accepted`);
  }
});

test("a non-success sample must say why", () => {
  const errors = validateSummary(
    summary({
      requested: 1,
      attempted: 1,
      success: 0,
      failure: 1,
      notAttempted: 0,
      uptimePct: 0,
      avgLatencyMs: 100,
      samples: [{ index: 1, outcome: "failure", ms: 100, at: "2026-07-26T12:00:01.000Z", status: 500 }]
    })
  );
  assert.ok(errors.some((error) => error.includes("reason")), JSON.stringify(errors));
});

test("observedRegion is omitted rather than echoed when not measured", () => {
  assert.deepEqual(validateSummary(summary()), [], "a summary without observedRegion is conformant");
  assert.deepEqual(validateSummary(summary({ observedRegion: "eu-west-1" })), []);
  assert.ok(validateSummary(summary({ observedRegion: "" })).length > 0, "an empty region is not an observation");
});

test("unknown properties are rejected so the format cannot drift silently", () => {
  assert.ok(validateSummary(summary({ score: 92 })).length > 0);
});

test("the validator refuses schema keywords it does not implement", () => {
  assert.throws(() => validate({}, { type: "object", patternProperties: {} }), /unsupported schema keyword/);
});

test("the validator implements every keyword the committed schema uses", () => {
  /** @param {unknown} node @returns {string[]} */
  function keywords(node) {
    if (Array.isArray(node)) return node.flatMap(keywords);
    if (typeof node !== "object" || node === null) return [];
    const object = /** @type {Record<string, unknown>} */ (node);
    return Object.entries(object).flatMap(([key, value]) =>
      key === "properties" || key === "$defs"
        ? Object.values(/** @type {Record<string, unknown>} */ (value)).flatMap(keywords)
        : [key, ...keywords(value)]
    );
  }
  // Throws if the schema has outgrown the validator.
  assert.deepEqual(validateSummary(summary()), []);
  assert.ok(keywords(summarySchema).includes("if"), "schema no longer exercises conditional validation");
});
