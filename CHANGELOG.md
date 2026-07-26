# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
