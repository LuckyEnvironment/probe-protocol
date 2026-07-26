// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/**
 * Drive an implementation in any language through the line-oriented contract
 * described in README.md.
 *
 * The contract is deliberately the smallest thing that works: one JSON request
 * per line in, one JSON response per line out, in order. A conformance harness
 * a reimplementer cannot themselves reimplement in an afternoon would defeat
 * the purpose of publishing it.
 *
 * @param {string} command
 * @param {string[]} [args]
 * @returns {{
 *   apply: (rule: string, given: Record<string, unknown>) => Promise<unknown>,
 *   close: () => Promise<void>
 * }}
 */
export function subprocessImplementation(command, args = []) {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });

  /** @type {Array<{ resolve: (value: unknown) => void, reject: (reason: Error) => void }>} */
  const pending = [];
  /** @type {Error | null} */
  let fatal = null;

  lines.on("line", (line) => {
    const waiter = pending.shift();
    if (!waiter) return;
    try {
      const response = JSON.parse(line);
      if (response !== null && typeof response === "object" && "error" in response) {
        waiter.resolve({ error: response.error });
      } else {
        waiter.resolve(response?.result);
      }
    } catch {
      waiter.reject(new Error(`implementation emitted a line that is not JSON: ${line}`));
    }
  });

  const fail = (/** @type {Error} */ error) => {
    fatal = error;
    while (pending.length > 0) pending.shift()?.reject(error);
  };

  child.on("error", (error) => fail(error));
  child.on("close", (code) => {
    if (pending.length > 0) fail(new Error(`implementation exited with code ${code} before answering`));
  });

  return {
    apply(rule, given) {
      if (fatal) return Promise.reject(fatal);
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        child.stdin.write(`${JSON.stringify({ rule, given })}\n`);
      });
    },
    async close() {
      child.stdin.end();
      lines.close();
      child.kill();
    }
  };
}
