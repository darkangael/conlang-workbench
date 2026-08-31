import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-profile-state-"));

try {
  const outputFile = join(tempDir, "language-profile-state.mjs");

  await build({
    entryPoints: ["language-profile-state.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  // Verify that esbuild actually emitted the independently testable transaction
  // before importing it. This produces a clearer failure than a missing-module
  // error if the build step ever changes unexpectedly.
  await readFile(outputFile, "utf8");

  const { applyLanguageProfileState } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
  );

  function makeLanguage() {
    return {
      name: "Test Language",
      dictionaryFolder: "Languages/Test Language/Lexicon",
      profilePath: "Reference/Profile A.md",
      sheets: [],
      hoverEnabled: true,
      inflections: [],
    };
  }

  async function testActiveProfileAppliesOnlyAfterReload() {
    const language = makeLanguage();
    const calls = [];

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Test Language"],
      profilePath: "Reference/Profile B.md",
      validate: () => ({ status: "valid" }),
      save: async () => {
        calls.push(`save:${language.profilePath}`);
      },
      reload: async () => {
        calls.push(`reload:${language.profilePath}`);
        return { status: "loaded", dictionaryCount: 7 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 7,
    });
    assert.equal(language.profilePath, "Reference/Profile B.md");
    assert.deepEqual(calls, [
      "save:Reference/Profile B.md",
      "reload:Reference/Profile B.md",
    ]);
  }

  async function testInvalidRequestDoesNotMutateSaveOrReload() {
    const language = makeLanguage();
    const original = language.profilePath;
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Test Language"],
      profilePath: "../Outside.md",
      validate: () => ({
        status: "invalid",
        error: 'Vault path must not contain "." or ".." components.',
      }),
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "invalid-request");
    assert.equal(language.profilePath, original);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  async function testInitialSaveFailureRestoresPreviousPath() {
    const language = makeLanguage();
    const original = language.profilePath;
    const saveError = new Error("disk unavailable");
    let reloadCalls = 0;

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Test Language"],
      profilePath: "Reference/Profile B.md",
      validate: () => ({ status: "valid" }),
      save: async () => {
        throw saveError;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(result.error, saveError);
    assert.equal(language.profilePath, original);
    assert.equal(reloadCalls, 0);
  }

  async function testBlockedReloadRestoresAndPersistsPreviousPath() {
    const language = makeLanguage();
    const original = language.profilePath;
    const savedValues = [];

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Test Language"],
      profilePath: "Reference/Profile B.md",
      validate: () => ({ status: "valid" }),
      save: async () => {
        savedValues.push(language.profilePath);
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.deepEqual(result, { status: "blocked" });
    assert.equal(language.profilePath, original);
    assert.deepEqual(savedValues, ["Reference/Profile B.md", original]);
  }

  async function testRollbackSaveFailureKeepsPreviousMemoryPath() {
    const language = makeLanguage();
    const original = language.profilePath;
    const rollbackError = new Error("rollback save failed");
    let saveCalls = 0;

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Test Language"],
      profilePath: "Reference/Profile B.md",
      validate: () => ({ status: "valid" }),
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) throw rollbackError;
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.equal(result.error, rollbackError);
    assert.equal(language.profilePath, original);
    assert.equal(saveCalls, 2);
  }

  async function testReloadThrowDoesNotPretendRollbackIsSafe() {
    const language = makeLanguage();
    const requested = "Reference/Profile B.md";
    const reloadError = new Error("loader failed after preflight");
    let saveCalls = 0;

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Test Language"],
      profilePath: requested,
      validate: () => ({ status: "valid" }),
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        throw reloadError;
      },
    });

    assert.equal(result.status, "reload-failed");
    assert.equal(result.error, reloadError);
    assert.equal(language.profilePath, requested);
    assert.equal(saveCalls, 1);
  }

  async function testInactiveLanguagePersistsWithoutReload() {
    const language = makeLanguage();
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Some Other Language"],
      profilePath: "Reference/Profile B.md",
      validate: () => ({ status: "valid" }),
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(language.profilePath, "Reference/Profile B.md");
    assert.equal(saveCalls, 1);
    assert.equal(reloadCalls, 0);
  }

  async function testProfileCanBeRemoved() {
    const language = makeLanguage();
    let reloadCalls = 0;

    const result = await applyLanguageProfileState({
      language,
      activeLanguages: ["Test Language"],
      profilePath: undefined,
      validate: () => ({ status: "valid" }),
      save: async () => {},
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 3 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 3,
    });
    assert.equal(language.profilePath, undefined);
    assert.equal(reloadCalls, 1);
  }

  await testActiveProfileAppliesOnlyAfterReload();
  await testInvalidRequestDoesNotMutateSaveOrReload();
  await testInitialSaveFailureRestoresPreviousPath();
  await testBlockedReloadRestoresAndPersistsPreviousPath();
  await testRollbackSaveFailureKeepsPreviousMemoryPath();
  await testReloadThrowDoesNotPretendRollbackIsSafe();
  await testInactiveLanguagePersistsWithoutReload();
  await testProfileCanBeRemoved();

  console.log("language-profile-state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
