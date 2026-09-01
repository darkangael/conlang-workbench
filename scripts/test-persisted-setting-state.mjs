import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-persisted-setting-state-"));

try {
  await build({
    entryPoints: ["persisted-setting-state.ts", "settings-authority-queue.ts"],
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

  const queueModulePath = join(temp, "settings-authority-queue.mjs");
  await readFile(queueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(queueModulePath).href}?v=${Date.now()}`
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

  {
    /*
     * H13 regression: ordinary-setting transactions must be serialized before
     * they read live authority.
     *
     * The first request installs "first" while its save is pending. The second
     * request is submitted immediately, but the queue must not start it yet.
     * Therefore it cannot capture "first" as its previous authoritative value.
     *
     * Both saves are then rejected deliberately. Each queued transaction must
     * independently restore the same original persisted authority: "initial".
     */
    const state = { preference: "initial" };
    const queue = new SettingsAuthorityQueue();

    let rejectFirstSave;
    let rejectSecondSave;
    let firstSaveCalls = 0;
    let secondSaveCalls = 0;

    const firstSave = new Promise((_, reject) => {
      rejectFirstSave = reject;
    });

    const secondSave = new Promise((_, reject) => {
      rejectSecondSave = reject;
    });

    const first = queue.run(() =>
      applyPersistedSettingState({
        read: () => state.preference,
        write: (value) => {
          state.preference = value;
        },
        requested: "first",
        save: () => {
          firstSaveCalls++;
          return firstSave;
        },
      }),
    );

    /*
     * Promise callbacks begin on a microtask. Yield once so the first queued
     * transaction reaches its save boundary before submitting assertions about
     * the provisional live state.
     */
    await Promise.resolve();

    assert.equal(firstSaveCalls, 1);
    assert.equal(
      state.preference,
      "first",
      "the first queued request should be provisionally live while its save is pending",
    );

    const second = queue.run(() =>
      applyPersistedSettingState({
        read: () => state.preference,
        write: (value) => {
          state.preference = value;
        },
        requested: "second",
        save: () => {
          secondSaveCalls++;
          return secondSave;
        },
      }),
    );

    await Promise.resolve();

    assert.equal(
      secondSaveCalls,
      0,
      "the second save must not start while the first transaction is pending",
    );
    assert.equal(
      state.preference,
      "first",
      "the queued second request must not install its value before the first transaction settles",
    );

    rejectFirstSave(new Error("first save failed"));
    const firstResult = await first;

    assert.equal(firstResult.status, "save-failed");

    /*
     * Yield so the queue can begin the second transaction after the first has
     * completely rolled back to "initial".
     */
    await Promise.resolve();

    assert.equal(secondSaveCalls, 1);
    assert.equal(
      state.preference,
      "second",
      "the second request should start only after the first rollback has settled",
    );

    rejectSecondSave(new Error("second save failed"));
    const secondResult = await second;

    assert.equal(secondResult.status, "save-failed");
    assert.equal(
      state.preference,
      "initial",
      "two failed queued requests must restore the original persisted authority",
    );
  }

  console.log("persisted setting state regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
