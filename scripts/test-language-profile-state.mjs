import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-profile-state-"));

try {
  await build({
    entryPoints: ["language-profile-state.ts", "settings-authority-queue.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: tempDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });

  const profileModulePath = join(tempDir, "language-profile-state.mjs");

  // Verify that esbuild actually emitted the independently testable transaction
  // before importing it. This produces a clearer failure than a missing-module
  // error if the build step ever changes unexpectedly.
  await readFile(profileModulePath, "utf8");

  const { applyLanguageProfileState } = await import(
    `${pathToFileURL(profileModulePath).href}?t=${Date.now()}`
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

  async function testReloadThrowRestoresPreviousPath() {
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
    assert.equal(
      language.profilePath,
      makeLanguage().profilePath,
      "thrown candidate preparation must restore the path matching old runtime",
    );
    assert.equal(saveCalls, 2);
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

  async function testOverlappingFailedProfileChangesDoNotRetainProvisionalAuthority() {
    /*
     * H13 regression: the plugin-wide authority queue must serialize complete
     * profile transactions before they read rollback authority.
     *
     * The first request installs one provisional profile path while its save is
     * pending. The second request is submitted immediately, but the common
     * coordinator must prevent it from starting until the first transaction
     * has completely restored settled authority.
     *
     * Both persistence attempts fail deliberately. Neither requested profile
     * path therefore has authority, so the language must finish with the
     * original path that existed before either transaction began.
     */
    const language = makeLanguage();
    const original = language.profilePath;
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
      applyLanguageProfileState({
        language,
        activeLanguages: ["Some Other Language"],
        profilePath: "Reference/Profile B.md",
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
      language.profilePath,
      "Reference/Profile B.md",
      "the first queued request should install its provisional profile before awaiting persistence",
    );

    const second = queue.run(() =>
      applyLanguageProfileState({
        language,
        activeLanguages: ["Some Other Language"],
        profilePath: "Reference/Profile C.md",
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
      language.profilePath,
      "Reference/Profile B.md",
      "the second queued request must not install its profile while the first transaction is pending",
    );

    rejectFirstSave(new Error("first profile save failed"));
    const firstResult = await first;
    assert.equal(firstResult.status, "save-failed");
    assert.equal(language.profilePath, original);

    /*
     * The second queued transaction can begin only after the first rollback has
     * restored the original profile path.
     */
    await Promise.resolve();

    assert.equal(
      language.profilePath,
      "Reference/Profile C.md",
      "the second profile should become provisional only after the first rollback settles",
    );

    rejectSecondSave(new Error("second profile save failed"));
    const secondResult = await second;
    assert.equal(secondResult.status, "save-failed");

    assert.equal(
      language.profilePath,
      original,
      "two failed overlapping profile changes must not retain either rejected provisional profile",
    );
    assert.equal(
      reloadCalls,
      0,
      "inactive-language reproduction should isolate persistence rollback without runtime reload",
    );
  }

  await testActiveProfileAppliesOnlyAfterReload();
  await testInvalidRequestDoesNotMutateSaveOrReload();
  await testInitialSaveFailureRestoresPreviousPath();
  await testBlockedReloadRestoresAndPersistsPreviousPath();
  await testRollbackSaveFailureKeepsPreviousMemoryPath();
  await testReloadThrowRestoresPreviousPath();
  await testInactiveLanguagePersistsWithoutReload();
  await testProfileCanBeRemoved();
  await testOverlappingFailedProfileChangesDoNotRetainProvisionalAuthority();

  console.log("language-profile-state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
