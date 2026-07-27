// SPDX-License-Identifier: Apache-2.0

/**
 * Node-side vector loading. Everything that actually decides whether an
 * implementation conforms lives in `conformance-core.js`, which has no
 * filesystem dependency so the suite runs in a browser too.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runVectors } from "./conformance-core.js";

export { applyReference, formatReport, matches, runVectors } from "./conformance-core.js";

const vectorsDirectory = new URL("../vectors/", import.meta.url);

/** The manifest that lets a client with no directory listing enumerate vectors. */
export const VECTOR_MANIFEST = "index.json";

/**
 * @typedef {import("./conformance-core.js").VectorFile} VectorFile
 * @typedef {import("./conformance-core.js").CaseResult} CaseResult
 */

/**
 * @param {string} name
 * @returns {any}
 */
function readVectorFile(name) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(name, vectorsDirectory)), "utf8"));
}

/**
 * The vector file names, from the directory itself.
 *
 * @returns {string[]}
 */
export function vectorFileNames() {
  return readdirSync(vectorsDirectory)
    .filter((name) => name.endsWith(".json") && name !== VECTOR_MANIFEST)
    .sort();
}

/**
 * Load every committed vector file, sorted for a stable report order.
 *
 * @returns {VectorFile[]}
 */
export function loadVectors() {
  return vectorFileNames().map(readVectorFile);
}

/**
 * Run every committed vector against an implementation.
 *
 * @param {(rule: string, given: Record<string, unknown>) => unknown | Promise<unknown>} [apply]
 * @returns {Promise<{ results: CaseResult[], passed: number, failed: number }>}
 */
export async function runConformance(apply) {
  return runVectors(loadVectors(), apply);
}
