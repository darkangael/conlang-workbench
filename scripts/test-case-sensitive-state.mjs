import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-case-sensitive-state-"));

try {
  await build({
    entryPoints: ["case-sensitive-state.ts", "settings-authority-queue.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "case-sensitive-state.mjs");

  // Produce a clear test failure if bundling unexpectedly created no output.
  await readFile(modulePath, "utf8");

  const { applyCaseSensitiveMatchingState } = await import(
    `${pathToFileURL(modulePath).href}?v=${Date.now()}`
  );

  const queueModulePath = join(temp, "settings-authority-queue.mjs");
  await readFile(queueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(queueModulePath).href}?v=${Date.now()}`
  );

  const makeState = () => ({
    caseSensitiveMatching: false,
  });

  {
    const state = makeState();
    const calls = [];

    const result = await applyCaseSensitiveMatchingState({
      state,
      caseSensitiveMatching: true,
      save: async () => {
        calls.push(`save:${state.caseSensitiveMatching}`);
      },
      reload: async () => {
        calls.push(`reload:${state.caseSensitiveMatching}`);
        return { status: "loaded", dictionaryCount: 12 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      dictionaryCount: 12,
    });
    assert.equal(state.caseSensitiveMatching, true);
    assert.deepEqual(
      calls,
      ["save:true", "reload:true"],
      "requested policy must be persisted before runtime is rebuilt under it",
    );
  }

  {
    const state = makeState();
    let reloadCalls = 0;
    const saveError = new Error("save failed");

    const result = await applyCaseSensitiveMatchingState({
      state,
      caseSensitiveMatching: true,
      save: async () => {
        assert.equal(
          state.caseSensitiveMatching,
          true,
          "save callback must observe the requested policy",
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
      state.caseSensitiveMatching,
      false,
      "failed initial persistence must restore the old in-memory policy",
    );
    assert.equal(
      reloadCalls,
      0,
      "runtime must not reload when the requested setting was not saved",
    );
  }

  {
    /*
     * Reproduce the H13 initial-save ordering through the common coordinator.
     *
     * T1 changes settled false -> provisional true and holds its save open.
     * T2 requests false while provisional true is live, but its callback must
     * remain queued and therefore cannot treat true as settled rollback
     * authority.
     *
     * When T1 fails, H9 restores settled false. T2 may then begin, observe that
     * its requested false policy is already authoritative, and return unchanged
     * without saving or reloading.
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
      applyCaseSensitiveMatchingState({
        state,
        caseSensitiveMatching: true,
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
      state.caseSensitiveMatching,
      true,
      "the first queued request should install its provisional policy",
    );

    const secondResultPromise = queue.run(() =>
      applyCaseSensitiveMatchingState({
        state,
        caseSensitiveMatching: false,
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
      state.caseSensitiveMatching,
      true,
      "the second request must not begin while T1 owns the authority boundary",
    );
    assert.equal(
      secondSaveCalls,
      0,
      "the second request must not persist while T1 is pending",
    );

    rejectFirstSave(new Error("first save failed"));
    const firstResult = await firstResultPromise;

    assert.equal(firstResult.status, "save-failed");
    assert.equal(
      state.caseSensitiveMatching,
      false,
      "failed T1 must restore the original settled policy",
    );

    const secondResult = await secondResultPromise;

    assert.deepEqual(secondResult, { status: "unchanged" });
    assert.equal(
      secondSaveCalls,
      0,
      "T2 should see restored false and require no persistence",
    );
    assert.equal(
      reloadCalls,
      0,
      "failed initial persistence and unchanged T2 must not reach runtime reload",
    );
    assert.equal(
      state.caseSensitiveMatching,
      false,
      "provisional true must never become rollback authority for the queued request",
    );
  }

  {
    const state = makeState();
    const persisted = [];

    const result = await applyCaseSensitiveMatchingState({
      state,
      caseSensitiveMatching: true,
      save: async () => {
        persisted.push(state.caseSensitiveMatching);
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.deepEqual(result, { status: "blocked" });
    assert.equal(
      state.caseSensitiveMatching,
      false,
      "blocked preflight must restore the policy matching untouched indexes",
    );
    assert.deepEqual(
      persisted,
      [true, false],
      "blocked reload must persist both the request and its safe rollback",
    );
  }

  {
    const state = makeState();
    let saveCalls = 0;
    const rollbackError = new Error("rollback save failed");

    const result = await applyCaseSensitiveMatchingState({
      state,
      caseSensitiveMatching: true,
      save: async () => {
        saveCalls++;
        if (saveCalls === 2) throw rollbackError;
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.equal(result.error, rollbackError);
    assert.equal(
      state.caseSensitiveMatching,
      false,
      "memory must still match untouched runtime when rollback persistence fails",
    );
    assert.equal(saveCalls, 2);
  }

  {
    const state = makeState();
    let saveCalls = 0;
    const reloadError = new Error("loader failed after preflight");

    const result = await applyCaseSensitiveMatchingState({
      state,
      caseSensitiveMatching: true,
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
      state.caseSensitiveMatching,
      false,
      "thrown candidate preparation must restore the policy matching old runtime",
    );
    assert.equal(
      saveCalls,
      2,
      "thrown candidate preparation must persist both the request and rollback",
    );
  }

  {
    const state = {
      caseSensitiveMatching: true,
    };
    let saveCalls = 0;
    let reloadCalls = 0;

    const result = await applyCaseSensitiveMatchingState({
      state,
      caseSensitiveMatching: true,
      save: async () => {
        saveCalls++;
      },
      reload: async () => {
        reloadCalls++;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, { status: "unchanged" });
    assert.equal(state.caseSensitiveMatching, true);
    assert.equal(saveCalls, 0);
    assert.equal(reloadCalls, 0);
  }

  console.log("case-sensitive state regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
