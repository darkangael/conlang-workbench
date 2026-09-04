import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-root-recreation-state-"));

try {
  /*
   * Bundle the pure state transaction and common authority queue together.
   * Production will compose them in main.ts later; this regression proves the
   * same queue-holding semantics without importing Obsidian.
   */
  const entry = join(tempDir, "test-entry.ts");

  await writeFile(
    entry,
    `
      export { applyLanguageRootRecreationState } from ${JSON.stringify(
        resolve("language-root-recreation-state.ts"),
      )};
      export { SettingsAuthorityQueue } from ${JSON.stringify(
        resolve("settings-authority-queue.ts"),
      )};
    `,
    "utf8",
  );

  const outfile = join(tempDir, "bundle.mjs");

  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { applyLanguageRootRecreationState, SettingsAuthorityQueue } =
    await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

  const root = "Languages/Test Language";

  const paths = {
    root,
    lexicon: `${root}/Lexicon`,
    morphemes: `${root}/Morphemes`,
    inflections: `${root}/Inflections`,
    cyphers: `${root}/Cyphers`,
    examples: `${root}/Examples`,
    phonology: `${root}/Phonology`,
  };

  function makeLanguage(overrides = {}) {
    return {
      name: "Test Language",
      workbenchID: "wb:language:test-language",
      rootFolder: root,
      dictionaryFolder: paths.lexicon,
      morphemeFolder: paths.morphemes,
      exampleFolder: paths.examples,
      phonologyFolder: paths.phonology,
      sheets: [],
      hoverEnabled: true,
      ...overrides,
    };
  }

  function makePlan() {
    return {
      status: "planned",
      root,
      paths,
      foldersToEstablish: [
        paths.root,
        paths.lexicon,
        paths.morphemes,
        paths.inflections,
        paths.cyphers,
        paths.examples,
        paths.phonology,
      ],
    };
  }

  function makeRequest(overrides = {}) {
    const language = makeLanguage();

    return {
      language,
      state: {
        languages: [language],
        activeLanguages: ["Test Language"],
      },
      plan: () => makePlan(),
      confirm: async () => true,
      preflightHierarchy: () => ({ status: "clear" }),
      establishRoot: async () => ({ status: "established" }),
      establishChildren: async () => {},
      reload: async () => ({ status: "loaded", dictionaryCount: 7 }),
      ...overrides,
    };
  }

  /*
   * The successful active-language path asks for explicit authorization,
   * establishes the root before its children, and reloads without changing
   * configured identity.
   */
  {
    const request = makeRequest();
    const events = [];
    const originalID = request.language.workbenchID;
    const originalRoot = request.language.rootFolder;

    request.confirm = async (name, requestedRoot) => {
      events.push(`confirm:${name}:${requestedRoot}`);
      return true;
    };

    request.preflightHierarchy = () => {
      events.push("preflight");
      return { status: "clear" };
    };

    request.establishRoot = async () => {
      events.push("root");
      return { status: "established" };
    };

    request.establishChildren = async () => {
      events.push("children");
    };

    request.reload = async () => {
      events.push("reload");
      return { status: "loaded", dictionaryCount: 7 };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.deepEqual(result, {
      status: "applied",
      name: "Test Language",
      root,
      dictionaryCount: 7,
      foldersEstablished: true,
    });

    assert.deepEqual(events, [
      `confirm:Test Language:${root}`,
      "preflight",
      "root",
      "children",
      "reload",
    ]);

    assert.equal(request.language.workbenchID, originalID);
    assert.equal(request.language.rootFolder, originalRoot);
  }

  /*
   * A stale UI target is rejected before either planning or confirmation.
   */
  {
    const request = makeRequest();
    request.state.languages = [];
    let plans = 0;
    let confirmations = 0;

    request.plan = () => {
      plans++;
      return makePlan();
    };

    request.confirm = async () => {
      confirmations++;
      return true;
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.deepEqual(result, { status: "target-missing" });
    assert.equal(plans, 0);
    assert.equal(confirmations, 0);
  }

  /*
   * If the initial current-state plan says Recreate is not authorized, the
   * creator is not asked to approve an operation Workbench already knows it
   * cannot safely perform.
   */
  {
    const request = makeRequest();
    let confirmations = 0;

    request.plan = () => ({
      status: "blocked",
      reason: "root-now-folder",
      detail: "A folder now exists. Try Repair language root instead.",
    });

    request.confirm = async () => {
      confirmations++;
      return true;
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "root-now-folder");
    assert.equal(confirmations, 0);
  }

  /*
   * Cancellation grants no filesystem authority.
   */
  {
    const request = makeRequest();
    let preflights = 0;
    let rootCalls = 0;
    let childCalls = 0;
    let reloads = 0;

    request.confirm = async () => false;

    request.preflightHierarchy = () => {
      preflights++;
      return { status: "clear" };
    };

    request.establishRoot = async () => {
      rootCalls++;
      return { status: "established" };
    };

    request.establishChildren = async () => {
      childCalls++;
    };

    request.reload = async () => {
      reloads++;
      return { status: "loaded", dictionaryCount: 0 };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.deepEqual(result, {
      status: "cancelled",
      name: "Test Language",
      root,
    });
    assert.equal(preflights, 0);
    assert.equal(rootCalls, 0);
    assert.equal(childCalls, 0);
    assert.equal(reloads, 0);
  }

  /*
   * Defense-in-depth: changing stable configured identity while confirmation
   * is open invalidates approval before a second plan or any vault operation.
   */
  {
    const request = makeRequest();
    let plans = 0;
    let rootCalls = 0;

    request.plan = () => {
      plans++;
      return makePlan();
    };

    request.confirm = async () => {
      request.language.workbenchID = "wb:language:unexpected-replacement";
      return true;
    };

    request.establishRoot = async () => {
      rootCalls++;
      return { status: "established" };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.deepEqual(result, {
      status: "target-changed",
      name: "Test Language",
      root,
    });
    assert.equal(plans, 1);
    assert.equal(rootCalls, 0);
  }

  /*
   * The plan is recalculated after confirmation. If a folder appeared while
   * the creator was deciding, Recreate ends before hierarchy preflight or any
   * establishment callback can touch it.
   */
  {
    const request = makeRequest();
    let plans = 0;
    let preflights = 0;
    let rootCalls = 0;
    let childCalls = 0;

    request.plan = () => {
      plans++;

      if (plans === 1) {
        return makePlan();
      }

      return {
        status: "blocked",
        reason: "root-now-folder",
        detail:
          "A folder now exists. Workbench will not assume it is the old root. " +
          "Try Repair language root instead.",
      };
    };

    request.preflightHierarchy = () => {
      preflights++;
      return { status: "clear" };
    };

    request.establishRoot = async () => {
      rootCalls++;
      return { status: "established" };
    };

    request.establishChildren = async () => {
      childCalls++;
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "root-now-folder");
    assert.equal(plans, 2);
    assert.equal(preflights, 0);
    assert.equal(rootCalls, 0);
    assert.equal(childCalls, 0);
  }

  /*
   * Whole-hierarchy preflight is still read-only. A later canonical collision
   * must stop the operation before the root itself is created.
   */
  {
    const request = makeRequest();
    let rootCalls = 0;
    let childCalls = 0;

    request.preflightHierarchy = () => ({
      status: "blocked",
      reason: "hierarchy-not-folder",
      detail: `"${paths.phonology}" exists but is not a folder`,
    });

    request.establishRoot = async () => {
      rootCalls++;
      return { status: "established" };
    };

    request.establishChildren = async () => {
      childCalls++;
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "hierarchy-not-folder");
    assert.equal(rootCalls, 0);
    assert.equal(childCalls, 0);
  }

  /*
   * Critical final race regression:
   *
   * Both pure plans and the complete read-only hierarchy preflight can observe
   * the root as missing, but a folder may appear in the tiny interval before
   * mutation. The strongest establishRoot boundary must refuse to adopt it.
   * Canonical child establishment must then be called ZERO times.
   */
  {
    const request = makeRequest();
    let childCalls = 0;
    let reloads = 0;

    request.establishRoot = async () => ({
      status: "blocked",
      reason: "root-now-folder",
      detail:
        `A folder now exists at "${root}". Workbench did not recreate it. ` +
        "Try Repair language root instead.",
    });

    request.establishChildren = async () => {
      childCalls++;
    };

    request.reload = async () => {
      reloads++;
      return { status: "loaded", dictionaryCount: 0 };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "root-now-folder");
    assert.equal(childCalls, 0);
    assert.equal(reloads, 0);
  }

  /*
   * The shared Languages container may disappear after both pure planning and
   * hierarchy preflight. Recreate owns only the configured language root, so
   * this final race must stop before any child creation or runtime reload.
   */
  {
    const request = makeRequest();
    let childCalls = 0;
    let reloads = 0;

    request.establishRoot = async () => ({
      status: "blocked",
      reason: "container-missing",
      detail: 'The shared "Languages" folder disappeared before root creation.',
    });

    request.establishChildren = async () => {
      childCalls++;
    };

    request.reload = async () => {
      reloads++;
      return { status: "loaded", dictionaryCount: 0 };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "container-missing");
    assert.equal(childCalls, 0);
    assert.equal(reloads, 0);
  }

  /*
   * A non-folder that appears at the shared Languages path is likewise outside
   * Recreate authority. Workbench must not replace or reinterpret it, and no
   * language-root child work or runtime reload may follow.
   */
  {
    const request = makeRequest();
    let childCalls = 0;
    let reloads = 0;

    request.establishRoot = async () => ({
      status: "blocked",
      reason: "container-not-folder",
      detail: 'The shared "Languages" path is occupied by a non-folder object.',
    });

    request.establishChildren = async () => {
      childCalls++;
    };

    request.reload = async () => {
      reloads++;
      return { status: "loaded", dictionaryCount: 0 };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "container-not-folder");
    assert.equal(childCalls, 0);
    assert.equal(reloads, 0);
  }

  /*
   * A non-folder that appears at the final root boundary is also a hard stop,
   * and no child establishment or reload follows.
   */
  {
    const request = makeRequest();
    let childCalls = 0;

    request.establishRoot = async () => ({
      status: "blocked",
      reason: "root-not-folder",
      detail: "The configured root path is occupied by a non-folder.",
    });

    request.establishChildren = async () => {
      childCalls++;
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "root-not-folder");
    assert.equal(childCalls, 0);
  }

  /*
   * Once this transaction positively establishes its root, failure while
   * creating canonical children does not authorize deleting that root or any
   * already-created children.
   */
  {
    const request = makeRequest();
    const folderError = new Error("child creation failed");
    let reloads = 0;

    request.establishChildren = async () => {
      throw folderError;
    };

    request.reload = async () => {
      reloads++;
      return { status: "loaded", dictionaryCount: 0 };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "folder-establishment-failed");
    assert.equal(result.error, folderError);
    assert.equal(result.rootEstablished, true);
    assert.equal(reloads, 0);
  }

  /*
   * Inactive languages have no runtime inventory to rebuild. Physical
   * recreation therefore finishes without an unnecessary reload.
   */
  {
    const request = makeRequest();
    request.state.activeLanguages = ["Some Other Language"];
    let reloads = 0;

    request.reload = async () => {
      reloads++;
      return { status: "loaded", dictionaryCount: 0 };
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.deepEqual(result, {
      status: "applied",
      name: "Test Language",
      root,
      foldersEstablished: true,
    });
    assert.equal(reloads, 0);
  }

  /*
   * A blocked active reload leaves the previous runtime authoritative. Since
   * Recreate never changed settings, there is no rollback save; the additive
   * folder structure remains and the result reports that distinction.
   */
  {
    const request = makeRequest();

    request.reload = async () => ({ status: "blocked" });

    const result = await applyLanguageRootRecreationState(request);

    assert.deepEqual(result, {
      status: "reload-blocked",
      name: "Test Language",
      root,
      foldersEstablished: true,
    });
  }

  /*
   * A thrown detached runtime preparation failure has the same structural
   * preservation rule. The original error is surfaced without deleting the
   * recreated hierarchy.
   */
  {
    const request = makeRequest();
    const reloadError = new Error("runtime preparation failed");

    request.reload = async () => {
      throw reloadError;
    };

    const result = await applyLanguageRootRecreationState(request);

    assert.equal(result.status, "reload-failed");
    assert.equal(result.error, reloadError);
    assert.equal(result.foldersEstablished, true);
  }

  /*
   * H13 composition regression:
   *
   * Production must wrap Recreate in the common settings-authority queue.
   * An earlier transaction must finish before Recreate even plans, and a later
   * transaction must remain blocked while creator confirmation is pending.
   */
  {
    const queue = new SettingsAuthorityQueue();
    const request = makeRequest();
    const events = [];

    let releaseEarlier;
    const earlierGate = new Promise((resolveGate) => {
      releaseEarlier = resolveGate;
    });

    let resolveConfirmation;
    const confirmationGate = new Promise((resolveGate) => {
      resolveConfirmation = resolveGate;
    });

    const earlier = queue.run(async () => {
      events.push("earlier-start");
      await earlierGate;
      events.push("earlier-end");
    });

    request.plan = () => {
      events.push("recreate-plan");
      return makePlan();
    };

    request.confirm = async () => {
      events.push("recreate-confirm");
      return confirmationGate;
    };

    request.preflightHierarchy = () => {
      events.push("recreate-preflight");
      return { status: "clear" };
    };

    const recreation = queue.run(() =>
      applyLanguageRootRecreationState(request),
    );

    const later = queue.run(async () => {
      events.push("later");
    });

    await Promise.resolve();
    assert.deepEqual(events, ["earlier-start"]);

    releaseEarlier();
    await earlier;
    await Promise.resolve();

    assert.deepEqual(events, [
      "earlier-start",
      "earlier-end",
      "recreate-plan",
      "recreate-confirm",
    ]);

    /*
     * Confirmation remains unresolved here. The later authority transaction
     * must not run underneath the creator's pending decision.
     */
    await Promise.resolve();
    assert.equal(events.includes("later"), false);

    resolveConfirmation(false);

    const recreationResult = await recreation;
    await later;

    assert.deepEqual(recreationResult, {
      status: "cancelled",
      name: "Test Language",
      root,
    });

    assert.deepEqual(events, [
      "earlier-start",
      "earlier-end",
      "recreate-plan",
      "recreate-confirm",
      "later",
    ]);
  }

  console.log("language root recreation state regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
