import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-active-language-state-"));

try {
  await build({
    entryPoints: ["active-language-state.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "active-language-state.mjs");
  await readFile(modulePath, "utf8");

  const { applyActiveLanguageState } = await import(
    `${pathToFileURL(modulePath).href}?v=${Date.now()}`
  );

  const makeState = () => ({
    activeLanguages: ["Language A"],
    primaryLanguage: "Language A",
  });

  {
    const state = makeState();
    const persisted = [];

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: ["Language A", "Language B"],
      primaryLanguage: "Language B",
      save: async () => {
        persisted.push({
          activeLanguages: [...state.activeLanguages],
          primaryLanguage: state.primaryLanguage,
        });
      },
      reload: async () => ({ status: "loaded", dictionaryCount: 12 }),
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 12,
    });
    assert.deepEqual(state, {
      activeLanguages: ["Language A", "Language B"],
      primaryLanguage: "Language B",
    });
    assert.deepEqual(persisted, [
      {
        activeLanguages: ["Language A", "Language B"],
        primaryLanguage: "Language B",
      },
    ]);
  }

  {
    const state = makeState();
    let reloadCalls = 0;

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: ["Language B"],
      primaryLanguage: "Language B",
      save: async () => {
        throw new Error("save failed");
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "save-failed");
    assert.deepEqual(
      state,
      makeState(),
      "failed initial persistence must restore the previous in-memory state",
    );
    assert.equal(
      reloadCalls,
      0,
      "reload must not run when the requested settings were never saved",
    );
  }

  {
    const state = makeState();
    const persisted = [];

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: ["Language B"],
      primaryLanguage: "Language B",
      save: async () => {
        persisted.push({
          activeLanguages: [...state.activeLanguages],
          primaryLanguage: state.primaryLanguage,
        });
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(
      state,
      makeState(),
      "blocked preflight must restore the configuration matching old runtime",
    );
    assert.deepEqual(
      persisted,
      [
        {
          activeLanguages: ["Language B"],
          primaryLanguage: "Language B",
        },
        {
          activeLanguages: ["Language A"],
          primaryLanguage: "Language A",
        },
      ],
      "blocked reload must persist both the request and the rollback",
    );
  }

  {
    const state = makeState();
    let saveCalls = 0;

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: ["Language B"],
      primaryLanguage: "Language B",
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) {
          throw new Error("rollback save failed");
        }
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.deepEqual(
      state,
      makeState(),
      "memory must still be restored when persistence of rollback fails",
    );
    assert.equal(saveCalls, 2);
  }

  {
    const state = makeState();
    let saveCalls = 0;

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: ["Language B"],
      primaryLanguage: "Language B",
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        throw new Error("loader failed after preflight");
      },
    });

    assert.equal(result.status, "reload-failed");
    assert.deepEqual(
      state,
      {
        activeLanguages: ["Language B"],
        primaryLanguage: "Language B",
      },
      "arbitrary reload exceptions must not be treated as safe rollback points",
    );
    assert.equal(
      saveCalls,
      1,
      "reload exceptions must not trigger an unjustified rollback save",
    );
  }

  {
    const state = makeState();
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: [],
      primaryLanguage: "Language A",
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "invalid-request");
    assert.deepEqual(state, makeState());
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  {
    const state = makeState();
    let saveCalls = 0;

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: ["Language A"],
      primaryLanguage: "Language B",
      save: async () => {
        saveCalls++;
      },
      reload: async () => ({ status: "loaded", dictionaryCount: 0 }),
    });

    assert.equal(result.status, "invalid-request");
    assert.deepEqual(state, makeState());
    assert.equal(
      saveCalls,
      0,
      "an inactive primary must be rejected before persistence",
    );
  }

  {
    const state = makeState();
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyActiveLanguageState({
      state,
      activeLanguages: ["Language A", "Language A"],
      primaryLanguage: "Language A",
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "invalid-request");
    assert.deepEqual(state, makeState());
    assert.equal(
      saveCalls,
      0,
      "duplicate active identities must be rejected before persistence",
    );
    assert.equal(reloadCalls, 0);
  }

  console.log("active language state regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
