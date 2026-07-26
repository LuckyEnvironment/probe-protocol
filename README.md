# @bna/probe-protocol

The specification, schema, reference vectors and conformance suite for the BNA probe protocol.

BNA scores endpoints by probing them. This repository exists so that you do not have to take BNA's word for what a probe does or how its result is computed — you can reimplement the procedure, run the same vectors, and check that your answers match.

- **[`SPEC.md`](SPEC.md)** — the normative specification
- **[`schemas/`](schemas/)** — the versioned probe-summary JSON Schema
- **[`vectors/`](vectors/)** — input/expected-output pairs for every rule that is a pure function of observations
- **[`src/`](src/)** — a reference implementation, kept small enough to read in one sitting

## Install

```sh
npm install @bna/probe-protocol
```

Zero runtime dependencies.

## Checking your own implementation

The fastest check needs no integration at all: read `vectors/*.json`, evaluate each `given` with your implementation, and compare to `expect`. Every file names the specification section it covers.

```json
{
  "id": "rate-limited-429-is-not-a-failure",
  "given": { "status": 429 },
  "expect": { "outcome": "not_attempted", "reason": "rate_limited" }
}
```

## Checking another implementation

For a more complete run, the bundled harness drives any implementation — in any language — through a line-oriented subprocess contract.

Your program reads one JSON request per line on stdin and writes one JSON response per line on stdout, in order:

```
→ {"rule":"classifyOutcome","given":{"status":429}}
← {"result":{"outcome":"not_attempted","reason":"rate_limited"}}

→ {"rule":"assertAllowedMethod","given":{"method":"POST"}}
← {"error":"SPEC.md §3.1: probes are limited to GET or HEAD; refusing POST."}
```

Then:

```sh
npx probe-conformance --impl ./my-prober
```

`bin/reference-adapter.js` is a complete, ~20-line example of an adapter. Exit code is `0` when every vector passes and `1` otherwise, so this drops into CI.

## Validating a probe summary

```js
import { validateSummary } from "@bna/probe-protocol";

const errors = validateSummary(summary);
if (errors.length > 0) throw new Error(errors.join("\n"));
```

`validateSummary` checks the JSON Schema **and** the cross-field arithmetic the schema cannot express — that `attempted` equals `success + failure`, that the counters agree with the samples, and that a run which attempted nothing reports `null` rather than `0`.

That last check is the one worth understanding. `uptimePct: 0` means *we measured, and nothing worked*. `uptimePct: null` means *we did not measure*. A tool that renders the second as the first is claiming an observation it never made, which is the failure this whole protocol is written to prevent.

## Versioning

`specVersion` and the schema `$id` are versioned independently of this package. Additive optional fields are a minor version. Removing or renaming a field, or changing how an existing one is computed, is a major version — and, per `TRUST-METHODOLOGY.md` §8, needs 30 days' notice when it can move a published score.

## Licence

Dual-licensed, deliberately:

- **Code, schemas, vectors and the conformance suite** — [Apache 2.0](LICENSE)
- **The prose specification (`SPEC.md`)** — [CC BY 4.0](LICENSE-docs)

The specification is meant to be quoted, translated and reimplemented; the code that checks conformance to it carries a patent grant. This matches `trust-methodology`.

## Security

Probe etiquette is normative here, not advisory — see `SPEC.md` §4 and [`SECURITY.md`](SECURITY.md). If you see traffic claiming to be a BNA probe that does not behave as §4 specifies, please report it. That is a report we want.
