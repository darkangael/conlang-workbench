import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(
  join(tmpdir(), "conlang-language-membership-state-"),
);

try {
  await build({
    entryPoints: [
      "language-membership-state.ts",
      "settings-authority-queue.ts",
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "language-membership-state.mjs");

  // Fail clearly if bundling unexpectedly produces no testable module.
  await readFile(modulePath, "utf8");

  const { applyLanguageMembershipState } = await import(
    `${pathToFileURL(modulePath).href}?v=${Date.now()}`
  );

  const queueModulePath = join(temp, "settings-authority-queue.mjs");
  await readFile(queueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(queueModulePath).href}?v=${Date.now()}`
  );

  const makeState = () => ({
    languageMembership: "folder",
  });

  {
    const state = makeState();
    const calls = [];

    const result = await applyLanguageMembershipState({
      state,
      languageMembership: "respect-explicit",
      save: async () => {
        calls.push(`save:${state.languageMembership}`);
      },
      reload: async () => {
        calls.push(`reload:${state.languageMembership}`);
        return { status: "loaded", dictionaryCount: 12 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 12,
    });
    assert.equal(state.languageMembership, "respect-explicit");
    assert.deepEqual(
      calls,
      ["save:respect-explicit", "reload:respect-explicit"],
      "requested membership policy must be persisted before runtime reload",
    );
  }

  {
    const state = makeState();
    const saveError = new Error("save failed");
    let reloadCalls = 0;

    const result = await applyLanguageMembershipState({
      state,
      languageMembership: "respect-explicit",
      save: async () => {
        assert.equal(
          state.languageMembership,
          "respect-explicit",
          "save must observe the requested membership policy",
        );
        throw saveError;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(result.error, saveError);
    assert.equal(
      state.languageMembership,
      "folder",
      "failed initial persistence must restore the previous policy",
    );
    assert.equal(
      reloadCalls,
      0,
      "runtime must not reload when initial persistence fails",
    );
  }

  {
    /*
     * Reproduce the H13 rollback-authority race through the common queue.
     *
     * T1 installs provisional "respect-explicit" and holds its save open.
     * T2 requests settled "folder" while T1 is pending. Because the callback is
     * queued, T2 must not read T1's provisional value as settled authority.
     *
     * When T1 fails, memory returns to "folder". T2 may then begin and discover
     * that its requested policy is already authoritative, requiring no save or
     * reload.
     */
    const state = makeState();
    const queue = new SettingsAuthorityQueue();
    let reloadCalls = 0;

    let rejectFirstSave;
    const firstSave = new Promise((_, reject) => {
      rejectFirstSave = reject;
    });

    let secondSaveCalls = 0;

    const firstResultPromise = queue.run(() =>
      applyLanguageMembershipState({
        state,
        languageMembership: "respect-explicit",
        save: async () => {
          await firstSave;
        },
        reload: async () => {
          reloadCalls++;
          return { status: "loaded", dictionaryCount: 0 };
        },
      }),
    );

    await Promise.resolve();

    assert.equal(
      state.languageMembership,
      "respect-explicit",
      "the first queued request should install its provisional policy",
    );

    const secondResultPromise = queue.run(() =>
      applyLanguageMembershipState({
        state,
        languageMembership: "folder",
        save: async () => {
          secondSaveCalls++;
        },
        reload: async () => {
          reloadCalls++;
          return { status: "loaded", dictionaryCount: 0 };
        },
      }),
    );

    await Promise.resolve();

    assert.equal(
      state.languageMembership,
      "respect-explicit",
      "the second transaction must not begin while T1 owns authority",
    );
    assert.equal(
      secondSaveCalls,
      0,
      "the second transaction must not persist while T1 is pending",
    );

    rejectFirstSave(new Error("first save failed"));
    const firstResult = await firstResultPromise;

    assert.equal(firstResult.status, "save-failed");
    assert.equal(
      state.languageMembership,
      "folder",
      "failed T1 must restore the original settled membership policy",
    );

    const secondResult = await secondResultPromise;

    assert.deepEqual(secondResult, { status: "unchanged" });
    assert.equal(
      secondSaveCalls,
      0,
      "T2 should observe restored folder authority and require no save",
    );
    assert.equal(
      reloadCalls,
      0,
      "failed persistence and unchanged T2 must not reach runtime reload",
    );
    assert.equal(
      state.languageMembership,
      "folder",
      "provisional membership must never become rollback authority for T2",
    );
  }

  {
    const state = makeState();
    const persisted = [];

    const result = await applyLanguageMembershipState({
      state,
      languageMembership: "respect-explicit",
      save: async () => {
        persisted.push(state.languageMembership);
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.deepEqual(result, { status: "blocked" });
    assert.equal(
      state.languageMembership,
      "folder",
      "blocked preflight must restore the policy matching untouched runtime",
    );
    assert.deepEqual(
      persisted,
      ["respect-explicit", "folder"],
      "blocked reload must persist both the request and safe rollback",
    );
  }

  {
    const state = makeState();
    let saveCalls = 0;
    const rollbackError = new Error("rollback save failed");

    const result = await applyLanguageMembershipState({
      state,
      languageMembership: "respect-explicit",
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) throw rollbackError;
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.equal(result.error, rollbackError);
    assert.equal(
      state.languageMembership,
      "folder",
      "memory must still match untouched runtime if rollback save fails",
    );
    assert.equal(saveCalls, 2);
  }

  {
    const state = makeState();
    let saveCalls = 0;
    const reloadError = new Error("loader failed after preflight");

    const result = await applyLanguageMembershipState({
      state,
      languageMembership: "respect-explicit",
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
      state.languageMembership,
      "respect-explicit",
      "post-preflight reload failure must not pretend old runtime was restored",
    );
    assert.equal(
      saveCalls,
      1,
      "reload exceptions must not trigger an unjustified rollback save",
    );
  }

  {
    const state = {
      languageMembership: "respect-explicit",
    };
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyLanguageMembershipState({
      state,
      languageMembership: "respect-explicit",
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, { status: "unchanged" });
    assert.equal(state.languageMembership, "respect-explicit");
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  console.log("language membership state regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
