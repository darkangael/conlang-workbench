import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-source-state-"));

try {
  const outputFile = join(tempDir, "language-source-state.mjs");

  await build({
    entryPoints: ["language-source-state.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  // Reading the generated file before import gives a clearer failure if esbuild
  // somehow produced no output rather than surfacing a confusing module error.
  await readFile(outputFile, "utf8");

  const { applyLanguageSourceState } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
  );

  function makeLanguage() {
    return {
      name: "Test Language",
      dictionaryFolder: "Languages/Test Language/Lexicon",
      morphemeFolder: "Languages/Test Language/Morphemes",
      exampleFolder: "Languages/Test Language/Examples",
      phonologyFolder: "Languages/Test Language/Phonology",
      sheets: [],
      hoverEnabled: true,
      inflections: [],
    };
  }

  async function testActiveSourceAppliesAfterLoadedReload() {
    const language = makeLanguage();
    const calls = [];

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Test Language"],
      setting: "dictionaryFolder",
      value: "Languages/Test Language/New Lexicon",
      validate: () => ({ status: "valid" }),
      save: async () => {
        calls.push(`save:${language.dictionaryFolder}`);
      },
      reload: async () => {
        calls.push(`reload:${language.dictionaryFolder}`);
        return { status: "loaded", dictionaryCount: 12 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 12,
    });
    assert.equal(
      language.dictionaryFolder,
      "Languages/Test Language/New Lexicon",
    );
    assert.deepEqual(calls, [
      "save:Languages/Test Language/New Lexicon",
      "reload:Languages/Test Language/New Lexicon",
    ]);
  }

  async function testInitialSaveFailureRestoresMemoryAndSkipsReload() {
    const language = makeLanguage();
    const original = language.dictionaryFolder;
    let reloadCalls = 0;

    const saveError = new Error("disk unavailable");

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Test Language"],
      setting: "dictionaryFolder",
      value: "Languages/Test Language/New Lexicon",
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
    assert.equal(language.dictionaryFolder, original);
    assert.equal(reloadCalls, 0);
  }

  async function testBlockedReloadRestoresAndPersistsPreviousSource() {
    const language = makeLanguage();
    const original = language.dictionaryFolder;
    const savedValues = [];

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Test Language"],
      setting: "dictionaryFolder",
      value: "Languages/Test Language/Missing",
      validate: () => ({ status: "valid" }),
      save: async () => {
        savedValues.push(language.dictionaryFolder);
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.deepEqual(result, { status: "blocked" });
    assert.equal(language.dictionaryFolder, original);
    assert.deepEqual(savedValues, [
      "Languages/Test Language/Missing",
      original,
    ]);
  }

  async function testRollbackSaveFailureLeavesPreviousMemoryState() {
    const language = makeLanguage();
    const original = language.morphemeFolder;
    let saveCalls = 0;
    const rollbackError = new Error("rollback save failed");

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Test Language"],
      setting: "morphemeFolder",
      value: "Languages/Test Language/Missing Morphemes",
      validate: () => ({ status: "valid" }),
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) throw rollbackError;
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.equal(result.error, rollbackError);
    assert.equal(language.morphemeFolder, original);
    assert.equal(saveCalls, 2);
  }

  async function testReloadThrowDoesNotPretendRollbackIsSafe() {
    const language = makeLanguage();
    const requested = "Languages/Test Language/New Examples";
    const reloadError = new Error("loader failed after preflight");
    let saveCalls = 0;

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Test Language"],
      setting: "exampleFolder",
      value: requested,
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
    assert.equal(language.exampleFolder, requested);
    assert.equal(
      saveCalls,
      1,
      "reload exceptions must not trigger an unjustified rollback save",
    );
  }

  async function testInactiveLanguagePersistsWithoutReload() {
    const language = makeLanguage();
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Some Other Language"],
      setting: "phonologyFolder",
      value: "Languages/Test Language/New Phonology",
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
    assert.equal(
      language.phonologyFolder,
      "Languages/Test Language/New Phonology",
    );
    assert.equal(saveCalls, 1);
    assert.equal(reloadCalls, 0);
  }

  async function testOptionalSourceCanBeRemoved() {
    const language = makeLanguage();
    let reloadCalls = 0;

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Some Other Language"],
      setting: "morphemeFolder",
      value: undefined,
      validate: () => ({ status: "valid" }),
      save: async () => {},
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(language.morphemeFolder, undefined);
    assert.equal(reloadCalls, 0);
  }

  async function testProactiveRefusalPreventsMutationSaveAndReload() {
    const language = makeLanguage();
    const original = language.dictionaryFolder;
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Test Language"],
      setting: "dictionaryFolder",
      value: "Languages/Other Language/Lexicon",
      validate: () => ({
        status: "invalid",
        reason: "outside-language-root",
        detail:
          'canonical source "Languages/Other Language/Lexicon" is outside ' +
          'language root "Languages/Test Language".',
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
    assert.match(result.error, /outside language root/i);
    assert.equal(language.dictionaryFolder, original);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  async function testBlankDictionaryFolderIsRejectedBeforeMutation() {
    const language = makeLanguage();
    const original = language.dictionaryFolder;
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageSourceState({
      language,
      activeLanguages: ["Test Language"],
      setting: "dictionaryFolder",
      value: "   ",
      validate: () => ({ status: "valid" }),
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "invalid-request");
    assert.equal(language.dictionaryFolder, original);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  await testActiveSourceAppliesAfterLoadedReload();
  await testInitialSaveFailureRestoresMemoryAndSkipsReload();
  await testBlockedReloadRestoresAndPersistsPreviousSource();
  await testRollbackSaveFailureLeavesPreviousMemoryState();
  await testReloadThrowDoesNotPretendRollbackIsSafe();
  await testInactiveLanguagePersistsWithoutReload();
  await testOptionalSourceCanBeRemoved();
  await testProactiveRefusalPreventsMutationSaveAndReload();
  await testBlankDictionaryFolderIsRejectedBeforeMutation();

  console.log("language-source-state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
