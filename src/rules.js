// SPDX-License-Identifier: Apache-2.0

/**
 * Reference implementation of the normative rules in SPEC.md that are pure
 * functions of an observation. Every function here is covered by a vector in
 * `vectors/`, so an independent implementation can check itself against the
 * same cases without running this code.
 */

/** SPEC.md §3.1 — the read-only method allowlist. */
export const ALLOWED_METHODS = Object.freeze(["GET", "HEAD"]);

/** SPEC.md §4.3 — floor for the backoff base and ceiling for the wait. */
export const MIN_BACKOFF_BASE_MS = 1_000;
export const MIN_MAX_BACKOFF_MS = 60_000;

/** SPEC.md §4.5 — the ad-hoc request-rate floor. */
export const MIN_INTERVAL_MS = 1_000;

/** SPEC.md §4.1 — a conformant probe User-Agent. */
export const USER_AGENT_PATTERN = /^BNA [^/]+\/[^ ]+ \(\+https:\/\/bna\.dev\/trust-methodology\)$/;

/**
 * @typedef {"success" | "failure" | "not_attempted"} ProbeOutcome
 * @typedef {object} Observation
 * @property {boolean} [excluded]        Operator exclusion is in force (§4.4)
 * @property {boolean} [interrupted]     The run was interrupted before the request completed
 * @property {boolean} [deadlineReached] The run deadline passed
 * @property {number | null} [status]    HTTP status, or null if none was received
 * @property {boolean} [transportError]  DNS, TLS, reset or timeout
 */

/**
 * SPEC.md §2.2. Assign exactly one outcome to one observation. The order of
 * these checks is normative: the first matching condition wins.
 *
 * @param {Observation} observation
 * @returns {{ outcome: ProbeOutcome, reason?: string }}
 */
export function classifyOutcome(observation) {
  if (observation.excluded === true) return { outcome: "not_attempted", reason: "excluded" };
  if (observation.interrupted === true) return { outcome: "not_attempted", reason: "interrupted" };
  if (observation.deadlineReached === true) return { outcome: "not_attempted", reason: "deadline_exceeded" };

  const status = observation.status ?? null;

  // §2.2 row 4. A rate-limited probe is evidence about our request rate, not
  // about the target's availability, so it never becomes a failure.
  if (status === 429) return { outcome: "not_attempted", reason: "rate_limited" };

  // No status means no response was received. With no deadline or interrupt to
  // explain it, that is the target's problem, not ours.
  if (status === null) return { outcome: "failure", reason: "network_error" };

  if (status >= 200 && status < 400) return { outcome: "success" };
  return { outcome: "failure", reason: `http_${status}` };
}

/**
 * SPEC.md §4.2. Resolve either RFC 9110 `Retry-After` form to milliseconds.
 * An unparseable value is absent, not zero.
 *
 * @param {string | null | undefined} value
 * @param {number} now Epoch milliseconds, supplied so the result is reproducible.
 * @returns {number | null}
 */
export function parseRetryAfter(value, now) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;

  // delta-seconds: a non-negative integer, and nothing else.
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;

  // Everything else must be an HTTP-date. Date.parse cannot be used as the
  // gate here: it accepts "-5" as the year 5 BC and "1.5" as January 1905,
  // both of which land in the past and would collapse to a zero wait. A
  // malformed header must be absent (§4.2), so require the alphabetic month
  // or day name that every RFC 9110 date form carries before parsing at all.
  if (!/[a-z]/i.test(trimmed)) return null;

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

/**
 * SPEC.md §4.3. Exponential backoff after n consecutive 429s.
 *
 * @param {number} consecutiveRateLimits Count from 0 for the first 429.
 * @param {{ baseMs?: number, maxMs?: number }} [options]
 * @returns {number}
 */
export function backoffMs(consecutiveRateLimits, options = {}) {
  const base = Math.max(MIN_BACKOFF_BASE_MS, options.baseMs ?? MIN_BACKOFF_BASE_MS);
  const max = Math.max(MIN_MAX_BACKOFF_MS, options.maxMs ?? MIN_MAX_BACKOFF_MS);
  const n = Math.max(0, Math.floor(consecutiveRateLimits));
  return Math.min(max, base * 2 ** n);
}

/**
 * SPEC.md §4.2 + §4.3. Where both apply, wait the longer of the two; where
 * neither applies, hold the §4.5 interval floor.
 *
 * @param {{
 *   rateLimited?: boolean,
 *   retryAfterMs?: number | null,
 *   consecutiveRateLimits?: number,
 *   intervalMs?: number,
 *   baseMs?: number,
 *   maxMs?: number
 * }} state
 * @returns {number}
 */
export function waitMs(state) {
  if (state.rateLimited !== true) {
    return Math.max(MIN_INTERVAL_MS, state.intervalMs ?? MIN_INTERVAL_MS);
  }
  const backoff = backoffMs(state.consecutiveRateLimits ?? 0, { baseMs: state.baseMs, maxMs: state.maxMs });
  return Math.max(state.retryAfterMs ?? 0, backoff);
}

/**
 * SPEC.md §3.1. Reject a disallowed method rather than substituting one.
 *
 * @param {string | null | undefined} method
 * @returns {"GET" | "HEAD"}
 */
export function assertAllowedMethod(method) {
  const normalised = String(method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.includes(normalised)) {
    throw new Error(
      `SPEC.md §3.1: probes are limited to ${ALLOWED_METHODS.join(" or ")}; refusing ${normalised}. No endpoint tools are invoked.`
    );
  }
  return /** @type {"GET" | "HEAD"} */ (normalised);
}

/**
 * SPEC.md §4.1.
 *
 * @param {string} userAgent
 * @returns {boolean}
 */
export function isConformantUserAgent(userAgent) {
  return typeof userAgent === "string" && USER_AGENT_PATTERN.test(userAgent);
}

/**
 * SPEC.md §2.3. Aggregate samples into the counters a summary must report.
 * `not_attempted` stays out of the denominator, and an empty denominator
 * yields null rather than zero.
 *
 * @param {Array<{ outcome: ProbeOutcome, ms?: number }>} samples
 * @returns {{
 *   attempted: number,
 *   success: number,
 *   failure: number,
 *   notAttempted: number,
 *   uptimePct: number | null,
 *   avgLatencyMs: number | null
 * }}
 */
export function aggregate(samples) {
  let success = 0;
  let failure = 0;
  let notAttempted = 0;
  let latency = 0;

  for (const sample of samples) {
    if (sample.outcome === "success") {
      success += 1;
      latency += sample.ms ?? 0;
    } else if (sample.outcome === "failure") {
      failure += 1;
      latency += sample.ms ?? 0;
    } else {
      notAttempted += 1;
    }
  }

  const attempted = success + failure;
  return {
    attempted,
    success,
    failure,
    notAttempted,
    uptimePct: attempted === 0 ? null : Number(((success / attempted) * 100).toFixed(2)),
    avgLatencyMs: attempted === 0 ? null : Math.round(latency / attempted)
  };
}
