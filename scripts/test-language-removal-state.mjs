import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(
  path.join(os.tmpdir(), "conlang-language-removal-state-"),
);

try {
  const entry = path.join(tempDir, "test-entry.ts");

  await writeTestFile(
    entry,
    `
      export { applyLanguageRemovalState } from ${JSON.stringify(
        path.resolve("language-removal-state.ts"),
      )};
      export { SettingsAuthorityQueue } from ${JSON.stringify(
        path.resolve("settings-authority-queue.ts"),
      )};
    `,
  );

  const outfile = path.join(tempDir, "bundle.mjs");

  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { applyLanguageRemovalState, SettingsAuthorityQueue } = await import(
    pathToFileURL(outfile).href
  );

  const language = (name) => ({
    name,
    dictionaryFolder: `Languages/${name}/Lexicon`,
    sheets: [],
    hoverEnabled: true,
  });

  const makeState = () => {
    const first = language("First");
    const second = language("Second");

    return {
      first,
      second,
      state: {
        languages: [first, second],
        activeLanguages: ["First", "Second"],
        primaryLanguage: "First",
      },
    };
  };

  /*
   * Explicit approval removes only configuration for the exact object and
   * preserves the existing active/primary fallback policy.
   */
  {
    const { first, second, state } = makeState();
    let saves = 0;
    let reloads = 0;
    let confirmedName;

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async (name) => {
        confirmedName = name;
        return true;
      },
      save: async () => {
        saves += 1;
      },
      reload: async () => {
        reloads += 1;
        return { status: "loaded", dictionaryCount: 7 };
      },
    });

    assert.deepEqual(result, {
      status: "applied",
      name: "First",
      dictionaryCount: 7,
    });
    assert.equal(confirmedName, "First");
    assert.deepEqual(state.languages, [second]);
    assert.deepEqual(state.activeLanguages, ["Second"]);
    assert.equal(state.primaryLanguage, "Second");
    assert.equal(saves, 1);
    assert.equal(reloads, 1);
  }

  /*
   * Denial is fail-closed: no settings mutation, persistence, or reload.
   */
  {
    const { first, second, state } = makeState();
    let saves = 0;
    let reloads = 0;

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async () => false,
      save: async () => {
        saves += 1;
      },
      reload: async () => {
        reloads += 1;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.deepEqual(result, { status: "cancelled", name: "First" });
    assert.deepEqual(state.languages, [first, second]);
    assert.deepEqual(state.activeLanguages, ["First", "Second"]);
    assert.equal(state.primaryLanguage, "First");
    assert.equal(saves, 0);
    assert.equal(reloads, 0);
  }

  /*
   * A stale LanguageConfig object is rejected before confirmation. A settings
   * card must never authorize whichever language later occupies an old index.
   */
  {
    const { first, state } = makeState();
    state.languages = [state.languages[1]];
    let confirmations = 0;

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async () => {
        confirmations += 1;
        return true;
      },
      save: async () => {},
      reload: async () => ({ status: "loaded", dictionaryCount: 0 }),
    });

    assert.deepEqual(result, { status: "target-missing" });
    assert.equal(confirmations, 0);
  }

  /*
   * Defense-in-depth: if non-queued code changes the exact object's identity
   * while confirmation is open, approval of the old name authorizes nothing.
   */
  {
    const { first, second, state } = makeState();

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async () => {
        first.name = "Changed";
        return true;
      },
      save: async () => {},
      reload: async () => ({ status: "loaded", dictionaryCount: 0 }),
    });

    assert.deepEqual(result, {
      status: "target-changed",
      name: "First",
    });
    assert.deepEqual(state.languages, [first, second]);
  }

  /*
   * Initial persistence failure restores the complete previous settings state
   * before any runtime reload can begin.
   */
  {
    const { first, second, state } = makeState();
    let reloads = 0;

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async () => true,
      save: async () => {
        throw new Error("save failed");
      },
      reload: async () => {
        reloads += 1;
        return { status: "loaded", dictionaryCount: 0 };
      },
    });

    assert.equal(result.status, "save-failed");
    assert.deepEqual(state.languages, [first, second]);
    assert.deepEqual(state.activeLanguages, ["First", "Second"]);
    assert.equal(state.primaryLanguage, "First");
    assert.equal(reloads, 0);
  }

  /*
   * A preflight-blocked reload proves old runtime state is untouched, so the
   * previous configuration is restored and persisted with a compensating save.
   */
  {
    const { first, second, state } = makeState();
    let saves = 0;

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async () => true,
      save: async () => {
        saves += 1;
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.deepEqual(result, { status: "blocked", name: "First" });
    assert.deepEqual(state.languages, [first, second]);
    assert.deepEqual(state.activeLanguages, ["First", "Second"]);
    assert.equal(state.primaryLanguage, "First");
    assert.equal(saves, 2);
  }

  /*
   * If the compensating save fails, memory still restores the configuration
   * matching the untouched old runtime, while the result exposes persistence
   * disagreement to the UI.
   */
  {
    const { first, second, state } = makeState();
    let saves = 0;

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async () => true,
      save: async () => {
        saves += 1;
        if (saves === 2) throw new Error("rollback save failed");
      },
      reload: async () => ({ status: "blocked" }),
    });

    assert.equal(result.status, "rollback-save-failed");
    assert.deepEqual(state.languages, [first, second]);
    assert.deepEqual(state.activeLanguages, ["First", "Second"]);
    assert.equal(state.primaryLanguage, "First");
    assert.equal(saves, 2);
  }

  /*
   * A thrown post-preflight reload is NOT a rollback point. The successfully
   * persisted removal remains authoritative because runtime replacement may
   * already have begun.
   */
  {
    const { first, second, state } = makeState();

    const result = await applyLanguageRemovalState({
      state,
      language: first,
      confirm: async () => true,
      save: async () => {},
      reload: async () => {
        throw new Error("reload exploded");
      },
    });

    assert.equal(result.status, "reload-failed");
    assert.deepEqual(state.languages, [second]);
    assert.deepEqual(state.activeLanguages, ["Second"]);
    assert.equal(state.primaryLanguage, "Second");
  }

  /*
   * H13 concurrency regression:
   *
   * - an earlier authority transaction must finish before removal even reads
   *   the target name or opens confirmation;
   * - while confirmation is pending, a later authority transaction must wait;
   * - denial releases the queue without changing removal state.
   */
  {
    const queue = new SettingsAuthorityQueue();
    const { first, state } = makeState();
    const events = [];

    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    let resolveConfirmation;
    const confirmationGate = new Promise((resolve) => {
      resolveConfirmation = resolve;
    });

    const earlier = queue.run(async () => {
      events.push("earlier-start");
      await firstGate;
      events.push("earlier-end");
    });

    const removal = queue.run(() =>
      applyLanguageRemovalState({
        state,
        language: first,
        confirm: async (name) => {
          events.push(`confirm-${name}`);
          return confirmationGate;
        },
        save: async () => {
          events.push("remove-save");
        },
        reload: async () => {
          events.push("remove-reload");
          return { status: "loaded", dictionaryCount: 0 };
        },
      }),
    );

    const later = queue.run(async () => {
      events.push("later");
    });

    await Promise.resolve();
    assert.deepEqual(events, ["earlier-start"]);

    releaseFirst();
    await earlier;
    await Promise.resolve();
    assert.deepEqual(events, ["earlier-start", "earlier-end", "confirm-First"]);

    /*
     * Confirmation is deliberately still unresolved here. If the common queue
     * were released around human interaction, "later" could run now and change
     * what the creator's pending decision means.
     */
    await Promise.resolve();
    assert.equal(events.includes("later"), false);

    resolveConfirmation(false);

    const removalResult = await removal;
    await later;

    assert.deepEqual(removalResult, {
      status: "cancelled",
      name: "First",
    });
    assert.deepEqual(events, [
      "earlier-start",
      "earlier-end",
      "confirm-First",
      "later",
    ]);
  }

  console.log("language removal state regression tests passed.");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

/*
 * Write the temporary TypeScript entry point used by this regression.
 *
 * Keep this small helper local to the test: the production module has no
 * filesystem dependency, and Node's built-in writeFile is sufficient here.
 */
async function writeTestFile(file, text) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(file, text, "utf8");
}
