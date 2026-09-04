import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(path.join(tmpdir(), "conlang-language-membership-"));

try {
  await build({
    entryPoints: ["language-membership.ts", "language-identity.ts"],
    bundle: true,
    platform: "node",
    format: "esm",

    // The repository itself does not declare all .js files as ES modules.
    // Emit temporary bundles as .mjs so Node interprets the test output using
    // the ESM semantics requested above instead of trying CommonJS parsing.
    outExtension: { ".js": ".mjs" },

    outdir: temp,
    logLevel: "silent",
  });

  const membership = await import(
    pathToFileURL(path.join(temp, "language-membership.mjs")).href
  );

  const identity = await import(
    pathToFileURL(path.join(temp, "language-identity.mjs")).href
  );

  assert.deepEqual(
    membership.resolveLanguageMembership("Daughter", "Parent", "folder"),
    {
      accepted: true,
      runtimeLanguage: "Daughter",
      explicitMismatch: true,
    },
  );

  assert.deepEqual(
    membership.resolveLanguageMembership(
      "Daughter",
      "Parent",
      "respect-explicit",
    ),
    {
      accepted: false,
      runtimeLanguage: "Parent",
      explicitMismatch: true,
    },
  );

  assert.deepEqual(
    membership.resolveLanguageMembership("Mer", undefined, "folder"),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      explicitMismatch: false,
    },
  );

  assert.deepEqual(
    membership.resolveLanguageMembership("Mer", undefined, "respect-explicit"),
    {
      accepted: true,
      runtimeLanguage: "Mer",
      explicitMismatch: false,
    },
  );

  const mer = {
    name: "Mer",
    dictionaryFolder: "Languages/Mer/Lexicon",
    sheets: [],
    hoverEnabled: true,
  };

  const testLanguage = {
    name: "Test Language",
    dictionaryFolder: "Languages/Test Language/Lexicon",
    sheets: [],
    hoverEnabled: true,
  };

  const identifiedMer = {
    ...mer,
    workbenchID: "wb:language:Mer:Languages%2FMer",
  };

  const identifiedTestLanguage = {
    ...testLanguage,
    workbenchID:
      "wb:language:Test%20Language:Languages%2FTest%20Language",
  };

  assert.deepEqual(
    identity.validateLanguageRename(
      [mer, testLanguage],
      testLanguage,
      "  Daughter  ",
    ),
    { ok: true, name: "Daughter" },
  );

  assert.deepEqual(
    identity.validateLanguageRename([mer, testLanguage], testLanguage, "Mer"),
    { ok: false, reason: "duplicate" },
  );

  assert.deepEqual(
    identity.validateLanguageRename([mer, testLanguage], testLanguage, "   "),
    { ok: false, reason: "blank" },
  );

  assert.deepEqual(
    identity.validateLanguageRename(
      [mer, testLanguage],
      testLanguage,
      "Test Language",
    ),
    { ok: false, reason: "unchanged" },
  );

  /*
   * After migration, every configured language must have one nonblank local
   * Workbench ID and no two configured languages may claim the same ID.
   */
  assert.deepEqual(
    identity.validateConfiguredLanguageWorkbenchIdentities([
      identifiedMer,
      identifiedTestLanguage,
    ]),
    { ok: true },
  );

  assert.deepEqual(
    identity.validateConfiguredLanguageWorkbenchIdentities([
      identifiedMer,
      testLanguage,
    ]),
    {
      ok: false,
      reason: "missing",
      languageIndex: 1,
      languageName: "Test Language",
    },
  );

  assert.deepEqual(
    identity.validateConfiguredLanguageWorkbenchIdentities([
      identifiedMer,
      {
        ...identifiedTestLanguage,
        workbenchID: identifiedMer.workbenchID,
      },
    ]),
    {
      ok: false,
      reason: "duplicate",
      workbenchID: identifiedMer.workbenchID,
      firstLanguageIndex: 0,
      firstLanguageName: "Mer",
      duplicateLanguageIndex: 1,
      duplicateLanguageName: "Test Language",
    },
  );

  assert.equal(
    identity.findConfiguredLanguageWorkbenchIDConflict(
      identifiedMer.workbenchID,
      [identifiedMer, identifiedTestLanguage],
    ),
    identifiedMer,
  );

  assert.equal(
    identity.findConfiguredLanguageWorkbenchIDConflict(
      "wb:language:Unused:Languages%2FUnused",
      [identifiedMer, identifiedTestLanguage],
    ),
    null,
  );

  console.log("language membership / identity regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
