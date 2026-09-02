import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// ---------------------------------------------------------------------------
// Source-language authority regression harness
//
// Bundle the real TypeScript helper so these tests exercise the same pure
// contextual authority policy that Dictionary, Morphemes, Phonology, and
// Linguistic Examples will share.
//
// The helper receives scalar language-scope facts only. These tests therefore
// establish authority decisions without granting it access to feature objects,
// source records, the vault, or any creator-authored file.
// ---------------------------------------------------------------------------
const tempDir = mkdtempSync(join(tmpdir(), "conlang-source-language-authority-"));
const outfile = join(tempDir, "source-language-authority.mjs");

try {
  buildSync({
    entryPoints: ["source-language-authority.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { resolveSourceLanguageAuthority } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  // Matching readable and stable language identity is accepted unchanged.
  assert.deepEqual(
    resolveSourceLanguageAuthority({
      configuredLanguage: "Mer",
      configuredLanguageId: "mer-language",
      explicitLanguage: "Mer",
      explicitLanguageId: "mer-language",
      membershipMode: "respect-explicit",
    }),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      runtimeLanguageId: "mer-language",
    },
  );

  // Legacy sources remain compatible: missing stable identity may inherit the
  // configured canonical Language Profile ID in runtime only.
  assert.deepEqual(
    resolveSourceLanguageAuthority({
      configuredLanguage: "Mer",
      configuredLanguageId: "mer-language",
      explicitLanguage: "Mer",
      membershipMode: "respect-explicit",
    }),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      runtimeLanguageId: "mer-language",
    },
  );

  // A caller with no configured stable ID must preserve an explicit source ID
  // rather than dropping it or manufacturing a replacement.
  assert.deepEqual(
    resolveSourceLanguageAuthority({
      configuredLanguage: "Mer",
      explicitLanguage: "Mer",
      explicitLanguageId: "creator-mer-id",
      membershipMode: "respect-explicit",
    }),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      runtimeLanguageId: "creator-mer-id",
    },
  );

  // Respect-explicit mode preserves the historical readable-language boundary.
  const readableMismatch = resolveSourceLanguageAuthority({
    configuredLanguage: "Mer",
    configuredLanguageId: "mer-language",
    explicitLanguage: "Test Language",
    membershipMode: "respect-explicit",
  });

  assert.equal(readableMismatch.accepted, false);
  assert.equal(
    readableMismatch.diagnostic.code,
    "language.membership-mismatch",
  );
  assert.equal(readableMismatch.diagnostic.severity, "warning");
  assert.equal(readableMismatch.diagnostic.field, "language");

  // Folder mode deliberately allows a stale/different readable `language:`
  // value while assigning the configured readable language in runtime.
  assert.deepEqual(
    resolveSourceLanguageAuthority({
      configuredLanguage: "Mer",
      configuredLanguageId: "mer-language",
      explicitLanguage: "Test Language",
      membershipMode: "folder",
    }),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      runtimeLanguageId: "mer-language",
    },
  );

  // Stable language identity is stronger than readable folder membership.
  // An explicit conflict fails closed even in respect-explicit mode.
  const idMismatch = resolveSourceLanguageAuthority({
    configuredLanguage: "Mer",
    configuredLanguageId: "mer-language",
    explicitLanguage: "Mer",
    explicitLanguageId: "test-language",
    membershipMode: "respect-explicit",
  });

  assert.equal(idMismatch.accepted, false);
  assert.equal(idMismatch.diagnostic.code, "language.id-mismatch");
  assert.equal(idMismatch.diagnostic.severity, "warning");
  assert.equal(idMismatch.diagnostic.field, "language_id");

  // Folder authority must not override an explicit conflicting stable ID.
  const folderIdMismatch = resolveSourceLanguageAuthority({
    configuredLanguage: "Mer",
    configuredLanguageId: "mer-language",
    explicitLanguage: "Test Language",
    explicitLanguageId: "test-language",
    membershipMode: "folder",
  });

  assert.equal(folderIdMismatch.accepted, false);
  assert.equal(folderIdMismatch.diagnostic.code, "language.id-mismatch");
  assert.equal(folderIdMismatch.diagnostic.field, "language_id");

  // Optional scope normalization is contextual only. Surrounding whitespace
  // compares as the same identity, while blank configured identity establishes
  // no replacement for an explicit creator ID.
  assert.deepEqual(
    resolveSourceLanguageAuthority({
      configuredLanguage: " Mer ",
      configuredLanguageId: " mer-language ",
      explicitLanguage: "Mer",
      explicitLanguageId: "mer-language",
      membershipMode: "respect-explicit",
    }),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      runtimeLanguageId: "mer-language",
    },
  );

  assert.deepEqual(
    resolveSourceLanguageAuthority({
      configuredLanguage: "Mer",
      configuredLanguageId: "   ",
      explicitLanguage: "Mer",
      explicitLanguageId: "creator-mer-id",
      membershipMode: "respect-explicit",
    }),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      runtimeLanguageId: "creator-mer-id",
    },
  );

  console.log("source-language authority regression tests passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
