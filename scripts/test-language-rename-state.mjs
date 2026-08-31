import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-language-rename-state-"));

try {
  const outputFile = join(tempDir, "language-rename-state.mjs");

  await build({
    entryPoints: ["language-rename-state.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  // Verify the bundle exists before dynamic import so build failures surface as
  // direct regression failures rather than confusing module-loader errors.
  await readFile(outputFile, "utf8");

  const { applyLanguageRenameState } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
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
   * A reload exception may happen after runtime replacement starts. Neither
   * filesystem nor settings rollback is justified at that point.
   */
  async function testReloadThrowKeepsRenamedState() {
    const language = makeLanguage();
    const settings = makeSettings();
    const reloadError = new Error("loader failed after preflight");
    let renameCalls = 0;
    let saveCalls = 0;

    const result = await applyLanguageRenameState({
      language,
      settings,
      plan: () => makePlan(),
      renameRoot: async () => {
        renameCalls++;
      },
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        throw reloadError;
      },
    });

    assert.equal(result.status, "reload-failed");
    assert.equal(result.error, reloadError);
    assert.equal(result.rootRenamed, true);
    assert.deepEqual(snapshot(language, settings), expectedRenamed());
    assert.equal(renameCalls, 1);
    assert.equal(
      saveCalls,
      1,
      "post-preflight reload exceptions must not trigger rollback persistence",
    );
  }

  await testPlannerBlockPreventsEverything();
  await testForwardRenameFailureLeavesEverythingUntouched();
  await testSaveFailureReversesRootAndRestoresMemory();
  await testSaveFailureWithReverseRenameFailureKeepsNewMemory();
  await testInactiveRenamePersistsWithoutReload();
  await testActiveRenameReloadsSuccessfully();
  await testBlockedReloadReversesRootAndRestoresOldState();
  await testBlockedReloadReverseRenameFailureKeepsNewState();
  await testBlockedReloadRollbackSaveFailureKeepsOldMemory();
  await testReloadThrowKeepsRenamedState();

  console.log("language rename state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
