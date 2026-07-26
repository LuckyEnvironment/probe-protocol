// SPDX-License-Identifier: Apache-2.0

/** The version of SPEC.md this package implements. */
export const SPEC_VERSION = "1.0.0";

/** The version of the probe summary schema shipped in `schemas/`. */
export const SUMMARY_SCHEMA_VERSION = "1.0.0";

export {
  ALLOWED_METHODS,
  MIN_BACKOFF_BASE_MS,
  MIN_INTERVAL_MS,
  MIN_MAX_BACKOFF_MS,
  USER_AGENT_PATTERN,
  aggregate,
  assertAllowedMethod,
  backoffMs,
  classifyOutcome,
  isConformantUserAgent,
  parseRetryAfter,
  waitMs
} from "./rules.js";

export { validate } from "./validate.js";
export { applyReference, formatReport, loadVectors, matches, runConformance } from "./conformance.js";
export { subprocessImplementation } from "./subprocess.js";
export { summarySchema, validateSummary } from "./summary.js";
