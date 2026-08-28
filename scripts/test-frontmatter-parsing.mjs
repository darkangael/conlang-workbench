import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle real TypeScript modules in memory so these tests exercise exactly the
// implementations used by Conlang Workbench rather than copied test versions.
async function importBundled(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });

  const source = result.outputFiles[0].text;
  const moduleUrl =
    "data:text/javascript;base64," + Buffer.from(source).toString("base64");

  return import(moduleUrl);
}

const { parseInflectedForms, parseStringList } =
  await importBundled("word-tokens.ts");

const {
  firstParsedFrontmatterValue,
  parseNonBlankYamlScalarText,
  parseYamlScalarText,
  parseYamlString,
} = await importBundled("frontmatter-values.ts");

const { createObsidianWorkbenchIdentity } =
  await importBundled("workbench-id.ts");

const { parseMorphemeSource } =
  await importBundled("morpheme-source.ts");

// ---------------------------------------------------------------------------
// Shared frontmatter value boundary
// ---------------------------------------------------------------------------

// Tolerant readers may interpret simple YAML scalars as text.
assert.equal(parseYamlScalarText("alpha"), "alpha");
assert.equal(parseYamlScalarText(42), "42");
assert.equal(parseYamlScalarText(true), "true");

// Structured data is never converted into implementation-generated text.
assert.equal(parseYamlScalarText({ unexpected: "shape" }), undefined);
assert.equal(parseYamlScalarText(["nested"]), undefined);

// Strict readers retain the ability to require actual YAML strings.
assert.equal(parseYamlString("alpha"), "alpha");
assert.equal(parseYamlString(42), undefined);
assert.equal(parseYamlString(true), undefined);

// Nonblank scalar parsing is specifically suitable for alias recovery.
assert.equal(parseNonBlankYamlScalarText("  alpha  "), "alpha");
assert.equal(parseNonBlankYamlScalarText("   "), undefined);
assert.equal(parseNonBlankYamlScalarText(42), "42");

// A malformed preferred alias must not hide a valid supported fallback.
assert.deepEqual(
  firstParsedFrontmatterValue(
    [
      { key: "morpheme_id", value: { malformed: "structure" } },
      { key: "id", value: "plural-s" },
    ],
    parseNonBlankYamlScalarText,
  ),
  {
    value: "plural-s",
    key: "id",
    rejectedKeys: ["morpheme_id"],
  },
);

// A blank preferred alias is likewise unusable and must not mask a fallback.
assert.deepEqual(
  firstParsedFrontmatterValue(
    [
      { key: "morpheme_id", value: "   " },
      { key: "id", value: "plural-s" },
    ],
    parseNonBlankYamlScalarText,
  ),
  {
    value: "plural-s",
    key: "id",
    rejectedKeys: ["morpheme_id"],
  },
);

// If no linguistic identity can be interpreted, the failure remains explicit.
// The future source-record layer can retain the Workbench source while the
// feature correctly receives no invented linguistic ID.
assert.deepEqual(
  firstParsedFrontmatterValue(
    [
      { key: "morpheme_id", value: { malformed: "structure" } },
      { key: "id", value: ["also", "malformed"] },
    ],
    parseNonBlankYamlScalarText,
  ),
  {
    rejectedKeys: ["morpheme_id", "id"],
  },
);

// Missing aliases are not errors and therefore are not reported as rejected.
assert.deepEqual(
  firstParsedFrontmatterValue(
    [
      { key: "morpheme_id", value: undefined },
      { key: "id", value: "plural-s" },
    ],
    parseNonBlankYamlScalarText,
  ),
  {
    value: "plural-s",
    key: "id",
    rejectedKeys: [],
  },
);

// ---------------------------------------------------------------------------
// Workbench/source/linguistic identity separation
// ---------------------------------------------------------------------------

const identity = createObsidianWorkbenchIdentity(
  "Languages/Test Language/Morphemes/plural s.md",
  "plural-s",
);

assert.equal(
  identity.workbenchID,
  "wb:obsidian-file:Languages%2FTest%20Language%2FMorphemes%2Fplural%20s.md",
);
assert.equal(
  identity.sourceID,
  "obsidian-file:Languages/Test Language/Morphemes/plural s.md",
);
assert.equal(identity.linguisticID, "plural-s");

// Workbench can still identify a known source when its linguistic identity is
// currently missing or malformed.
const malformedIdentity = createObsidianWorkbenchIdentity(
  "Languages/Test Language/Morphemes/broken.md",
);

assert.ok(malformedIdentity.workbenchID);
assert.ok(malformedIdentity.sourceID);
assert.equal(malformedIdentity.linguisticID, undefined);

// ---------------------------------------------------------------------------
// Morpheme source adapter
// ---------------------------------------------------------------------------

function makeMorphemeSource(frontmatter, overrides = {}) {
  return {
    path: "Languages/Test Language/Morphemes/test.md",
    basename: "test",
    mtime: 1234567890,
    frontmatter,
    ...overrides,
  };
}

// A canonical morpheme source produces both a Workbench source record and a
// clean linguistic object.
const validMorphemeRecord = parseMorphemeSource(
  makeMorphemeSource({
    type: "morpheme",
    morpheme_id: "plural-s",
    form: "-s",
    gloss: "plural",
  }),
);

