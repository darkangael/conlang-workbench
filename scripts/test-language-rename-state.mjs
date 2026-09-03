import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-language-rename-state-"));

try {
  await build({
    entryPoints: [
      "language-rename-state.ts",
      "persisted-setting-state.ts",
      "settings-authority-queue.ts",
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: tempDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });

  const outputFile = join(tempDir, "language-rename-state.mjs");

  // Verify the bundle exists before dynamic import so build failures surface as
  // direct regression failures rather than confusing module-loader errors.
  await readFile(outputFile, "utf8");

  const { applyLanguageRenameState } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
  );

  const persistedModulePath = join(tempDir, "persisted-setting-state.mjs");
  await readFile(persistedModulePath, "utf8");

  const { applyPersistedSettingState } = await import(
    `${pathToFileURL(persistedModulePath).href}?t=${Date.now()}`
  );

  /*
   * H13 coordinates H7 rename with unrelated whole-settings transactions
   * through the same plugin-wide queue. Keeping the coordinator independent
   * lets this pure regression verify the intended transaction composition
   * without importing the Obsidian-dependent plugin host.
   */
  const authorityQueueModulePath = join(
    tempDir,
    "settings-authority-queue.mjs",
  );
  await readFile(authorityQueueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(authorityQueueModulePath).href}?t=${Date.now()}`
  );

  const oldName = "Old Language";
  const newName = "New Language";
  const oldRoot = `Languages/${oldName}`;
  const newRoot = `Languages/${newName}`;

  function makeLanguage() {
    return {
      name: oldName,
      rootFolder: oldRoot,
      dictionaryFolder: `${oldRoot}/Custom Lexicon`,
      morphemeFolder: `${oldRoot}/Grammar/Morphemes`,
      exampleFolder: `${oldRoot}/Corpus/Examples`,
      phonologyFolder: `${oldRoot}/Reference/Phonology`,
      profilePath: `${oldRoot}/About/Profile.md`,
      sheets: [],
      hoverEnabled: true,
      inflections: [],
    };
  }

  function makeSettings(active = true, primary = true) {
    return {
      activeLanguages: active
        ? [oldName, "Other Language"]
        : ["Other Language"],
      primaryLanguage: primary ? oldName : "Other Language",
    };
  }

  function makePlan() {
    return {
      status: "planned",
      oldName,
      newName,
      oldRoot,
      newRoot,
      configuration: {
        name: newName,
        rootFolder: newRoot,
        dictionaryFolder: `${newRoot}/Custom Lexicon`,
        morphemeFolder: `${newRoot}/Grammar/Morphemes`,
        exampleFolder: `${newRoot}/Corpus/Examples`,
        phonologyFolder: `${newRoot}/Reference/Phonology`,
        profilePath: `${newRoot}/About/Profile.md`,
      },
    };
  }

  function snapshot(language, settings) {
    return {
      name: language.name,
      rootFolder: language.rootFolder,
      dictionaryFolder: language.dictionaryFolder,
      morphemeFolder: language.morphemeFolder,
      exampleFolder: language.exampleFolder,
      phonologyFolder: language.phonologyFolder,
      profilePath: language.profilePath,
      activeLanguages: [...settings.activeLanguages],
      primaryLanguage: settings.primaryLanguage,
    };
  }

  function expectedRenamed(active = true, primary = true) {
    return {
      name: newName,
      rootFolder: newRoot,
      dictionaryFolder: `${newRoot}/Custom Lexicon`,
      morphemeFolder: `${newRoot}/Grammar/Morphemes`,
      exampleFolder: `${newRoot}/Corpus/Examples`,
      phonologyFolder: `${newRoot}/Reference/Phonology`,
      profilePath: `${newRoot}/About/Profile.md`,
      activeLanguages: active
        ? [newName, "Other Language"]
        : ["Other Language"],
      primaryLanguage: primary ? newName : "Other Language",
    };
  }

  /*
   * A blocked fresh plan has no mutation authority at all.
   */
  async function testPlannerBlockPreventsEverything() {
    const language = makeLanguage();
    const settings = makeSettings();
    const original = snapshot(language, settings);
    let renameCalls = 0;
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => ({
        status: "blocked",
        reason: "destination-occupied",
        detail: "The requested root already exists.",
      }),
      renameRoot: async () => {
        renameCalls++;
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
      reason: "destination-occupied",
      detail: "The requested root already exists.",
    });
    assert.deepEqual(snapshot(language, settings), original);
    assert.equal(renameCalls, 0);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  /*
   * The physical root rename is the first mutation. If it fails, configuration,
   * persistence, and runtime remain completely untouched.
   */
  async function testForwardRenameFailureLeavesEverythingUntouched() {
    const language = makeLanguage();
    const settings = makeSettings();
    const original = snapshot(language, settings);
    const renameError = new Error("filesystem rename failed");
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async () => {
        throw renameError;
      },
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "rename-failed");
    assert.equal(result.error, renameError);
    assert.deepEqual(snapshot(language, settings), original);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  /*
   * If first persistence fails after the folder moved, reverse the exact folder
   * rename before restoring old memory. Runtime reload must never be attempted.
   */
  async function testSaveFailureReversesRootAndRestoresMemory() {
    const language = makeLanguage();
    const settings = makeSettings();
    const original = snapshot(language, settings);
    const saveError = new Error("settings save failed");
    const renameCalls = [];
    let reloadCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async (from, to) => {
        renameCalls.push(`${from} -> ${to}`);
      },
      save: async () => {
        throw saveError;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, {
      status: "save-failed",
      error: saveError,
      rootRestored: true,
    });
    assert.deepEqual(renameCalls, [
      `${oldRoot} -> ${newRoot}`,
      `${newRoot} -> ${oldRoot}`,
    ]);
    assert.deepEqual(snapshot(language, settings), original);
    assert.equal(reloadCalls, 0);
  }

  /*
   * A compensating filesystem failure means the root still lives at newRoot.
   * The transaction must not lie by restoring old in-memory paths in that case.
   */
  async function testSaveFailureWithReverseRenameFailureKeepsNewMemory() {
    const language = makeLanguage();
    const settings = makeSettings();
    const saveError = new Error("settings save failed");
    const rollbackError = new Error("reverse rename failed");
    let renameCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async () => {
        renameCalls++;
        if (renameCalls === 2) throw rollbackError;
      },
      save: async () => {
        throw saveError;
      },
      reload: async () => ({ status: "loaded", dictionaryCount: 0 }),
    });

    assert.equal(result.status, "save-failed-rollback-rename-failed");
    assert.equal(result.error, saveError);
    assert.equal(result.rollbackError, rollbackError);
    assert.equal(result.rootRenamed, true);
    assert.deepEqual(snapshot(language, settings), expectedRenamed());
  }

  /*
   * Inactive languages have no corresponding loaded runtime inventory. A valid
   * root/identity rename therefore stops after one successful settings save.
   */
  async function testInactiveRenamePersistsWithoutReload() {
    const language = makeLanguage();
    const settings = makeSettings(false, false);
    const calls = [];

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async (from, to) => {
        calls.push(`rename:${from}->${to}`);
      },
      save: async () => {
        calls.push(`save:${language.name}:${language.rootFolder}`);
      },
      reload: async () => {
        calls.push("reload");
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      rootRenamed: true,
    });
    assert.deepEqual(
      snapshot(language, settings),
      expectedRenamed(false, false),
    );
    assert.deepEqual(calls, [
      `rename:${oldRoot}->${newRoot}`,
      `save:${newName}:${newRoot}`,
    ]);
  }

  /*
   * Active rename succeeds only when the moved root, persisted identity, and
   * runtime reload all establish the same new authority.
   */
  async function testActiveRenameReloadsSuccessfully() {
    const language = makeLanguage();
    const settings = makeSettings();
    const calls = [];

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async (from, to) => {
        calls.push(`rename:${from}->${to}`);
      },
      save: async () => {
        calls.push(`save:${language.name}:${settings.primaryLanguage}`);
      },
      reload: async () => {
        calls.push(`reload:${language.name}:${language.rootFolder}`);
        return { status: "loaded", dictionaryCount: 23 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 23,
      rootRenamed: true,
    });
    assert.deepEqual(snapshot(language, settings), expectedRenamed());
    assert.deepEqual(calls, [
      `rename:${oldRoot}->${newRoot}`,
      `save:${newName}:${newName}`,
      `reload:${newName}:${newRoot}`,
    ]);
  }

  /*
   * H3 "blocked" means the old runtime was never replaced. Reverse the root,
   * restore all old name/path references, and persist that rollback.
   */
  async function testBlockedReloadReversesRootAndRestoresOldState() {
    const language = makeLanguage();
    const settings = makeSettings();
    const original = snapshot(language, settings);
    const renameCalls = [];
    const savedSnapshots = [];

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async (from, to) => {
        renameCalls.push(`${from} -> ${to}`);
      },
      save: async () => {
        savedSnapshots.push(snapshot(language, settings));
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.deepEqual(result, {
      status: "reload-blocked",
      rootRestored: true,
    });
    assert.deepEqual(renameCalls, [
      `${oldRoot} -> ${newRoot}`,
      `${newRoot} -> ${oldRoot}`,
    ]);
    assert.equal(savedSnapshots.length, 2);
    assert.deepEqual(savedSnapshots[0], expectedRenamed());
    assert.deepEqual(savedSnapshots[1], original);
    assert.deepEqual(snapshot(language, settings), original);
  }

  /*
   * If blocked-reload structural rollback itself fails, leave new configuration
   * aligned with the still-renamed root and report the unresolved runtime split.
   */
  async function testBlockedReloadReverseRenameFailureKeepsNewState() {
    const language = makeLanguage();
    const settings = makeSettings();
    const rollbackError = new Error("reverse rename failed");
    let renameCalls = 0;
    let saveCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async () => {
        renameCalls++;
        if (renameCalls === 2) throw rollbackError;
      },
      save: async () => {
        saveCalls++;
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "reload-blocked-rollback-rename-failed");
    assert.equal(result.rollbackError, rollbackError);
    assert.equal(result.rootRenamed, true);
    assert.deepEqual(snapshot(language, settings), expectedRenamed());
    assert.equal(
      saveCalls,
      1,
      "failed structural rollback must not persist an old configuration",
    );
  }

  /*
   * If the physical rollback succeeds but persistence of old settings fails,
   * memory and vault structure both reflect the old state while persisted
   * settings are explicitly reported as uncertain.
   */
  async function testBlockedReloadRollbackSaveFailureKeepsOldMemory() {
    const language = makeLanguage();
    const settings = makeSettings();
    const original = snapshot(language, settings);
    const rollbackSaveError = new Error("rollback settings save failed");
    let saveCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async () => {},
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) throw rollbackSaveError;
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.equal(result.error, rollbackSaveError);
    assert.equal(result.rootRestored, true);
    assert.deepEqual(snapshot(language, settings), original);
    assert.equal(saveCalls, 2);
  }

  /*
   * A thrown detached candidate reload leaves old runtime untouched. Reverse
   * the physical root first, then restore and persist the old configuration.
   */
  async function testReloadThrowReversesRootAndRestoresOldState() {
    const language = makeLanguage();
    const settings = makeSettings();
    const original = snapshot(language, settings);
    const reloadError = new Error("loader failed after preflight");
    const renameCalls = [];
    let saveCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async (from, to) => {
        renameCalls.push(`${from} -> ${to}`);
      },
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        throw reloadError;
      },
    });

    assert.deepEqual(result, {
      status: "reload-failed",
      error: reloadError,
      rootRestored: true,
    });
    assert.deepEqual(renameCalls, [
      `${oldRoot} -> ${newRoot}`,
      `${newRoot} -> ${oldRoot}`,
    ]);
    assert.deepEqual(snapshot(language, settings), original);
    assert.equal(saveCalls, 2);
  }

  /*
   * If structural rollback after a thrown reload fails, the root still lives at
   * the new location. Keep new in-memory paths aligned with that physical truth.
   */
  async function testReloadThrowReverseRenameFailureKeepsNewState() {
    const language = makeLanguage();
    const settings = makeSettings();
    const reloadError = new Error("loader failed after preflight");
    const rollbackError = new Error("reverse rename failed");
    let renameCalls = 0;
    let saveCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async () => {
        renameCalls++;
        if (renameCalls === 2) throw rollbackError;
      },
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        throw reloadError;
      },
    });

    assert.equal(result.status, "reload-failed-rollback-rename-failed");
    assert.equal(result.error, reloadError);
    assert.equal(result.rollbackError, rollbackError);
    assert.equal(result.rootRenamed, true);
    assert.deepEqual(snapshot(language, settings), expectedRenamed());
    assert.equal(renameCalls, 2);
    assert.equal(
      saveCalls,
      1,
      "failed structural rollback must not persist an old configuration",
    );
  }

  /*
   * If the reverse root move succeeds but persistence of the restored settings
   * fails, vault structure, memory, and old runtime remain aligned while durable
   * settings are explicitly uncertain.
   */
  async function testReloadThrowRollbackSaveFailureKeepsOldMemory() {
    const language = makeLanguage();
    const settings = makeSettings();
    const original = snapshot(language, settings);
    const rollbackSaveError = new Error("rollback settings save failed");
    let saveCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async () => {},
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) throw rollbackSaveError;
      },
      reload: async () => {
        throw new Error("loader failed after preflight");
      },
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.equal(result.error, rollbackSaveError);
    assert.equal(result.rootRestored, true);
    assert.deepEqual(snapshot(language, settings), original);
    assert.equal(saveCalls, 2);
  }

  /*
   * H13: the plugin-wide authority queue must cover the complete H7 rename
   * transaction, beginning before the physical root move.
   *
   * Rename derives its rollback snapshot before filesystem mutation. An
   * unrelated settings transaction must therefore remain excluded while that
   * structural move is still in flight; otherwise shared authority can change
   * between H7's authorization/snapshot and its later settings persistence.
   *
   * This pure regression exercises the production composition:
   *
   *   SettingsAuthorityQueue -> applyLanguageRenameState()
   *
   * It intentionally does not claim to import or test main.ts itself.
   */
  async function testCommonAuthorityQueueExcludesOrdinarySettingDuringRename() {
    const language = makeLanguage();
    const settings = makeSettings(false, false);
    const original = snapshot(language, settings);
    const authorityQueue = new SettingsAuthorityQueue();

    let releaseRename;
    const renameHeld = new Promise((resolve) => {
      releaseRename = resolve;
    });

    let renameStarted;
    const renameEntered = new Promise((resolve) => {
      renameStarted = resolve;
    });

    let renameCalls = 0;
    let renameSaveCalls = 0;

    const renamePromise = authorityQueue.run(() =>
      applyLanguageRenameState({
        language,
        settings,
        plan: () => makePlan(),
        renameRoot: async () => {
          renameCalls++;
          renameStarted();
          await renameHeld;
        },
        save: async () => {
          renameSaveCalls++;
        },
        reload: async () => {
          throw new Error("inactive rename must not reload");
        },
      }),
    );

    await renameEntered;

    const ordinaryState = { enabled: false };
    let ordinaryWriteCalls = 0;
    let ordinarySaveCalls = 0;

    const ordinaryPromise = authorityQueue.run(() =>
      applyPersistedSettingState({
        read: () => ordinaryState.enabled,
        write: (value) => {
          ordinaryWriteCalls++;
          ordinaryState.enabled = value;
        },
        requested: true,
        save: async () => {
          ordinarySaveCalls++;
        },
      }),
    );

    /*
     * Correct common coordination keeps the unrelated transaction dormant
     * while the structural rename is still unresolved.
     */
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(
      snapshot(language, settings),
      original,
      "settings must remain at the old identity while the root move is held",
    );
    assert.equal(renameCalls, 1);
    assert.equal(
      ordinaryWriteCalls,
      0,
      "ordinary settings must not write while H7 owns rename authority",
    );
    assert.equal(
      ordinarySaveCalls,
      0,
      "ordinary settings must not save while H7 owns rename authority",
    );

    releaseRename();

    const renameResult = await renamePromise;
    const ordinaryResult = await ordinaryPromise;

    assert.deepEqual(renameResult, {
      status: "applied",
      rootRenamed: true,
    });
    assert.equal(renameSaveCalls, 1);
    assert.deepEqual(
      snapshot(language, settings),
      expectedRenamed(false, false),
    );

    assert.deepEqual(ordinaryResult, { status: "applied" });
    assert.equal(ordinaryState.enabled, true);
    assert.equal(ordinaryWriteCalls, 1);
    assert.equal(ordinarySaveCalls, 1);
  }

  await testCommonAuthorityQueueExcludesOrdinarySettingDuringRename();
  await testPlannerBlockPreventsEverything();
  await testForwardRenameFailureLeavesEverythingUntouched();
  await testSaveFailureReversesRootAndRestoresMemory();
  await testSaveFailureWithReverseRenameFailureKeepsNewMemory();
  await testInactiveRenamePersistsWithoutReload();
  await testActiveRenameReloadsSuccessfully();
  await testBlockedReloadReversesRootAndRestoresOldState();
  await testBlockedReloadReverseRenameFailureKeepsNewState();
  await testBlockedReloadRollbackSaveFailureKeepsOldMemory();
  await testReloadThrowReversesRootAndRestoresOldState();
  await testReloadThrowReverseRenameFailureKeepsNewState();
  await testReloadThrowRollbackSaveFailureKeepsOldMemory();

  console.log("language rename state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
