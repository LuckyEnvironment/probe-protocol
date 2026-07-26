<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# BNA Probe Protocol

**Version:** 1.0.0
**Status:** Draft for public comment
**Licence:** CC BY 4.0 (this document). The schemas, vectors and conformance suite in this repository are Apache-2.0.

---

## 0. Purpose and conformance language

A BNA trust score is a claim about a third party's endpoint. This document specifies the measurement precisely enough that an independent party can reimplement it in another language and check whether BNA's published numbers follow from BNA's stated procedure. That is what makes a BNA score falsifiable rather than merely published.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be interpreted as described in RFC 2119.

An implementation is **conformant** if it satisfies every MUST in sections 2–6 and passes the conformance suite in `test/`.

### 0.1 What this specification does not cover

This document specifies **how a single observation is made and recorded**. It does not specify how observations are aggregated into a published trust score — that is `TRUST-METHODOLOGY.md`, which is versioned separately. The boundary is deliberate: the probe procedure should be stable while scoring weights are still being calibrated.

---

## 1. Terminology

| Term | Meaning |
|---|---|
| **Probe** | One request to a target endpoint, producing exactly one sample |
| **Sample** | The record of a single probe: outcome, timing, and reason |
| **Summary** | An aggregation of samples from one vantage point over one run |
| **Vantage point** | The origin of a probe, identified by region |
| **Attempted** | A probe that reached the target and produced a response or transport error |
| **Not attempted** | A probe that was suppressed, rate-limited, or abandoned before it could produce a measurement |

---

## 2. The probe procedure

### 2.1 Request

A probe **MUST**:

1. Resolve the target URL and record the terminating region where observable (§5).
2. Negotiate transport and record the actual TLS version and cipher suite where observable.
3. Issue **exactly one** HTTP request using an allowed method (§3.1).
4. Record the response status, elapsed wall-clock time, and any transport error.
5. Discard the response body without acting on its contents.

A probe **MUST NOT** follow a redirect to a target that would itself be refused by §3.3. Redirect targets **MUST** be re-checked at every hop.

### 2.2 Outcome classification

Every sample **MUST** be assigned exactly one outcome from `success`, `failure`, `not_attempted`, according to this table. The table is normative and exhaustive; where two rows could apply, the **first matching row wins**.

| # | Condition | Outcome | `reason` |
|---:|---|---|---|
| 1 | Operator has an active exclusion or reduced-frequency request (§4.4) | `not_attempted` | `excluded` |
| 2 | Request was never issued because the run was interrupted | `not_attempted` | `interrupted` |
| 3 | Request was never issued, or was abandoned, because the run deadline passed | `not_attempted` | `deadline_exceeded` |
| 4 | Response status is `429` | `not_attempted` | `rate_limited` |
| 5 | No response was received | `failure` | `network_error` |
| 6 | Response status is 2xx or 3xx | `success` | — |
| 7 | Response status is any other value | `failure` | `http_<status>` |

Rows 1–3 precede row 4 because they describe decisions taken before a request is issued: an implementation cannot have observed a status it never asked for.

**Row 4 is the one implementations get wrong.** A rate-limited probe is evidence about BNA's request rate, not about the target's availability. Recording it as a failure would penalise an operator for correctly defending their endpoint — and would let BNA degrade a score by probing too hard.

Row 5 covers DNS failure, TLS failure, connection reset and request timeout alike. Where a timeout is caused by the *run* deadline rather than the target, row 3 has already matched.

### 2.3 The denominator

```
attempted = success + failure
availability = success / attempted        (undefined when attempted = 0)
```

Samples with outcome `not_attempted` **MUST NOT** appear in `attempted`. When `attempted` is zero, `uptimePct` and `avgLatencyMs` **MUST** be `null` and **MUST NOT** be reported as `0`.

This is the arithmetic expression of the product's central claim: a number BNA did not measure is not reported as a measurement.

---

## 3. Read-only enforcement

### 3.1 Method allowlist

A probe **MUST** use `GET` or `HEAD`. An implementation **MUST** reject any other method by refusing to run, not by silently substituting one.

`POST`, `PUT`, `PATCH` and `DELETE` **MUST NOT** be issued to any endpoint discovered during probing, including endpoints named in an agent card's `skills` or `capabilities`.

### 3.2 No tool invocation

A probe **MUST NOT** invoke a declared tool, submit a task, or perform an A2A capability handshake that has side effects. Capability enumeration is limited to reading the declaration.

This is a promise made in public, in `SECURITY.md`, to people whose systems are being probed. An implementation **MUST** enforce it in code and **MUST** cover it with a test; documenting it is not sufficient.

### 3.3 Target restrictions

A probe **MUST** refuse, by default, targets resolving to:

- private ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `::1`, `fc00::/7`)
- link-local ranges (`169.254/16`, `fe80::/10`)
- cloud instance-metadata addresses (`169.254.169.254`, `fd00:ec2::254`)

