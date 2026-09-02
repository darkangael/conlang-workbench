import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// ---------------------------------------------------------------------------
// Creator-facing source-diagnostics regression harness
//
// Bundle the real TypeScript module so these tests exercise the same pure
// aggregation and relationship-validation logic production will import.
// ---------------------------------------------------------------------------
const tempDir = mkdtempSync(join(tmpdir(), "conlang-source-diagnostics-"));
const outfile = join(tempDir, "source-diagnostics.mjs");

try {
  buildSync({
    entryPoints: ["source-diagnostics.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { buildSourceDiagnosticGroups } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  /**
   * Construct the source identity shape Workbench normally derives from an
   * Obsidian path.
   *
   * These tests do not need Obsidian itself because aggregation consumes the
   * already-established source record rather than scanning the vault.
   */
  const identityFor = (path, linguisticID) => ({
    workbenchID: `wb:test:${encodeURIComponent(path)}`,
    sourceID: `test:${path}`,
    linguisticID,
  });

  const record = ({
    path,
    value = {},
    diagnostics = [],
    linguisticID,
  }) => ({
    identity: identityFor(path, linguisticID),
    path,
    value,
    diagnostics,
  });

  // -------------------------------------------------------------------------
  // Existing parser diagnostics are grouped by source.
  // -------------------------------------------------------------------------
  const malformedLexeme = record({
    path: "Languages/Test Language/Lexicon/broken.md",
    value: null,
    diagnostics: [
      {
        code: "dictionary.entry.missing-definition",
        severity: "error",
        field: "definition",
        message: "No usable definition.",
      },
      {
        code: "frontmatter.unusable-alias",
        severity: "warning",
        field: "gloss",
        message: "Gloss was unusable.",
      },
    ],
  });

  const groupedMalformed = buildSourceDiagnosticGroups({
    records: [malformedLexeme],
  });

  assert.equal(groupedMalformed.length, 1);
  assert.equal(
    groupedMalformed[0].path,
    "Languages/Test Language/Lexicon/broken.md",
  );
  assert.equal(groupedMalformed[0].severity, "error");
  assert.equal(groupedMalformed[0].diagnostics.length, 2);

  // A clean source contributes no card. Diagnostics is a problem surface, not
  // a list of successful parses.
  const clean = record({
    path: "Languages/Test Language/Lexicon/clean.md",
    diagnostics: [],
  });

  assert.deepEqual(
    buildSourceDiagnosticGroups({ records: [clean] }),
    [],
  );

  // -------------------------------------------------------------------------
  // Repeated collection of the same source issue must not duplicate it.
  // -------------------------------------------------------------------------
  const sharedIdentity = identityFor(
    "Languages/Test Language/Phonology/shared.md",
    "p",
  );

  const repeatedDiagnostic = {
    code: "frontmatter.unusable-alias",
    severity: "warning",
    field: "unit_id",
    message: "Preferred alias was unusable.",
  };

  const duplicateA = {
    identity: sharedIdentity,
    path: "Languages/Test Language/Phonology/shared.md",
    value: {},
    diagnostics: [repeatedDiagnostic],
  };

  const duplicateB = {
    identity: sharedIdentity,
    path: "Languages/Test Language/Phonology/shared.md",
    value: {},
    diagnostics: [repeatedDiagnostic],
  };

  const deduplicated = buildSourceDiagnosticGroups({
    records: [duplicateA, duplicateB],
  });

  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0].diagnostics.length, 1);

  // -------------------------------------------------------------------------
  // Structurally valid but unresolved phonology references are diagnosed.
  // -------------------------------------------------------------------------
  const merUnit = record({
    path: "Languages/Mer/Phonology/p.md",
    linguisticID: "p",
    value: {
      id: "p",
      language: "Mer",
      languageId: "mer",
    },
  });

  const testRealization = record({
    path: "Languages/Test Language/Phonology/p-aspirated.md",
    linguisticID: "p-aspirated",
    value: {
      unitId: "p",
      language: "Test Language",
      languageId: "test-language",
    },
  });

  const unresolved = buildSourceDiagnosticGroups({
    records: [],
    phonologyUnitRecords: [merUnit],
    phonologyRealizationRecords: [testRealization],
  });

  assert.equal(unresolved.length, 1);
  assert.equal(
    unresolved[0].path,
    "Languages/Test Language/Phonology/p-aspirated.md",
  );
  assert.equal(unresolved[0].severity, "warning");
  assert.equal(
    unresolved[0].diagnostics[0].code,
    "phonology.realization.unresolved-unit",
  );
  assert.equal(unresolved[0].diagnostics[0].field, "unit_id");

  // A same-ID unit in another language must not falsely satisfy the reference.
  // Adding the correct same-language unit resolves it.
  const testUnit = record({
    path: "Languages/Test Language/Phonology/p.md",
    linguisticID: "p",
    value: {
      id: "p",
      language: "Test Language",
      languageId: "test-language",
    },
  });

  assert.deepEqual(
    buildSourceDiagnosticGroups({
      records: [],
      phonologyUnitRecords: [merUnit, testUnit],
      phonologyRealizationRecords: [testRealization],
    }),
    [],
  );

  // -------------------------------------------------------------------------
  // Severity and stable path ordering.
  // -------------------------------------------------------------------------
  const warningZ = record({
    path: "Languages/Test Language/Morphemes/z.md",
    diagnostics: [
      {
        code: "test.warning",
        severity: "warning",
        message: "Warning.",
      },
    ],
  });

  const warningA = record({
    path: "Languages/Test Language/Morphemes/a.md",
    diagnostics: [
      {
        code: "test.warning",
        severity: "warning",
        message: "Warning.",
      },
    ],
  });

  const errorM = record({
    path: "Languages/Test Language/Morphemes/m.md",
    value: null,
    diagnostics: [
      {
        code: "test.error",
        severity: "error",
        message: "Error.",
      },
    ],
  });

  const sorted = buildSourceDiagnosticGroups({
    records: [warningZ, errorM, warningA],
  });

  assert.deepEqual(
    sorted.map((group) => group.path),
    [
      "Languages/Test Language/Morphemes/m.md",
      "Languages/Test Language/Morphemes/a.md",
      "Languages/Test Language/Morphemes/z.md",
    ],
  );

  console.log("source-diagnostics regression tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
