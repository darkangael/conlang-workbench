import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-persisted-setting-state-"));

try {
  await build({
    entryPoints: ["persisted-setting-state.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "persisted-setting-state.mjs");
  await readFile(modulePath, "utf8");

  const { applyPersistedSettingState } = await import(
    `${pathToFileURL(modulePath).href}?v=${Date.now()}`
  );

  {
    const state = { hoverEnglish: false };
    const persisted = [];

    const result = await applyPersistedSettingState({
      read: () => state.hoverEnglish,
      write: (value) => {
        state.hoverEnglish = value;
      },
      requested: true,
      save: async () => {
        persisted.push(state.hoverEnglish);
      },
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.hoverEnglish, true);
    assert.deepEqual(
      persisted,
      [true],
      "the requested value must be present while persistence runs",
    );
  }

  {
    const state = { hoverEnglish: false };

    const result = await applyPersistedSettingState({
      read: () => state.hoverEnglish,
      write: (value) => {
        state.hoverEnglish = value;
      },
      requested: true,
      save: async () => {
        throw new Error("save failed");
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(
      state.hoverEnglish,
      false,
      "failed persistence must restore the previous live value",
    );
  }

  {
    const state = {
      hoverEnglish: false,
      unrelatedPreference: "before",
    };

    await applyPersistedSettingState({
      read: () => state.hoverEnglish,
      write: (value) => {
        state.hoverEnglish = value;
      },
      requested: true,
      save: async () => {
        throw new Error("save failed");
      },
    });

    /*
     * Model a later unrelated whole-settings save. The failed earlier request
     * must no longer be present in the live object and therefore cannot be
     * smuggled into persistence by this later operation.
     */
    state.unrelatedPreference = "after";
    const laterSnapshot = structuredClone(state);

    assert.deepEqual(laterSnapshot, {
      hoverEnglish: false,
      unrelatedPreference: "after",
    });
  }

  {
    const language = { hoverEnabled: true };
    let saveCalls = 0;

    const result = await applyPersistedSettingState({
      read: () => language.hoverEnabled,
      write: (value) => {
        language.hoverEnabled = value;
      },
      requested: false,
      save: async () => {
        saveCalls++;
        throw new Error("save failed");
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(
      language.hoverEnabled,
      true,
      "the generic transaction must also restore nested settings-backed values",
    );
    assert.equal(saveCalls, 1);
  }

  {
    const state = { commitWrapper: "html-tooltip" };
    let saveCalls = 0;

    const result = await applyPersistedSettingState({
      read: () => state.commitWrapper,
      write: (value) => {
        state.commitWrapper = value;
      },
      requested: "html-tooltip",
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(result, { status: "unchanged" });
    assert.equal(saveCalls, 0, "an unchanged value must not be saved again");
  }

  console.log("persisted setting state regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