An implementation **MAY** offer an explicit opt-out for local development. If it does, the opt-out **MUST** be off by default and **MUST** be announced in the output when active.

---

## 4. Etiquette

These are normative requirements, not guidance. They correspond one-to-one with the public commitments in `TRUST-METHODOLOGY.md` §3.4 and `SECURITY.md`.

### 4.1 Identification

Every probe request **MUST** carry a `User-Agent` that names BNA and links to the methodology:

```
BNA <component>/<version> (+https://bna.dev/trust-methodology)
```

The URL **MUST** be present and **MUST** resolve to the published methodology. An operator receiving unexplained traffic must be able to identify it and find out what it is in one step.

### 4.2 `Retry-After`

On any response carrying `Retry-After`, an implementation **MUST** wait at least the indicated interval before the next request to that target. Both RFC 9110 forms **MUST** be supported:

- **delta-seconds** — a non-negative integer number of seconds
- **HTTP-date** — an absolute time; the wait is `max(0, date − now)`

A malformed or unparseable value **MUST** be treated as absent, and the backoff of §4.3 applies instead. An implementation **MUST NOT** treat a malformed value as zero delay.

### 4.3 Backoff

After the *n*-th consecutive `429` from a target (*n* counted from 0), an implementation **MUST** wait at least:

```
wait = min(MAX_BACKOFF, base × 2^n)
```

with `base` ≥ 1000 ms and `MAX_BACKOFF` ≥ 60000 ms. Where both a `Retry-After` and a computed backoff apply, the implementation **MUST** wait the **longer** of the two.

The consecutive counter **MUST** reset on any non-`429` response.

### 4.4 Exclusion

An operator may request reduced probe frequency or exclusion at the address in `SECURITY.md`. Requests **MUST** be honoured within two business days. An excluded target's entry **MUST** be marked `Excluded at operator request` and **MUST NOT** be deleted — deletion would silently drop the record and let exclusion be used to hide a poor score.

Probes suppressed by an honoured exclusion are recorded as `not_attempted` with reason `excluded`, and are excluded from the denominator per §2.3.

### 4.5 Default rate

Against a target with no `Retry-After` and no exclusion, an implementation **MUST NOT** issue requests more frequently than once per second by default. The published BNA cadence is hourly per region; the one-second floor is the limit for ad-hoc and command-line use.

---

## 5. Vantage points and residency

### 5.1 Vantage point labelling

Every summary **MUST** declare its vantage point. Two values are defined in version 1.0.0:

| Value | Meaning |
|---|---|
| `single-local` | One probe origin, wherever the implementation happened to run |
| `bna-multi-region` | BNA's published region set, currently NL + DE + IE |

An implementation running from one origin **MUST** emit `single-local` and **MUST NOT** emit `bna-multi-region`. A summary carrying `single-local` **MUST** also carry `vantagePointNote` stating in plain language that it is not a BNA trust score.

**A locally-run tool physically cannot probe from three regions.** That is fine. What is not fine is output that lets a reader mistake one vantage point for three. Any human-readable rendering of a `single-local` summary **MUST** say so on its own line, not in a footnote.

### 5.2 Residency observation

Where an implementation determines a terminating region, it **MUST** do so by observing where traffic terminates, and **MUST NOT** derive it from the vendor's declaration. An implementation that cannot observe termination **MUST** omit `observedRegion` entirely rather than echoing the declared value.

An omitted `observedRegion` means *not measured*. It **MUST NOT** be rendered as agreement, and **MUST NOT** contribute to a residency component.

---

## 6. Result format

A probe summary **MUST** validate against `schemas/probe-summary-1.0.0.schema.json`.

The schema is versioned independently of this prose. Additive optional fields are a **minor** version. Removing a field, renaming one, or changing how an existing field is computed is a **major** version and, per `TRUST-METHODOLOGY.md` §8, requires 30 days' notice when it can move a published score.

Producers **MUST** set `specVersion` to the version of this document they implement.

---

## 7. Conformance

### 7.1 Reference vectors

`vectors/` contains input/expected-output pairs for every normative rule in §2–§5 that can be expressed as a pure function of observations. Each vector names the section it covers.

An implementation self-checks by evaluating each vector's `given` and comparing to its `expect`. This requires no network and no BNA infrastructure — the point is that a sceptic can run it.

### 7.2 Running the suite against another implementation

The suite drives an implementation through a line-oriented subprocess contract: one JSON request per line on stdin, one JSON response per line on stdout. See `README.md` §"Checking another implementation".

### 7.3 What conformance does not prove

Passing the suite proves an implementation classifies and aggregates observations as specified. It does not prove the observations themselves were honestly collected. Nothing checkable from outside can prove that; it is why BNA publishes the code that collects them.

---

## 8. Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | July 2026 | Initial draft for public comment |
