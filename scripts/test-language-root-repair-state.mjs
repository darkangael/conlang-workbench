import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-root-repair-state-"));

try {
  const outputFile = join(tempDir, "language-root-repair-state.mjs");

  await build({
    entryPoints: ["language-root-repair-state.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  // Read the generated module before importing it so a failed or missing build
  // produces a direct test failure rather than an obscure dynamic-import error.
  await readFile(outputFile, "utf8");

  const { applyLanguageRootRepairState } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
  );

  const oldRoot = "Languages/Test Language";
  const repairedRoot = "Languages/Repaired Test Language";

  const repairedPaths = {
    root: repairedRoot,
    lexicon: `${repairedRoot}/Lexicon`,
    morphemes: `${repairedRoot}/Morphemes`,
    inflections: `${repairedRoot}/Inflections`,
    cyphers: `${repairedRoot}/Cyphers`,
    examples: `${repairedRoot}/Examples`,
    phonology: `${repairedRoot}/Phonology`,
  };

  function makeLanguage() {
    return {
      name: "Test Language",
      rootFolder: oldRoot,
      dictionaryFolder: `${oldRoot}/Old Lexicon`,
      morphemeFolder: `${oldRoot}/Old Morphemes`,
      exampleFolder: `${oldRoot}/Old Examples`,
      phonologyFolder: `${oldRoot}/Old Phonology`,
      profilePath: `${oldRoot}/Profile.md`,
      sheets: [],
      hoverEnabled: true,
      inflections: [],
    };
  }

  function makePlan() {
    return {
      status: "planned",
      root: repairedRoot,
      paths: repairedPaths,
      foldersToReuse: [repairedPaths.lexicon],
      foldersToCreate: [
        repairedPaths.morphemes,
        repairedPaths.inflections,
        repairedPaths.cyphers,
        repairedPaths.examples,
        repairedPaths.phonology,
      ],
      configuration: {
        rootFolder: repairedRoot,
        dictionaryFolder: repairedPaths.lexicon,
        morphemeFolder: repairedPaths.morphemes,
        exampleFolder: repairedPaths.examples,
        phonologyFolder: repairedPaths.phonology,
      },
    };
  }

  function snapshotSources(language) {
    return {
      rootFolder: language.rootFolder,
      dictionaryFolder: language.dictionaryFolder,
      morphemeFolder: language.morphemeFolder,
      exampleFolder: language.exampleFolder,
      phonologyFolder: language.phonologyFolder,
      profilePath: language.profilePath,
    };
  }

  function expectedRepairedSources(profilePath) {
    return {
      rootFolder: repairedRoot,
      dictionaryFolder: repairedPaths.lexicon,
      morphemeFolder: repairedPaths.morphemes,
      exampleFolder: repairedPaths.examples,
      phonologyFolder: repairedPaths.phonology,
      profilePath,
    };
  }

  /*
   * A blocked fresh plan owns no mutation authority. Folder establishment,
   * settings persistence, and runtime reload must all remain untouched.
   */
  async function testPlannerBlockPreventsAllMutation() {
    const language = makeLanguage();
    const original = snapshotSources(language);
    let folderCalls = 0;
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Test Language"],
      plan: () => ({
        status: "blocked",
        reason: "root-conflict",
        detail: "Another language already owns this root.",
      }),
      createMissingFolders: async () => {
        folderCalls++;
      },
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, {
      status: "blocked",
      reason: "root-conflict",
      detail: "Another language already owns this root.",
    });
    assert.deepEqual(snapshotSources(language), original);
    assert.equal(folderCalls, 0);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  /*
   * Folder creation occurs before configuration mutation. A partial additive
   * folder failure therefore leaves the previous configuration intact and
   * requires neither a settings rollback nor a runtime reload.
   */
  async function testFolderFailureLeavesConfigurationUntouched() {
    const language = makeLanguage();
    const original = snapshotSources(language);
    const folderError = new Error("folder creation failed");
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Test Language"],
      plan: () => makePlan(),
      createMissingFolders: async () => {
        throw folderError;
      },
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "folder-creation-failed");
    assert.equal(result.error, folderError);
    assert.deepEqual(snapshotSources(language), original);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  /*
   * Once folder establishment succeeds, repair changes all five authority
   * fields as one unit. If their first persistence fails, those fields are
   * restored in memory. profilePath is deliberately outside this transaction.
   */
  async function testInitialSaveFailureRestoresAllOwnedConfiguration() {
    const language = makeLanguage();
    const original = snapshotSources(language);
    const saveError = new Error("settings persistence failed");
    let reloadCalls = 0;

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Test Language"],
      plan: () => makePlan(),
      createMissingFolders: async () => {},
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
    assert.equal(result.foldersEstablished, true);
    assert.deepEqual(snapshotSources(language), original);
    assert.equal(reloadCalls, 0);
  }

  /*
   * An inactive language has no current runtime inventories to synchronize.
   * Successful structural repair therefore persists once without reloading.
   */
  async function testInactiveRepairPersistsWithoutReload() {
    const language = makeLanguage();
    const originalProfile = language.profilePath;
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Some Other Language"],
      plan: () => makePlan(),
      createMissingFolders: async () => {},
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      foldersEstablished: true,
    });
    assert.deepEqual(
      snapshotSources(language),
      expectedRepairedSources(originalProfile),
    );
    assert.equal(saveCalls, 1);
    assert.equal(reloadCalls, 0);
  }

  /*
   * Active repair is successful only after the repaired configuration has been
   * persisted and runtime reload establishes corresponding language data.
   */
  async function testActiveRepairAppliesAfterLoadedReload() {
    const language = makeLanguage();
    const originalProfile = language.profilePath;
    const calls = [];

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Test Language"],
      plan: () => makePlan(),
      createMissingFolders: async (plan) => {
        calls.push(`folders:${plan.root}`);
      },
      save: async () => {
        calls.push(`save:${language.rootFolder}`);
      },
      reload: async () => {
        calls.push(`reload:${language.rootFolder}`);
        return { status: "loaded", dictionaryCount: 17 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 17,
      foldersEstablished: true,
    });
    assert.deepEqual(
      snapshotSources(language),
      expectedRepairedSources(originalProfile),
    );
    assert.deepEqual(calls, [
      `folders:${repairedRoot}`,
      `save:${repairedRoot}`,
      `reload:${repairedRoot}`,
    ]);
  }

  /*
   * H3's explicit blocked result means runtime replacement never began.
   * Restoring and re-saving the complete previous repair-owned configuration is
   * therefore safe. Additive folders remain established and are not deleted.
   */
  async function testBlockedReloadRestoresAndPersistsPreviousConfiguration() {
    const language = makeLanguage();
    const original = snapshotSources(language);
    const savedSnapshots = [];

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Test Language"],
      plan: () => makePlan(),
      createMissingFolders: async () => {},
      save: async () => {
        savedSnapshots.push(snapshotSources(language));
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.deepEqual(result, {
      status: "reload-blocked",
      foldersEstablished: true,
    });
    assert.deepEqual(snapshotSources(language), original);
    assert.equal(savedSnapshots.length, 2);
    assert.equal(savedSnapshots[0].rootFolder, repairedRoot);
    assert.deepEqual(savedSnapshots[1], original);
  }

  /*
   * Even if persistence of the rollback fails, memory is restored to the
   * configuration matching the untouched old runtime. The result explicitly
   * reports that persistence and memory may now disagree.
   */
  async function testRollbackSaveFailureKeepsRestoredMemory() {
    const language = makeLanguage();
    const original = snapshotSources(language);
    const rollbackError = new Error("rollback persistence failed");
    let saveCalls = 0;

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Test Language"],
      plan: () => makePlan(),
      createMissingFolders: async () => {},
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) {
          throw rollbackError;
        }
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.equal(result.error, rollbackError);
    assert.equal(result.foldersEstablished, true);
    assert.deepEqual(snapshotSources(language), original);
    assert.equal(saveCalls, 2);
  }

  /*
   * A thrown reload exception is fundamentally different from "blocked".
   * Runtime replacement may already have begun, so restoring old configuration
   * would falsely claim that old runtime authority had also been restored.
   */
  async function testReloadThrowDoesNotPerformUnsafeRollback() {
    const language = makeLanguage();
    const originalProfile = language.profilePath;
    const reloadError = new Error("loader failed after preflight");
    let saveCalls = 0;

    const result = await applyLanguageRootRepairState({
      language,
      activeLanguages: ["Test Language"],
      plan: () => makePlan(),
      createMissingFolders: async () => {},
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        throw reloadError;
      },
    });

    assert.equal(result.status, "reload-failed");
    assert.equal(result.error, reloadError);
    assert.equal(result.foldersEstablished, true);
    assert.deepEqual(
      snapshotSources(language),
      expectedRepairedSources(originalProfile),
    );
    assert.equal(
      saveCalls,
      1,
      "reload exceptions must not trigger an unjustified rollback save",
    );
  }

  await testPlannerBlockPreventsAllMutation();
  await testFolderFailureLeavesConfigurationUntouched();
  await testInitialSaveFailureRestoresAllOwnedConfiguration();
  await testInactiveRepairPersistsWithoutReload();
  await testActiveRepairAppliesAfterLoadedReload();
  await testBlockedReloadRestoresAndPersistsPreviousConfiguration();
  await testRollbackSaveFailureKeepsRestoredMemory();
  await testReloadThrowDoesNotPerformUnsafeRollback();

  console.log("language root repair state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
