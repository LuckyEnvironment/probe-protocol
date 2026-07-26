# Contributing

Thank you for helping make BNA's measurements reproducible.

Please open an issue before substantial work, keep pull requests focused, and
run `npm run check` before submitting a change. BNA is maintained by one
person alongside a company, so responses are best effort, typically within one
week.

Do not include credentials, personal data, or live customer endpoints in an
issue or pull request. Report security vulnerabilities privately as described
in [SECURITY.md](./SECURITY.md).

## Changing the specification

`SPEC.md` is a public commitment. Anyone may have reimplemented against it, and
BNA's published scores are justified by it.

- A change that makes a previously conformant implementation non-conformant is
  a **major** version of `specVersion`, announced 30 days in advance per
  `TRUST-METHODOLOGY.md` §8.
- A change that adds an optional field, or clarifies wording without changing
  what any implementation must do, is a **minor** version.
- Every normative rule that can be expressed as a pure function of observations
  **must** ship with vectors in `vectors/` in the same pull request. A rule with
  no vector is a rule nobody can check you against.

## Changing the reference implementation

The reference implementation follows the specification, never the other way
round. If they disagree, the specification is what BNA promised in public: fix
the code.

If you believe the specification itself is wrong, say so in the issue and
propose the amendment explicitly rather than quietly changing behaviour to
match. Under-promising in a published spec costs nothing; over-promising costs
the company.

## Changing the schema

The schema is versioned by filename and `$id`. Do not edit a published version
in place — add a new one. The CLI and the hosted service both consume these
files, and a summary produced last month must still validate.
