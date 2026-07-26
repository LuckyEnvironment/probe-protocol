#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { applyReference, formatReport, runConformance } from "../src/conformance.js";
import { subprocessImplementation } from "../src/subprocess.js";

const argv = process.argv.slice(2);

if (argv.includes("-h") || argv.includes("--help")) {
  process.stdout.write(
    [
      "probe-conformance [--impl <command> [args...]]",
      "",
      "Runs every reference vector in vectors/ against an implementation of the",
      "BNA probe protocol and reports which normative rules it satisfies.",
      "",
      "  --impl <command>   Command speaking the line-oriented contract (see README).",
      "                     Everything after --impl is passed to it as arguments.",
      "  --json             Emit machine-readable results instead of a report.",
      "",
      "With no --impl, the bundled reference implementation is checked against",
      "the vectors — which is how this repository self-tests.",
      ""
    ].join("\n")
  );
  process.exit(0);
}

const implIndex = argv.indexOf("--impl");
const json = argv.includes("--json");

/** @type {{ close: () => Promise<void> } | null} */
let implementation = null;
let apply = applyReference;

if (implIndex !== -1) {
  const [command, ...args] = argv.slice(implIndex + 1).filter((value) => value !== "--json");
  if (!command) {
    process.stderr.write("--impl needs a command to run. Try --help.\n");
    process.exit(2);
  }
  const subprocess = subprocessImplementation(command, args);
  implementation = subprocess;
  apply = subprocess.apply;
}

try {
  const run = await runConformance(apply);
  if (json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(run)}\n`);
  }
  process.exit(run.failed === 0 ? 0 : 1);
} finally {
  await implementation?.close();
}
