import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// ---------------------------------------------------------------------------
// Stable lexical identity regression harness
//
// Bundle the real pure identity component so these tests exercise the exact
// normalization, language-scope, multiplicity, and equivalence semantics used
// by runtime consumers.
// ---------------------------------------------------------------------------
const tempDir = mkdtempSync(join(tmpdir(), "conlang-lexical-identity-"));
const outfile = join(tempDir, "lexical-identity.mjs");

try {
  buildSync({
    entryPoints: ["lexical-identity.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { LexicalIdentityIndex } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const merRiver = {
    word: "talu",
    definition: "river",
    path: "Languages/Mer/Lexicon/talu.md",
    language: "Mer",
    languageId: "mer",
    lexemeId: "River-001",
  };

  const merRiverDuplicate = {
    word: "talu-old",
    definition: "river",
    path: "Languages/Mer/Lexicon/talu-old.md",
    language: "Mer",
    languageId: "mer",
    lexemeId: "river-001",
  };

  const testRiver = {
    word: "talu",
    definition: "river",
    path: "Languages/Test Language/Lexicon/talu.md",
    language: "Test Language",
    languageId: "test-language",
    lexemeId: "river-001",
  };

  const merLegacy = {
    word: "legacy",
    definition: "legacy",
    path: "Languages/Mer/Lexicon/legacy.md",
    language: "Mer",
    languageId: "mer",
  };

  // -----------------------------------------------------------------------
  // Resolution
  // -----------------------------------------------------------------------
  const index = new LexicalIdentityIndex();

  index.add(merRiver);
  index.add(merRiverDuplicate);
  index.add(testRiver);
  index.add(merLegacy);

  assert.equal(
    index.resolve("missing", "mer", "Mer").status,
    "unresolved",
    "an unknown stable ID must remain explicitly unresolved",
  );

  const testLanguageResolution = index.resolve(
    "RIVER-001",
    "test-language",
    "Test Language",
  );

  assert.equal(
    testLanguageResolution.status,
    "unique",
    "ID lookup must be case-insensitive and language-scoped",
  );
  assert.equal(testLanguageResolution.targets[0], testRiver);

  const merResolution = index.resolve("river-001", "mer", "Mer");

  assert.equal(
    merResolution.status,
    "ambiguous",
    "duplicate stable IDs inside one language must remain ambiguous",
  );
  assert.deepEqual(
    merResolution.targets,
    [merRiver, merRiverDuplicate],
    "duplicate targets must be retained rather than silently selecting one",
  );

  assert.equal(
    index.resolve("   ", "mer", "Mer").status,
    "unresolved",
    "blank lookup IDs must not establish identity",
  );

  const trimmedResolution = index.resolve(
    "  RIVER-001  ",
    "test-language",
    "Test Language",
  );

  assert.equal(
    trimmedResolution.status,
    "unique",
    "stable-ID lookup must trim surrounding whitespace",
  );
  assert.equal(trimmedResolution.targets[0], testRiver);

  const genericResolution = index.resolve("river-001");

  assert.equal(
    genericResolution.status,
    "ambiguous",
    "an unscoped lookup must retain every matching loaded lexical identity",
  );
  assert.deepEqual(genericResolution.targets, [
    merRiver,
    merRiverDuplicate,
    testRiver,
  ]);

  // ID-less legacy entries must not enter the stable-ID index.
  assert.equal(
    index.resolve("legacy", "mer", "Mer").status,
    "unresolved",
    "legacy headwords must never be manufactured into stable IDs",
  );

  // -----------------------------------------------------------------------
  // Equivalence
  // -----------------------------------------------------------------------
  const uniqueIndex = new LexicalIdentityIndex();

  const merRiverAliasObject = {
    ...merRiver,
    word: "taluu",
    path: "Languages/Mer/Lexicon/taluu.md",
    lexemeId: " river-001 ",
  };

  uniqueIndex.add(merRiver);

  assert.equal(
    uniqueIndex.compare(merRiver, merRiverAliasObject),
    "same",
    "same stable lexical identity and scope must compare as the same lexeme",
  );

  const differentMerLexeme = {
    word: "naru",
    definition: "stream",
    path: "Languages/Mer/Lexicon/naru.md",
    language: "Mer",
    languageId: "mer",
    lexemeId: "river-002",
  };

  uniqueIndex.add(differentMerLexeme);

  assert.equal(
    uniqueIndex.compare(merRiver, differentMerLexeme),
    "different",
    "different usable stable IDs must compare as different lexemes",
  );

  assert.equal(
    index.compare(merRiver, merRiverDuplicate),
    "indeterminate",
    "duplicate-ID ambiguity must not be collapsed into sameness",
  );

  assert.equal(
    uniqueIndex.compare(merRiver, merLegacy),
    "indeterminate",
    "stable identity cannot infer equivalence between ID-bearing and ID-less entries",
  );

  const anotherLegacyEntry = {
    word: "legacy-too",
    definition: "legacy",
    path: "Languages/Mer/Lexicon/legacy-too.md",
    language: "Mer",
    languageId: "mer",
  };

  assert.equal(
    uniqueIndex.compare(merLegacy, anotherLegacyEntry),
    "indeterminate",
    "legacy path fallback belongs to consumers, not the pure identity layer",
  );

  // Same normalized ID in different uniquely scoped languages is not the same
  // lexical object.
  const crossLanguageIndex = new LexicalIdentityIndex();
  crossLanguageIndex.add(merRiver);
  crossLanguageIndex.add(testRiver);

  assert.equal(
    crossLanguageIndex.compare(merRiver, testRiver),
    "different",
    "same local ID in distinct language scopes must not imply lexical sameness",
  );

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------
  index.clear();

  assert.equal(
    index.resolve("river-001", "mer", "Mer").status,
    "unresolved",
    "clear() must remove all stable lexical identity state",
  );

  console.log("lexical identity regression tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
