// Single-file JSON Schema validator for the subset our tools and tables use:
// type / anyOf / enum / pattern / min-max (length, items, value) / properties /
// required / items. One recursive walk, dispatch by keyword — the schema is
// the program. Errors name the path and the rule so a model can correct and
// resend, which is the whole reason validation exists here.

/** @typedef {Record<string, unknown>} S */

function fail(path, msg) {
  throw new Error(`${path || "arguments"} ${msg}`);
}

const TYPE = {
  string: (v) => typeof v === "string",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
};

/**
 * @param {S} schema
 * @param {unknown} v
 * @param {string} [path]
 * @returns {void}
 */
export function check(schema, v, path = "") {
  if (Array.isArray(schema.anyOf)) {
    const errs = [];
    for (const sub of schema.anyOf) {
      try {
        check(sub, v, path);
        return;
      } catch (e) {
        errs.push(e.message);
      }
    }
    fail(path, `matches none of the allowed forms (${errs.join(" | ")})`);
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some((t) => TYPE[t]?.(v))) fail(path, `must be ${types.join(" or ")}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(v))
    fail(path, `must be one of: ${schema.enum.join(", ")}`);
  if (typeof v === "string") {
    if (typeof schema.minLength === "number" && v.length < schema.minLength)
      fail(path, `must be at least ${schema.minLength} character(s)`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(v))
      fail(path, `does not match required pattern ${schema.pattern}`);
  }
  if (typeof v === "number") {
    if (typeof schema.minimum === "number" && v < schema.minimum) fail(path, `must be >= ${schema.minimum}`);
    if (typeof schema.maximum === "number" && v > schema.maximum) fail(path, `must be <= ${schema.maximum}`);
  }
  if (Array.isArray(v)) {
    if (typeof schema.minItems === "number" && v.length < schema.minItems)
      fail(path, `needs at least ${schema.minItems} item(s)`);
    if (typeof schema.maxItems === "number" && v.length > schema.maxItems)
      fail(path, `allows at most ${schema.maxItems} item(s)`);
    if (schema.items) v.forEach((x, i) => check(/** @type {S} */ (schema.items), x, `${path}[${i}]`));
  }
  if (TYPE.object(v) && schema.properties) {
    const obj = v;
    for (const k of /** @type {string[]} */ (schema.required) ?? [])
      if (obj[k] === undefined) fail(path, `is missing required field '${k}'`);
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (obj[k] !== undefined) check(sub, obj[k], path ? `${path}.${k}` : k);
    }
  }
}

/** Validate against an object schema, then return only the schema-declared
 *  properties — unknown keys are dropped (parity with the zod-era stripping,
 *  which handlers rely on when they rest-spread).
 * @param {string} name
 * @param {S} schema
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function checkAndStrip(name, schema, value) {
  const v = value ?? {};
  try {
    check(schema, v);
  } catch (e) {
    throw new Error(`${name}: ${e.message}`, { cause: e });
  }
  const out = /** @type {Record<string, unknown>} */ ({});
  for (const k of Object.keys(schema.properties ?? {})) if (v[k] !== undefined) out[k] = v[k];
  return out;
}