assert.ok(validMorphemeRecord);
assert.equal(validMorphemeRecord.value?.id, "plural-s");
assert.equal(validMorphemeRecord.value?.form, "-s");
assert.equal(validMorphemeRecord.value?.gloss, "plural");
assert.equal(
  validMorphemeRecord.identity.linguisticID,
  "plural-s",
);
assert.equal(validMorphemeRecord.diagnostics.length, 0);

// A malformed preferred ID does not hide a valid compatibility alias.
// Workbench may recover the linguistic object while still reporting that the
// preferred source field could not be interpreted.
const recoveredIdRecord = parseMorphemeSource(
  makeMorphemeSource({
    type: "morpheme",
    morpheme_id: { malformed: "structure" },
    id: "plural-s",
    form: "-s",
    gloss: "plural",
  }),
);

assert.ok(recoveredIdRecord);
assert.equal(recoveredIdRecord.value?.id, "plural-s");
assert.equal(
  recoveredIdRecord.identity.linguisticID,
  "plural-s",
);
assert.ok(
  recoveredIdRecord.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "frontmatter.unusable-alias" &&
      diagnostic.field === "morpheme_id" &&
      diagnostic.severity === "warning",
  ),
);

// A blank preferred ID is also unusable and therefore must not hide a valid
// fallback identity.
const recoveredBlankIdRecord = parseMorphemeSource(
  makeMorphemeSource({
    type: "morpheme",
    morpheme_id: "   ",
    id: "plural-s",
    form: "-s",
    gloss: "plural",
  }),
);

assert.ok(recoveredBlankIdRecord);
assert.equal(recoveredBlankIdRecord.value?.id, "plural-s");
assert.ok(
  recoveredBlankIdRecord.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "frontmatter.unusable-alias" &&
      diagnostic.field === "morpheme_id",
  ),
);

// Once a source is positively identified as a morpheme, failure to interpret
// its linguistic ID no longer makes that source disappear from Workbench.
const malformedIdRecord = parseMorphemeSource(
  makeMorphemeSource({
    type: "morpheme",
    morpheme_id: { malformed: "structure" },
    id: ["also", "malformed"],
    form: "-s",
    gloss: "plural",
  }),
);

assert.ok(malformedIdRecord);
assert.equal(malformedIdRecord.value, null);
assert.ok(malformedIdRecord.identity.workbenchID);
assert.ok(malformedIdRecord.identity.sourceID);
assert.equal(malformedIdRecord.identity.linguisticID, undefined);
assert.ok(
  malformedIdRecord.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "morpheme.missing-id" &&
      diagnostic.severity === "error",
  ),
);

// Missing required semantic information behaves the same way: the source is
// retained, but Workbench does not manufacture a complete Morpheme object.
const missingGlossRecord = parseMorphemeSource(
  makeMorphemeSource({
    type: "morpheme",
    morpheme_id: "plural-s",
    form: "-s",
    gloss: { malformed: "structure" },
  }),
);

assert.ok(missingGlossRecord);
assert.equal(missingGlossRecord.value, null);
assert.equal(
  missingGlossRecord.identity.linguisticID,
  "plural-s",
);
assert.ok(
  missingGlossRecord.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "morpheme.missing-gloss" &&
      diagnostic.severity === "error",
  ),
);

// A malformed explicit form can safely fall back to the filename because the
// filename is an already-supported source of display form. The original YAML
// is not changed, and a diagnostic explains the recovery.
const recoveredFormRecord = parseMorphemeSource(
  makeMorphemeSource(
    {
      type: "morpheme",
      morpheme_id: "plural-s",
      form: { malformed: "structure" },
      gloss: "plural",
    },
    {
      basename: "fallback-form",
    },
  ),
);

assert.ok(recoveredFormRecord);
assert.equal(recoveredFormRecord.value?.form, "fallback-form");
assert.ok(
  recoveredFormRecord.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "frontmatter.unusable-value" &&
      diagnostic.field === "form" &&
      diagnostic.severity === "warning",
  ),
);

// Optional invalid distribution data does not invalidate the whole morpheme.
// It remains uninterpreted and is surfaced as a warning.
const distributionRecord = parseMorphemeSource(
  makeMorphemeSource({
    type: "morpheme",
    morpheme_id: "plural-s",
    form: "-s",
    gloss: "plural",
    distribution: "sometimes-ish",
  }),
);

assert.ok(distributionRecord);
assert.ok(distributionRecord.value);
assert.equal(distributionRecord.value.distribution, undefined);
assert.ok(
  distributionRecord.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "morpheme.unrecognized-distribution" &&
      diagnostic.field === "distribution" &&
      diagnostic.severity === "warning",
  ),
);

// A supporting Markdown note in the same folder is not automatically a broken
// morpheme. Until the source explicitly identifies itself as type:morpheme,
// this adapter has no authority to assign morpheme semantics or diagnostics.
assert.equal(
  parseMorphemeSource(
    makeMorphemeSource({
      title: "Morpheme notes",
    }),
  ),
  null,
);

// Likewise, another explicit document type must not be captured merely because
// it happens to live beneath the configured morpheme folder.
assert.equal(
  parseMorphemeSource(
    makeMorphemeSource({
      type: "phonological-unit",
      morpheme_id: "not-ours",
      gloss: "not a morpheme",
    }),
  ),
  null,
);

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
