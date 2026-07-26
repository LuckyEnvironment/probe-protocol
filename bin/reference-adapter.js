#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The reference implementation exposed through the subprocess contract.
 *
 * It exists to be read: it is the shortest complete example of what a
 * conformance adapter in another language has to do. Roughly — read a line,
 * parse `{rule, given}`, dispatch, write `{result}` or `{error}` and a newline.
 */

import { createInterface } from "node:readline";
import { applyReference } from "../src/conformance.js";

const lines = createInterface({ input: process.stdin });

for await (const line of lines) {
  if (line.trim() === "") continue;
  try {
    const { rule, given } = JSON.parse(line);
    process.stdout.write(`${JSON.stringify({ result: applyReference(rule, given) })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
  }
}
