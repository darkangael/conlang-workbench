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
  // Top-level portable IDs collide only inside one language and object type.
  // -------------------------------------------------------------------------
  const lexemeA = record({
    path: "Languages/Mer/Lexicon/current-a.md",
    linguisticID: "Shared-Lexeme",
    value: {
      language: "Mer",
      languageId: "mer",
    },
  });

  const lexemeB = record({
    path: "Languages/Mer/Lexicon/current-b.md",
    linguisticID: "shared-lexeme",
    value: {
      language: "Mer",
      languageId: "mer",
    },
  });

  const otherLanguageLexeme = record({
    path: "Languages/Test Language/Lexicon/current.md",
    linguisticID: "shared-lexeme",
    value: {
      language: "Test Language",
      languageId: "test-language",
    },
  });

  const morphemeA = record({
    path: "Languages/Mer/Morphemes/current-a.md",
    linguisticID: "shared-lexeme",
    value: {
      language: "Mer",
      languageId: "mer",
    },
  });

  const morphemeB = record({
    path: "Languages/Mer/Morphemes/current-b.md",
    linguisticID: "shared-lexeme",
    value: {
      language: "Mer",
      languageId: "mer",
    },
  });

  const topLevelCollisions = buildSourceDiagnosticGroups({
    records: [],
    dictionaryRecords: [
      lexemeA,
      lexemeB,
      otherLanguageLexeme,
    ],
    morphemeRecords: [morphemeA, morphemeB],
  });

  assert.deepEqual(
    topLevelCollisions.map((group) => group.path),
    [
      "Languages/Mer/Lexicon/current-a.md",
      "Languages/Mer/Lexicon/current-b.md",
      "Languages/Mer/Morphemes/current-a.md",
      "Languages/Mer/Morphemes/current-b.md",
    ],
    "same-language collisions must affect both notes without crossing language or object-type domains",
  );

  for (const group of topLevelCollisions.slice(0, 2)) {
    assert.equal(
      group.diagnostics[0].code,
      "identity.duplicate-lexeme-id",
    );
    assert.equal(group.diagnostics[0].field, "lexeme_id");
  }

  for (const group of topLevelCollisions.slice(2)) {
    assert.equal(
      group.diagnostics[0].code,
      "identity.duplicate-morpheme-id",
    );
    assert.equal(group.diagnostics[0].field, "morpheme_id");
  }

  assert.ok(
    topLevelCollisions[0].diagnostics[0].message.includes(
      "Languages/Mer/Lexicon/current-b.md",
    ),
    "each collision warning must name the other note the creator can open and compare",
  );

  // -------------------------------------------------------------------------
  // Every remaining top-level document type keeps an independent ID domain.
  // -------------------------------------------------------------------------
  const exampleA = record({
    path: "Languages/Mer/Examples/example-a.md",
    linguisticID: "shared-example",
    value: { language: "Mer", languageId: "mer" },
  });

  const exampleB = record({
    path: "Languages/Mer/Examples/example-b.md",
    linguisticID: "shared-example",
    value: { language: "Mer", languageId: "mer" },
  });

  const unitA = record({
    path: "Languages/Mer/Phonology/unit-a.md",
    linguisticID: "duplicate-unit",
    value: {
      id: "duplicate-unit",
      language: "Mer",
      languageId: "mer",
    },
  });

  const unitB = record({
    path: "Languages/Mer/Phonology/unit-b.md",
    linguisticID: "duplicate-unit",
    value: {
      id: "duplicate-unit",
      language: "Mer",
      languageId: "mer",
    },
  });

  const uniqueTarget = record({
    path: "Languages/Mer/Phonology/unique-target.md",
    linguisticID: "unique-target",
    value: {
      id: "unique-target",
      language: "Mer",
      languageId: "mer",
    },
  });

  const realizationA = record({
    path: "Languages/Mer/Phonology/realization-a.md",
    linguisticID: "shared-realization",
    value: {
      unitId: "unique-target",
      language: "Mer",
      languageId: "mer",
    },
  });

  const realizationB = record({
    path: "Languages/Mer/Phonology/realization-b.md",
    linguisticID: "shared-realization",
    value: {
      unitId: "unique-target",
      language: "Mer",
      languageId: "mer",
    },
  });

  const remainingObjectCollisions = buildSourceDiagnosticGroups({
    records: [],
    exampleRecords: [exampleA, exampleB],
    phonologyUnitRecords: [unitA, unitB, uniqueTarget],
    phonologyRealizationRecords: [realizationA, realizationB],
  });

  assert.deepEqual(
    remainingObjectCollisions.map((group) => [
      group.path,
      group.diagnostics[0].code,
    ]),
    [
      [
        "Languages/Mer/Examples/example-a.md",
        "identity.duplicate-example-id",
      ],
      [
        "Languages/Mer/Examples/example-b.md",
        "identity.duplicate-example-id",
      ],
      [
        "Languages/Mer/Phonology/realization-a.md",
        "identity.duplicate-realization-id",
      ],
      [
        "Languages/Mer/Phonology/realization-b.md",
        "identity.duplicate-realization-id",
      ],
      [
        "Languages/Mer/Phonology/unit-a.md",
        "identity.duplicate-unit-id",
      ],
      [
        "Languages/Mer/Phonology/unit-b.md",
        "identity.duplicate-unit-id",
      ],
    ],
    "examples, units, and realizations must report collisions only inside their own object domains",
  );

  assert.equal(
    remainingObjectCollisions.some(
      (group) => group.path === uniqueTarget.path,
    ),
    false,
    "a uniquely identified relationship target must not receive a diagnostic",
  );

  // -------------------------------------------------------------------------
  // Language Profile IDs are source-wide; sense IDs are lexeme-local.
  // -------------------------------------------------------------------------
  const senseCollisionEntry = record({
    path: "Languages/Mer/Lexicon/polysemous.md",
    linguisticID: "lex-polysemous",
    value: {
      language: "Mer",
      languageId: "mer",
      senses: [
        { id: "current" },
        { id: "current" },
        { id: "flow" },
      ],
    },
  });

  const independentSenseEntry = record({
    path: "Languages/Mer/Lexicon/independent.md",
    linguisticID: "lex-independent",
    value: {
      language: "Mer",
      languageId: "mer",
      senses: [{ id: "current" }],
    },
  });

  const nestedAndProfileCollisions = buildSourceDiagnosticGroups({
    records: [],
    languageProfiles: [
      {
        id: "shared-language-id",
        path: "Reference/Mer Profile.md",
      },
      {
        id: "shared-language-id",
        path: "Reference/Test Profile.md",
      },
      {
        // Repeating one physical path must not create a third source.
        id: "shared-language-id",
        path: "Reference/Mer Profile.md",
      },
      {
        id: "unique-language-id",
        path: "Reference/Unique Profile.md",
      },
    ],
    dictionaryRecords: [
      senseCollisionEntry,
      independentSenseEntry,
    ],
  });

  assert.equal(
    nestedAndProfileCollisions.length,
    3,
    "two profile notes and one lexical note should receive diagnostics",
  );

  const senseGroup = nestedAndProfileCollisions.find(
    (group) => group.path === senseCollisionEntry.path,
  );

  assert.ok(senseGroup);
  assert.equal(
    senseGroup.diagnostics[0].code,
    "identity.duplicate-lexical-sense-id",
  );
  assert.equal(senseGroup.diagnostics[0].field, "Senses / ID");
  assert.ok(
    senseGroup.diagnostics[0].message.includes("appears 2 times"),
    "the owning lexical note should explain how many nested senses collide",
  );

  assert.equal(
    nestedAndProfileCollisions.some(
      (group) => group.path === independentSenseEntry.path,
    ),
    false,
    "the same sense ID in another lexeme belongs to a different nested domain",
  );

  const profileGroups = nestedAndProfileCollisions.filter(
    (group) =>
      group.diagnostics[0].code === "identity.duplicate-language-id",
  );

  assert.deepEqual(
    profileGroups.map((group) => group.path),
    [
      "Reference/Mer Profile.md",
      "Reference/Test Profile.md",
    ],
    "each distinct colliding profile note must receive one navigable diagnostic",
  );

  assert.ok(
    profileGroups[0].diagnostics[0].message.includes(
      "Reference/Test Profile.md",
    ),
    "each profile warning must name the other affected note",
  );

  // -------------------------------------------------------------------------
  // Lexical parts use owning-language scope and explicit target cardinality.
  // -------------------------------------------------------------------------
  const compoundOwner = record({
    path: "Languages/Mer/Lexicon/compound.md",
    value: {
      word: "compound",
      parts: ["root", "other-language-only", "shared-part"],
      language: "Mer",
      languageId: "mer-language",
    },
  });

  const uniqueRoot = record({
    path: "Languages/Mer/Lexicon/root.md",
    value: {
      word: "root",
      language: "Mer",
      languageId: "mer-language",
    },
  });

  const otherLanguageOnlyRoot = record({
    path: "Languages/Test Language/Lexicon/other-language-only.md",
    value: {
      word: "other-language-only",
      language: "Test Language",
      languageId: "test-language",
    },
  });

  const ambiguousRootA = record({
    path: "Languages/Mer/Lexicon/shared-part-a.md",
    value: {
      word: "shared-part",
      language: "Mer",
      languageId: "mer-language",
    },
  });

  const ambiguousRootB = record({
    path: "Languages/Mer/Lexicon/shared-part-b.md",
    value: {
      word: "other-headword",
      aliases: ["shared-part"],
      language: "Mer",
      languageId: "mer-language",
    },
  });

  const lexicalPartDiagnostics = buildSourceDiagnosticGroups({
    records: [],
    dictionaryRecords: [
      compoundOwner,
      uniqueRoot,
      otherLanguageOnlyRoot,
      ambiguousRootA,
      ambiguousRootB,
    ],
    caseSensitiveMatching: false,
  });

  assert.equal(
    lexicalPartDiagnostics.length,
    1,
    "only the owning compound note should receive relationship diagnostics",
  );
  assert.equal(lexicalPartDiagnostics[0].path, compoundOwner.path);
  assert.deepEqual(
    lexicalPartDiagnostics[0].diagnostics.map(
      (diagnostic) => diagnostic.code,
    ),
    [
      "dictionary.parts.unresolved-target",
      "dictionary.parts.ambiguous-target",
    ],
    "a unique local target is clean, a target belonging only to another language is unresolved, and several local targets are ambiguous",
  );

  assert.ok(
    lexicalPartDiagnostics[0].diagnostics[0].message.includes(
      "other-language-only",
    ),
    "the unresolved warning must preserve the creator-authored part text",
  );

  const ambiguousPartDiagnostic =
    lexicalPartDiagnostics[0].diagnostics[1];

  assert.ok(
    ambiguousPartDiagnostic.message.includes(ambiguousRootA.path) &&
      ambiguousPartDiagnostic.message.includes(ambiguousRootB.path),
    "the ambiguous warning must name every same-language candidate path",
  );
  assert.equal(
    ambiguousPartDiagnostic.message.includes(otherLanguageOnlyRoot.path),
    false,
    "another language must never enter the candidate target list",
  );

  // The settled case policy must match the live Dictionary index. The same
  // source pair is clean in case-insensitive mode and unresolved when exact
  // case is required.
  const caseOwner = record({
    path: "Languages/Mer/Lexicon/case-compound.md",
    value: {
      word: "case-compound",
      parts: ["CASE-ROOT"],
      language: "Mer",
      languageId: "mer-language",
    },
  });

  const caseRoot = record({
    path: "Languages/Mer/Lexicon/case-root.md",
    value: {
      word: "case-root",
      language: "Mer",
      languageId: "mer-language",
    },
  });

  assert.deepEqual(
    buildSourceDiagnosticGroups({
      records: [],
      dictionaryRecords: [caseOwner, caseRoot],
      caseSensitiveMatching: false,
    }),
    [],
    "case-insensitive diagnostics must recognize the same target as the Dictionary index",
  );

  const caseSensitivePartDiagnostics = buildSourceDiagnosticGroups({
    records: [],
    dictionaryRecords: [caseOwner, caseRoot],
    caseSensitiveMatching: true,
  });

  assert.equal(caseSensitivePartDiagnostics.length, 1);
  assert.equal(
    caseSensitivePartDiagnostics[0].diagnostics[0].code,
    "dictionary.parts.unresolved-target",
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
  // More than one same-language unit makes the relationship ambiguous.
  // -------------------------------------------------------------------------
  const duplicateTestUnit = record({
    path: "Languages/Test Language/Phonology/p-copy.md",
    linguisticID: "p",
    value: {
      id: "p",
      language: "Test Language",
      languageId: "test-language",
    },
  });

  const ambiguousRelationship = buildSourceDiagnosticGroups({
    records: [],
    phonologyUnitRecords: [testUnit, duplicateTestUnit],
    phonologyRealizationRecords: [testRealization],
  });

  assert.equal(
    ambiguousRelationship.length,
    3,
    "both duplicate unit notes and the realization note must be diagnosed",
  );

  const ambiguousRealizationGroup = ambiguousRelationship.find(
    (group) => group.path === testRealization.path,
  );

  assert.ok(ambiguousRealizationGroup);
  assert.equal(
    ambiguousRealizationGroup.diagnostics[0].code,
    "phonology.realization.ambiguous-unit",
  );
  assert.ok(
    ambiguousRealizationGroup.diagnostics[0].message.includes(
      testUnit.path,
    ) &&
      ambiguousRealizationGroup.diagnostics[0].message.includes(
        duplicateTestUnit.path,
      ),
    "the realization warning must name every candidate target note",
  );

  for (const unitPath of [testUnit.path, duplicateTestUnit.path]) {
    const unitGroup = ambiguousRelationship.find(
      (group) => group.path === unitPath,
    );

    assert.ok(unitGroup);
    assert.equal(
      unitGroup.diagnostics[0].code,
      "identity.duplicate-unit-id",
    );
  }

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
