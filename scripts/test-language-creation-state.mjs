import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(
  join(tmpdir(), "conlang-language-creation-state-"),
);

try {
  await build({
    entryPoints: ["language-creation-state.ts", "settings-authority-queue.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: tempDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });

  const stateModulePath = join(tempDir, "language-creation-state.mjs");
  await readFile(stateModulePath, "utf8");

  const { applyLanguageCreationState } = await import(
    `${pathToFileURL(stateModulePath).href}?t=${Date.now()}`
  );

  const queueModulePath = join(tempDir, "settings-authority-queue.mjs");
  await readFile(queueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(queueModulePath).href}?t=${Date.now()}`
  );

  function makeLanguage(name) {
    return {
      name,
      dictionaryFolder: `Languages/${name}/Lexicon`,
      hoverEnabled: true,
      sheets: [],
    };
  }

  /*
   * Successful registration preserves the existing generated-name policy,
   * passes settled configured languages to the creator, and persists the exact
   * object returned by that creator.
   */
  {
    const existing = makeLanguage("Existing");
    const created = makeLanguage("Language 2");
    const state = { languages: [existing] };

    let creatorName = null;
    let creatorLanguages = null;
    let saveCalls = 0;

    const result = await applyLanguageCreationState({
      state,
      create: async (name, languages) => {
        creatorName = name;
        creatorLanguages = languages;
        return { status: "created", language: created };
      },
      save: async () => {
        saveCalls += 1;
        assert.equal(state.languages.at(-1), created);
      },
    });

    assert.equal(result.status, "created");
    assert.equal(result.name, "Language 2");
    assert.equal(result.language, created);
    assert.equal(creatorName, "Language 2");
    assert.equal(creatorLanguages, state.languages);
    assert.equal(saveCalls, 1);
    assert.deepEqual(state.languages, [existing, created]);
  }

  /*
   * Creator authority refusal is read-only from the settings transaction's
   * perspective. Nothing is registered and persistence is never attempted.
   */
  {
    const existing = makeLanguage("Existing");
    const state = { languages: [existing] };
    let saveCalls = 0;

    const result = await applyLanguageCreationState({
      state,
      create: async () => ({
        status: "blocked",
        error: "simulated authority refusal",
      }),
      save: async () => {
        saveCalls += 1;
      },
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.name, "Language 2");
    assert.equal(result.error, "simulated authority refusal");
    assert.equal(saveCalls, 0);
    assert.deepEqual(state.languages, [existing]);
  }

  /*
   * A creator operational failure may already have established some additive
   * filesystem structure, but it still must not provisionally register a
   * LanguageConfig or attempt a settings save.
   */
  {
    const existing = makeLanguage("Existing");
    const state = { languages: [existing] };
    let saveCalls = 0;

    const result = await applyLanguageCreationState({
      state,
      create: async () => ({
        status: "failed",
        error: "simulated folder failure",
      }),
      save: async () => {
        saveCalls += 1;
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error, "simulated folder failure");
    assert.equal(saveCalls, 0);
    assert.deepEqual(state.languages, [existing]);
  }

  /*
   * Persistence failure restores only the exact LanguageConfig inserted by the
   * transaction. The creator's filesystem work is deliberately outside this
   * rollback authority and therefore is not represented as deleted.
   */
  {
    const existing = makeLanguage("Existing");
    const created = makeLanguage("Language 2");
    const state = { languages: [existing] };
    const saveError = new Error("simulated settings failure");

    const result = await applyLanguageCreationState({
      state,
      create: async () => ({ status: "created", language: created }),
      save: async () => {
        throw saveError;
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(result.name, "Language 2");
    assert.equal(result.error, saveError);
    assert.equal(result.foldersEstablished, true);
    assert.deepEqual(state.languages, [existing]);
  }

  /*
   * H13 regression: a second creation must not choose a name or inspect
   * configuration while an earlier creation still owns provisional settings.
   *
   * The first transaction provisionally inserts Language 1 and then waits in
   * persistence. The second transaction is queued at the same time. It must not
   * call its creator until the first failed save has rolled Language 1 back.
   * Once authority settles, the second request may safely choose Language 1
   * again and persist it.
   */
  {
    const state = { languages: [] };
    const queue = new SettingsAuthorityQueue();

    let rejectFirstSave;
    const firstSaveGate = new Promise((_, reject) => {
      rejectFirstSave = reject;
    });

    const creatorNames = [];

    const first = queue.run(() =>
      applyLanguageCreationState({
        state,
        create: async (name) => {
          creatorNames.push(`first:${name}`);
          return {
            status: "created",
            language: makeLanguage(name),
          };
        },
        save: async () => {
          await firstSaveGate;
        },
      }),
    );

    /*
     * Allow the first transaction to reach its pending save before enqueueing
     * the second operation.
     */
    await Promise.resolve();
    await Promise.resolve();

    const second = queue.run(() =>
      applyLanguageCreationState({
        state,
        create: async (name) => {
          creatorNames.push(`second:${name}`);
          return {
            status: "created",
            language: makeLanguage(name),
          };
        },
        save: async () => undefined,
      }),
    );

    await Promise.resolve();
    assert.deepEqual(creatorNames, ["first:Language 1"]);

    rejectFirstSave(new Error("simulated first save failure"));

    const firstResult = await first;
    const secondResult = await second;

    assert.equal(firstResult.status, "save-failed");
    assert.equal(secondResult.status, "created");
    assert.equal(secondResult.name, "Language 1");
    assert.deepEqual(creatorNames, ["first:Language 1", "second:Language 1"]);
    assert.deepEqual(
      state.languages.map((language) => language.name),
      ["Language 1"],
    );
  }

  console.log("language creation state regression tests passed.");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
