// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { aggregate } from "./rules.js";
import { validate } from "./validate.js";

/** The committed probe summary schema, loaded as data. */
export const summarySchema = JSON.parse(
  readFileSync(fileURLToPath(new URL("../schemas/probe-summary-1.0.0.schema.json", import.meta.url)), "utf8")
);

/**
 * Validate a probe summary against the published schema and against the
 * cross-field invariants that JSON Schema cannot express.
 *
 * The arithmetic checks matter as much as the shape: a summary can satisfy
 * every type constraint and still claim an availability it did not measure.
 *
 * @param {unknown} summary
 * @returns {string[]} Human-readable errors; empty means conformant.
 */
export function validateSummary(summary) {
  const errors = validate(summary, summarySchema);
  if (errors.length > 0) return errors;

  const value = /** @type {Record<string, any>} */ (summary);
  const derived = aggregate(value.samples ?? []);

  if (value.attempted !== value.success + value.failure) {
    errors.push(
      `SPEC.md §2.3: attempted (${value.attempted}) must equal success + failure (${value.success + value.failure})`
    );
  }
  if (Array.isArray(value.samples) && value.samples.length > 0) {
    for (const [key, expected] of Object.entries(derived)) {
      if (value[key] !== expected) {
        errors.push(`SPEC.md §2.3: ${key} is ${JSON.stringify(value[key])}, but the samples give ${JSON.stringify(expected)}`);
      }
    }
  }
  if (value.attempted === 0 && (value.uptimePct !== null || value.avgLatencyMs !== null)) {
    errors.push(
      "SPEC.md §2.3: nothing was attempted, so uptimePct and avgLatencyMs must be null rather than a number"
    );
  }
  if (value.requested < value.attempted + value.notAttempted) {
    errors.push(
      `SPEC.md §2.3: requested (${value.requested}) is fewer than the ${value.attempted + value.notAttempted} samples accounted for`
    );
  }
  if (Date.parse(value.finishedAt) < Date.parse(value.startedAt)) {
    errors.push("finishedAt precedes startedAt");
  }

  return errors;
}
