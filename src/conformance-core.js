// SPDX-License-Identifier: Apache-2.0

/**
 * The conformance runner, with no filesystem in it.
 *
 * SPEC.md §7.1 says a sceptic can self-check an implementation with no network
 * and no BNA infrastructure. That is only true if the runner goes everywhere
 * the vectors go, so everything here is portable and the Node-only file
 * loading lives in `conformance.js` alongside it.
 */

import * as reference from "./rules.js";

/**
 * @typedef {{ id: string, description?: string, given: Record<string, unknown>, expect: unknown }} VectorCase
 * @typedef {{ rule: string, section: string, description: string, cases: VectorCase[] }} VectorFile
 * @typedef {{ rule: string, section: string, id: string, passed: boolean, expected: unknown, actual: unknown }} CaseResult
 */

/**
 * Apply one vector case using the bundled reference implementation.
 *
 * This is also the normative description of how a `given` maps onto a rule, so
 * an implementation in another language knows what to do with each field.
 *
 * @param {string} rule
 * @param {Record<string, any>} given
 * @returns {unknown}
 */
export function applyReference(rule, given) {
  switch (rule) {
    case "classifyOutcome":
      return reference.classifyOutcome(given);
    case "parseRetryAfter":
      return reference.parseRetryAfter(given.header, given.now);
    case "waitMs":
      return reference.waitMs(given);
    case "aggregate":
      return reference.aggregate(given.samples);
    case "assertAllowedMethod":
      try {
        return { allowed: true, method: reference.assertAllowedMethod(given.method) };
      } catch {
        return { allowed: false };
      }
    case "isConformantUserAgent":
      return reference.isConformantUserAgent(given.userAgent);
    default:
      throw new Error(`unknown rule: ${rule}`);
  }
}

/**
 * Drop undefined-valued keys and sort object keys so that `{outcome: "success"}`
 * and `{outcome: "success", reason: undefined}` compare equal.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, normalise(item)])
  );
}

/**
 * Compare two values structurally. Vectors are plain JSON, so JSON equality is
 * the right notion — and it is trivially reimplementable in any language.
 *
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {boolean}
 */
export function matches(actual, expected) {
  return JSON.stringify(normalise(actual)) === JSON.stringify(normalise(expected));
}

/**
 * Run a set of already-loaded vectors against an implementation.
 *
 * @param {VectorFile[]} vectors
 * @param {(rule: string, given: Record<string, unknown>) => unknown | Promise<unknown>} [apply]
 * @returns {Promise<{ results: CaseResult[], passed: number, failed: number }>}
 */
export async function runVectors(vectors, apply = applyReference) {
  /** @type {CaseResult[]} */
  const results = [];

  for (const file of vectors) {
    for (const testCase of file.cases) {
      let actual;
      try {
        actual = await apply(file.rule, testCase.given);
      } catch (error) {
        actual = { error: error instanceof Error ? error.message : String(error) };
      }
      results.push({
        rule: file.rule,
        section: file.section,
        id: testCase.id,
        passed: matches(actual, testCase.expect),
        expected: testCase.expect,
        actual
      });
    }
  }

  return {
    results,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length
  };
}

/**
 * Render a conformance run for a terminal. No colour and no box drawing: this
 * output gets pasted into issues.
 *
 * @param {{ results: CaseResult[], passed: number, failed: number }} run
 * @returns {string}
 */
export function formatReport(run) {
  const lines = [];
  let currentRule = "";
  for (const result of run.results) {
    if (result.rule !== currentRule) {
      currentRule = result.rule;
      lines.push(`\n${result.rule}  (${result.section})`);
    }
    lines.push(`  ${result.passed ? "PASS" : "FAIL"}  ${result.id}`);
    if (!result.passed) {
      lines.push(`        expected: ${JSON.stringify(result.expected)}`);
      lines.push(`        actual:   ${JSON.stringify(result.actual)}`);
    }
  }
  lines.push(`\n${run.passed} passed, ${run.failed} failed, ${run.results.length} total`);
  return lines.join("\n");
}
