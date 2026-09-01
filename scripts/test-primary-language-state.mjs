import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-primary-language-state-"));

try {
  await build({
    entryPoints: ["primary-language-state.ts", "settings-authority-queue.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "primary-language-state.mjs");
  await readFile(modulePath, "utf8");

  const { applyPrimaryLanguageState } = await import(
    `${pathToFileURL(modulePath).href}?v=${Date.now()}`
  );

  const queueModulePath = join(temp, "settings-authority-queue.mjs");
  await readFile(queueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(queueModulePath).href}?v=${Date.now()}`
  );

  const makeState = () => ({
    languages: [{ name: "Language A" }, { name: "Language B" }],
    activeLanguages: ["Language A", "Language B"],
    primaryLanguage: "Language A",
  });

  {
    const state = makeState();
    const persisted = [];

    const result = await applyPrimaryLanguageState({
      state,
      primaryLanguage: "Language B",
      save: async () => {
        persisted.push(state.primaryLanguage);
      },
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.primaryLanguage, "Language B");
    assert.deepEqual(persisted, ["Language B"]);
  }

  {
    const state = makeState();

    const result = await applyPrimaryLanguageState({
      state,
      primaryLanguage: "Language B",
      save: async () => {
        throw new Error("save failed");
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(
      state.primaryLanguage,
      "Language A",
      "failed persistence must restore the previous in-memory primary",
    );
  }

  {
    /*
     * Reproduce the H13 request ordering through the common authority queue.
     *
     * The first request changes settled A -> provisional B and holds its save
     * open. The second request asks for A while that provisional B is live.
     *
     * The critical property is that the second transaction callback must not
     * begin yet. After the first save fails, H8 restores settled A. Only then
     * may the second transaction inspect state. It should therefore see A as
     * the settled previous value and return "unchanged" without attempting a
     * save.
     *
     * Without the common coordinator, the second request previously captured
     * provisional B as rollback authority and could leave B authoritative even
     * though its originating save had failed.
     */
    const state = makeState();
    const queue = new SettingsAuthorityQueue();

    let rejectFirstSave;
    const firstSave = new Promise((_, reject) => {
      rejectFirstSave = reject;
    });

    let secondSaveCalls = 0;

    const firstResultPromise = queue.run(() =>
      applyPrimaryLanguageState({
        state,
        primaryLanguage: "Language B",
        save: async () => {
          await firstSave;
        },
      }),
    );

    /*
     * queue.run() deliberately starts callbacks on a Promise continuation.
     * Yield once so the first transaction can enter and install provisional B.
     */
    await Promise.resolve();

    assert.equal(
      state.primaryLanguage,
      "Language B",
      "the first queued request should install its provisional primary",
    );

    const secondResultPromise = queue.run(() =>
      applyPrimaryLanguageState({
        state,
        primaryLanguage: "Language A",
        save: async () => {
          secondSaveCalls += 1;
        },
      }),
    );

    await Promise.resolve();

    assert.equal(
      state.primaryLanguage,
      "Language B",
      "the second request must not begin while the first owns the authority boundary",
    );
    assert.equal(
      secondSaveCalls,
      0,
      "the second request must not attempt persistence while the first is pending",
    );

    rejectFirstSave(new Error("first save failed"));
    const firstResult = await firstResultPromise;

    assert.equal(firstResult.status, "save-failed");
    assert.equal(
      state.primaryLanguage,
      "Language A",
      "the failed first request must restore the original settled primary",
    );

    const secondResult = await secondResultPromise;

    assert.deepEqual(secondResult, { status: "unchanged" });
    assert.equal(
      secondSaveCalls,
      0,
      "the second request should see restored settled A and require no save",
    );
    assert.equal(
      state.primaryLanguage,
      "Language A",
      "provisional B must never become rollback authority for the queued request",
    );
  }

  for (const testCase of [
    {
      label: "blank",
      primaryLanguage: "   ",
      expectedError: "the primary language cannot be blank",
    },
    {
      label: "unknown",
      primaryLanguage: "Language C",
      expectedError: "the primary language must be configured",
    },
  ]) {
    const state = makeState();
    let saveCalls = 0;

    const result = await applyPrimaryLanguageState({
      state,
      primaryLanguage: testCase.primaryLanguage,
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(result, {
      status: "invalid-request",
      error: testCase.expectedError,
    });
    assert.equal(state.primaryLanguage, "Language A", testCase.label);
    assert.equal(saveCalls, 0, `${testCase.label} request must not be saved`);
  }

  {
    const state = makeState();
    state.activeLanguages = ["Language A"];
    let saveCalls = 0;

    const result = await applyPrimaryLanguageState({
      state,
      primaryLanguage: "Language B",
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(result, {
      status: "invalid-request",
      error: "the primary language must be active",
    });
    assert.equal(state.primaryLanguage, "Language A");
    assert.equal(saveCalls, 0);
  }

  {
    const state = makeState();
    state.languages.push({ name: "Language B" });
    let saveCalls = 0;

    const result = await applyPrimaryLanguageState({
      state,
      primaryLanguage: "Language B",
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(result, {
      status: "invalid-request",
      error: "the primary language identity must be unique",
    });
    assert.equal(state.primaryLanguage, "Language A");
    assert.equal(saveCalls, 0);
  }

  {
    const state = makeState();
    let saveCalls = 0;

    const result = await applyPrimaryLanguageState({
      state,
      primaryLanguage: "Language A",
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(result, { status: "unchanged" });
    assert.equal(state.primaryLanguage, "Language A");
    assert.equal(
      saveCalls,
      0,
      "an unchanged primary must not be persisted again",
    );
  }

  console.log("primary language state regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
