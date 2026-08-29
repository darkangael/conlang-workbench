import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle the real production validator so this regression test exercises the
// same runtime boundary Conlang Workbench uses when loading persisted settings.
const result = await build({
  entryPoints: ["settings-validation.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});

const source = result.outputFiles[0].text;
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");

const { normalizeClosedChoiceSettings } = await import(moduleUrl);

// Valid persisted choices must survive normalization unchanged. These values
// deliberately use non-default options so the test proves the validator is not
// simply overwriting every setting with its default.
const valid = {
  commitWrapper: "wikilink",
  hoverModifier: "ctrl",
  hoverFallback: "nothing",
  highlightStyle: "background",

  // Free-form creator configuration is outside this validator's authority.
  // Keeping a marker here protects against future broad "cleanup" accidentally
  // rewriting unrelated creator-controlled settings.
  creatorDefinedMarker: {
    languageName: "Unusual Language Name",
    category: "creator-defined-category",
  },
};

const validMarker = valid.creatorDefinedMarker;

normalizeClosedChoiceSettings(valid);

assert.equal(valid.commitWrapper, "wikilink");
assert.equal(valid.hoverModifier, "ctrl");
assert.equal(valid.hoverFallback, "nothing");
assert.equal(valid.highlightStyle, "background");
assert.strictEqual(valid.creatorDefinedMarker, validMarker);

// Persisted settings are runtime data, so malformed values are not limited to
// unexpected strings. Numbers, nulls, and objects must also fail closed to the
// documented defaults before rendering or mutation behavior consumes them.
const invalid = {
  commitWrapper: "unexpected-wrapper",
  hoverModifier: 42,
  hoverFallback: null,
  highlightStyle: { injected: "value" },
};

normalizeClosedChoiceSettings(invalid);

assert.equal(invalid.commitWrapper, "html-tooltip");
assert.equal(invalid.hoverModifier, "shift");
assert.equal(invalid.hoverFallback, "cypher");
assert.equal(invalid.highlightStyle, "underline");

console.log("settings validation security regression tests passed.");
