// SPDX-License-Identifier: Apache-2.0

/**
 * A dependency-free JSON Schema validator covering exactly the keywords used
 * by the schemas in this repository.
 *
 * It is deliberately not a general-purpose implementation. A probe summary is
 * checked by people auditing BNA's claims, and "the validator is 150 lines of
 * standard library" is one less thing they have to take on trust than a
 * transitive dependency tree. `test/validate.test.js` pins the keyword
 * coverage so the schemas cannot quietly outgrow it.
 */

/** Keywords this validator understands. A schema using anything else throws. */
const SUPPORTED = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "pattern",
  "minLength",
  "minimum",
  "maximum",
  "allOf",
  "anyOf",
  "oneOf",
  "if",
  "then",
  "else"
]);

/**
 * @param {unknown} value
 * @param {string} type
 * @returns {boolean}
 */
function matchesType(value, type) {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      throw new Error(`unsupported schema type: ${type}`);
  }
}

/**
 * @param {Record<string, unknown>} root
 * @param {string} ref
 * @returns {Record<string, unknown>}
 */
function resolve(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  /** @type {unknown} */
  let target = root;
  for (const part of ref.slice(2).split("/")) {
    if (typeof target !== "object" || target === null) throw new Error(`unresolvable $ref: ${ref}`);
    target = /** @type {Record<string, unknown>} */ (target)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  if (typeof target !== "object" || target === null) throw new Error(`unresolvable $ref: ${ref}`);
  return /** @type {Record<string, unknown>} */ (target);
}

/**
 * Validate a value against a schema, collecting every failure rather than
 * stopping at the first — a conformance report is more useful than an assertion.
 *
 * @param {unknown} value
 * @param {Record<string, unknown>} schema
 * @param {Record<string, unknown>} [root]
 * @param {string} [path]
 * @returns {string[]} Human-readable errors; empty means valid.
 */
export function validate(value, schema, root = schema, path = "") {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED.has(keyword)) throw new Error(`unsupported schema keyword: ${keyword}`);
  }

  /** @type {string[]} */
  const errors = [];
  const at = path === "" ? "(root)" : path;

  if (typeof schema.$ref === "string") {
    return validate(value, resolve(root, schema.$ref), root, path);
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, String(type)))) {
      return [`${at}: expected ${types.join(" or ")}, got ${value === null ? "null" : typeof value}`];
    }
  }

  if ("const" in schema && value !== schema.const) {
    errors.push(`${at}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${at}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${at}: shorter than minLength ${schema.minLength}`);
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${at}: ${value} is below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${at}: ${value} is above maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value) && typeof schema.items === "object" && schema.items !== null) {
    const items = /** @type {Record<string, unknown>} */ (schema.items);
    value.forEach((item, index) => errors.push(...validate(item, items, root, `${path}[${index}]`)));
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const object = /** @type {Record<string, unknown>} */ (value);
    const properties =
      typeof schema.properties === "object" && schema.properties !== null
        ? /** @type {Record<string, unknown>} */ (schema.properties)
        : {};

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.hasOwn(object, String(key))) errors.push(`${at}: missing required property "${key}"`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${at}: unexpected property "${key}"`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) {
        errors.push(...validate(object[key], /** @type {Record<string, unknown>} */ (child), root, `${path}.${key}`));
      }
    }
  }

  for (const branch of Array.isArray(schema.allOf) ? schema.allOf : []) {
    errors.push(...validate(value, /** @type {Record<string, unknown>} */ (branch), root, path));
  }
  if (Array.isArray(schema.anyOf)) {
    const passed = schema.anyOf.some(
      (branch) => validate(value, /** @type {Record<string, unknown>} */ (branch), root, path).length === 0
    );
    if (!passed) errors.push(`${at}: matched none of the anyOf branches`);
  }
  if (Array.isArray(schema.oneOf)) {
    const passed = schema.oneOf.filter(
      (branch) => validate(value, /** @type {Record<string, unknown>} */ (branch), root, path).length === 0
    ).length;
    if (passed !== 1) errors.push(`${at}: matched ${passed} oneOf branches, expected exactly 1`);
  }

  if (typeof schema.if === "object" && schema.if !== null) {
    const matched = validate(value, /** @type {Record<string, unknown>} */ (schema.if), root, path).length === 0;
    const branch = matched ? schema.then : schema.else;
    if (typeof branch === "object" && branch !== null) {
      errors.push(...validate(value, /** @type {Record<string, unknown>} */ (branch), root, path));
    }
  }

  return errors;
}
