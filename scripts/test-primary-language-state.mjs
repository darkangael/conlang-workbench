import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-primary-language-state-"));

try {
  await build({
    entryPoints: ["primary-language-state.ts"],
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
