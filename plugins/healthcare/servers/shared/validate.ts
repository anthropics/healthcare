// Single-file JSON Schema validator for the subset our tools and tables use:
// type / anyOf / enum / pattern / min-max (length, items, value) / properties /
// required / items. One recursive walk, dispatch by keyword — the schema is
// the program. Errors name the path and the rule so a model can correct and
// resend, which is the whole reason validation exists here.

type S = Record<string, unknown>;

function fail(path: string, msg: string): never {
  throw new Error(`${path || "arguments"} ${msg}`);
}

const TYPE: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
};

export function check(schema: S, v: unknown, path = ""): void {
  if (Array.isArray(schema.anyOf)) {
    const errs: string[] = [];
    for (const sub of schema.anyOf as S[]) {
      try {
        check(sub, v, path);
        return;
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    fail(path, `matches none of the allowed forms (${errs.join(" | ")})`);
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some((t) => TYPE[t as string]?.(v))) fail(path, `must be ${types.join(" or ")}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(v))
    fail(path, `must be one of: ${(schema.enum as unknown[]).join(", ")}`);
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
    if (schema.items) v.forEach((x, i) => check(schema.items as S, x, `${path}[${i}]`));
  }
  if (TYPE.object!(v) && schema.properties) {
    const obj = v as Record<string, unknown>;
    for (const k of (schema.required as string[]) ?? [])
      if (obj[k] === undefined) fail(path, `is missing required field '${k}'`);
    for (const [k, sub] of Object.entries(schema.properties as Record<string, S>)) {
      if (obj[k] !== undefined) check(sub, obj[k], path ? `${path}.${k}` : k);
    }
  }
}

/** Validate against an object schema, then return only the schema-declared
 *  properties — unknown keys are dropped (parity with the zod-era stripping,
 *  which handlers rely on when they rest-spread). */
export function checkAndStrip(name: string, schema: S, value: unknown): Record<string, unknown> {
  const v = (value ?? {}) as Record<string, unknown>;
  try {
    check(schema, v);
  } catch (e) {
    throw new Error(`${name}: ${(e as Error).message}`);
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys((schema.properties as S) ?? {})) if (v[k] !== undefined) out[k] = v[k];
  return out;
}
