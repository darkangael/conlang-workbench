import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-case-sensitive-state-"));

try {
  await build({
    entryPoints: ["case-sensitive-state.ts"],
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
      true,
      "post-preflight reload failure must not pretend the old runtime was restored",
    );
    assert.equal(
      saveCalls,
      1,
      "reload exceptions must not trigger an unjustified rollback save",
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
