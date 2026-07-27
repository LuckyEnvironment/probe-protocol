# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `src/conformance-core.js` — the pure part of the conformance runner:
  `applyReference`, `matches`, `runVectors`, `formatReport`. No filesystem, no
  `node:` imports, so a browser can run the same suite the test process runs.
- `vectors/index.json` — a vector manifest. SPEC.md §7.1 promises a sceptic can
  run the suite anywhere, and a client without a directory listing — a browser,
  a fetch over HTTP — had no way to enumerate the vectors. It now reads them
  from here.
- A drift test asserting the manifest lists exactly the vectors on disk. Adding
  a vector file without listing it fails the suite, so the manifest cannot go
  quietly stale and silently shrink the suite a third party runs.

### Changed

- `src/conformance.js` keeps the Node-facing behaviour — loading vectors from
  disk, driving a subprocess implementation — and delegates the rules to
  `conformance-core.js`. The split exists so the browser runs the *same code*
  rather than a re-implementation of it, which is the only version of this that
  a sceptic should accept.

## [0.1.0] - 2026-07-26

### Added

- `SPEC.md` v1.0.0 — the normative probe specification, CC BY 4.0
- `schemas/probe-summary-1.0.0.schema.json` — the versioned result format
- Reference vectors covering outcome classification (§2.2), the denominator
  rule (§2.3), the read-only method allowlist (§3.1), `Retry-After` parsing
  (§4.2), backoff (§4.3) and probe identification (§4.1)
- A conformance suite runnable against any implementation via a line-oriented
  subprocess contract, plus a reference adapter
- A dependency-free JSON Schema validator covering the keywords the committed
  schemas use, and refusing any it does not implement
