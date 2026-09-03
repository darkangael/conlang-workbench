import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-source-state-"));

try {
  await build({
    entryPoints: ["language-source-state.ts", "settings-authority-queue.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: tempDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });

  const sourceModulePath = join(tempDir, "language-source-state.mjs");

  // Reading the generated file before import gives a clearer failure if esbuild
  // somehow produced no output rather than surfacing a confusing module error.
  await readFile(sourceModulePath, "utf8");

  const { applyLanguageSourceState } = await import(
    `${pathToFileURL(sourceModulePath).href}?t=${Date.now()}`
  );

  const queueModulePath = join(tempDir, "settings-authority-queue.mjs");
  await readFile(queueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(queueModulePath).href}?t=${Date.now()}`
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

  async function testReloadThrowRestoresPreviousSource() {
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
    assert.equal(
      language.exampleFolder,
      makeLanguage().exampleFolder,
      "thrown candidate preparation must restore the source matching old runtime",
    );
    assert.equal(
      saveCalls,
      2,
      "thrown candidate preparation must persist both the request and rollback",
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

  async function testOverlappingFailedSourceChangesDoNotRetainProvisionalAuthority() {
    /*
     * H13 regression: the plugin-wide authority queue must serialize complete
     * source transactions before they read rollback authority.
     *
     * The first request installs one provisional source while its save is
     * pending. The second request is submitted immediately, but the common
     * coordinator must prevent it from starting until the first transaction
     * has completely restored settled authority.
     *
     * Both persistence attempts fail deliberately. Neither requested source
     * therefore has authority, so the language must finish with the original
     * source that existed before either transaction began.
     */
    const language = makeLanguage();
    const original = language.dictionaryFolder;
    const queue = new SettingsAuthorityQueue();

    let rejectFirstSave;
    let rejectSecondSave;
    let reloadCalls = 0;

    const firstSave = new Promise((_, reject) => {
      rejectFirstSave = reject;
    });

    const secondSave = new Promise((_, reject) => {
      rejectSecondSave = reject;
    });

    const first = queue.run(() =>
      applyLanguageSourceState({
        language,
        activeLanguages: ["Some Other Language"],
        setting: "dictionaryFolder",
        value: "Languages/Test Language/First Lexicon",
        validate: () => ({ status: "valid" }),
        save: () => firstSave,
        reload: async () => {
          reloadCalls++;
          return { status: "loaded", dictionaryCount: 0 };
        },
      }),
    );

    /*
     * Queue callbacks begin on a Promise microtask. Yield once so the first
     * transaction reaches its held persistence boundary.
     */
    await Promise.resolve();

    assert.equal(
      language.dictionaryFolder,
      "Languages/Test Language/First Lexicon",
      "the first queued request should install its provisional source before awaiting persistence",
    );

    const second = queue.run(() =>
      applyLanguageSourceState({
        language,
        activeLanguages: ["Some Other Language"],
        setting: "dictionaryFolder",
        value: "Languages/Test Language/Second Lexicon",
        validate: () => ({ status: "valid" }),
        save: () => secondSave,
        reload: async () => {
          reloadCalls++;
          return { status: "loaded", dictionaryCount: 0 };
        },
      }),
    );

    await Promise.resolve();

    assert.equal(
      language.dictionaryFolder,
      "Languages/Test Language/First Lexicon",
      "the second queued request must not install its source while the first transaction is pending",
    );

    rejectFirstSave(new Error("first source save failed"));
    const firstResult = await first;
    assert.equal(firstResult.status, "save-failed");
    assert.equal(language.dictionaryFolder, original);

    /*
     * The second queued transaction can begin only after the first rollback has
     * restored the original source.
     */
    await Promise.resolve();

    assert.equal(
      language.dictionaryFolder,
      "Languages/Test Language/Second Lexicon",
      "the second source should become provisional only after the first rollback settles",
    );

    rejectSecondSave(new Error("second source save failed"));
    const secondResult = await second;
    assert.equal(secondResult.status, "save-failed");

    assert.equal(
      language.dictionaryFolder,
      original,
      "two failed overlapping source changes must not retain either rejected provisional source",
    );
    assert.equal(
      reloadCalls,
      0,
      "inactive-language reproduction should isolate persistence rollback without runtime reload",
    );
  }

  await testActiveSourceAppliesAfterLoadedReload();
  await testInitialSaveFailureRestoresMemoryAndSkipsReload();
  await testBlockedReloadRestoresAndPersistsPreviousSource();
  await testRollbackSaveFailureLeavesPreviousMemoryState();
  await testReloadThrowRestoresPreviousSource();
  await testInactiveLanguagePersistsWithoutReload();
  await testOptionalSourceCanBeRemoved();
  await testProactiveRefusalPreventsMutationSaveAndReload();
  await testBlankDictionaryFolderIsRejectedBeforeMutation();
  await testOverlappingFailedSourceChangesDoNotRetainProvisionalAuthority();

  console.log("language-source-state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
