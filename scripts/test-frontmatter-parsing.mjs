import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle the real TypeScript module in memory so these tests exercise exactly
// the parsing implementation used by Conlang Workbench.
const result = await build({
  entryPoints: ["word-tokens.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});

const source = result.outputFiles[0].text;
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");

const { parseInflectedForms, parseStringList } = await import(moduleUrl);

// ---------------------------------------------------------------------------
// parseStringList()
// ---------------------------------------------------------------------------

// Canonical YAML list-of-text remains supported.
assert.deepEqual(parseStringList(["alpha", "beta"]), ["alpha", "beta"]);

// Comma-separated strings remain supported for tolerant frontmatter reading.
assert.deepEqual(parseStringList("alpha, beta"), ["alpha", "beta"]);

// Simple YAML scalars inside a list remain tolerantly interpretable as text.
assert.deepEqual(parseStringList(["alpha", 42, true]), [
  "alpha",
  "42",
  "true",
]);

// Structured values are not silently converted into implementation-generated
// strings such as "[object Object]". Usable neighboring values are preserved.
assert.deepEqual(
  parseStringList(["alpha", { unexpected: "shape" }, "beta"]),
  ["alpha", "beta"],
);

// Nested arrays are likewise left uninterpreted.
assert.deepEqual(
  parseStringList(["alpha", ["nested", "array"], "beta"]),
  ["alpha", "beta"],
);

// A list containing only unsupported structures produces no interpreted data.
assert.equal(
  parseStringList([{ unexpected: "shape" }, ["nested"]]),
  undefined,
);

// Existing behavior is preserved: a bare numeric scalar is not itself treated
// as a list field.
assert.equal(parseStringList(42), undefined);

// ---------------------------------------------------------------------------
// parseInflectedForms()
// ---------------------------------------------------------------------------

// Canonical list-of-text form remains supported.
assert.deepEqual(
  parseInflectedForms(["plural: kalath", "genitive: kalen"]),
  [
    { label: "plural", form: "kalath" },
    { label: "genitive", form: "kalen" },
  ],
);

// Supported YAML map representation remains supported.
assert.deepEqual(parseInflectedForms({ plural: "kalath" }), [
  { label: "plural", form: "kalath" },
]);

// Supported list-of-single-key-maps representation remains supported.
assert.deepEqual(parseInflectedForms([{ plural: "kalath" }]), [
  { label: "plural", form: "kalath" },
]);

// Multiple forms under one map key remain supported.
assert.deepEqual(
  parseInflectedForms({ dative: ["kalim", "kalum"] }),
  [
    { label: "dative", form: "kalim" },
    { label: "dative", form: "kalum" },
  ],
);

// Simple scalar values in explicitly supported map/list structures remain
// tolerantly interpretable.
assert.deepEqual(
  parseInflectedForms([{ number: 42 }, { enabled: true }]),
  [
    { label: "number", form: "42" },
    { label: "enabled", form: "true" },
  ],
);

// Unsupported nested structures are skipped rather than becoming invented
// text such as "[object Object]".
assert.deepEqual(
  parseInflectedForms([
    "plural: kalath",
    [["nested"]],
    { genitive: { unexpected: "shape" } },
    "dative: kalim",
  ]),
  [
    { label: "plural", form: "kalath" },
    { label: "dative", form: "kalim" },
  ],
);

console.log("frontmatter parsing data-safety regression tests passed.");
