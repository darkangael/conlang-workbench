import assert from "node:assert/strict";
import { build } from "esbuild";

/**
 * Bundle the real Recreate root writer with tiny Obsidian file-class doubles.
 *
 * Production uses `instanceof TFolder` as an authority distinction, so the test
 * exports TFile/TFolder from the SAME bundle as the production writer. This
 * avoids accidentally testing against a different JavaScript constructor
 * identity than the writer itself sees.
 */
const obsidianMockPlugin = {
  name: "obsidian-language-root-recreation-writer-test",

  setup(buildApi) {
    buildApi.onResolve({ filter: /^obsidian$/ }, () => ({
      path: "obsidian",
      namespace: "obsidian-test",
    }));

    buildApi.onLoad({ filter: /.*/, namespace: "obsidian-test" }, () => ({
      contents: `
        export class TFile {
          constructor(path) {
            this.path = path;
          }
        }

        export class TFolder {
          constructor(path) {
            this.path = path;
          }
        }
      `,
      loader: "js",
    }));
  },
};

const buildResult = await build({
  stdin: {
    contents: `
      export {
        establishLanguageRootForRecreation
      } from "./language-root-recreation-writer";

      export { TFile, TFolder } from "obsidian";
    `,
    resolveDir: process.cwd(),
    loader: "js",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [obsidianMockPlugin],
});

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(buildResult.outputFiles[0].text).toString("base64");

const { establishLanguageRootForRecreation, TFile, TFolder } = await import(
  moduleUrl
);

const container = "Languages";
const root = "Languages/Mer";

/**
 * Minimal mutable vault surface for exercising the final Recreate race.
 *
 * `beforeCreate` lets a regression change vault state inside createFolder()
 * immediately before that operation throws. This models the narrow interval
 * between the writer's final read and Obsidian's filesystem mutation.
 */
function makeApp({
  folders = [],
  files = [],
  beforeCreate = null,
  createError = null,
} = {}) {
  const objects = new Map();
  const createCalls = [];

  for (const path of folders) {
    objects.set(path, new TFolder(path));
  }

  for (const path of files) {
    objects.set(path, new TFile(path));
  }

  const app = {
    vault: {
      getAbstractFileByPath(path) {
        return objects.get(path) ?? null;
      },

      async createFolder(path) {
        createCalls.push(path);

        if (beforeCreate) {
          await beforeCreate({ path, objects });
        }

        if (createError) {
          throw createError;
        }

        if (objects.has(path)) {
          throw new Error(`already exists: ${path}`);
        }

        objects.set(path, new TFolder(path));
      },
    },
  };

  return {
    app,
    objects,
    createCalls,
  };
}

/*
 * Ordinary success creates exactly the already-authorized root beneath an
 * existing shared Languages folder. It creates no ancestor or canonical child.
 */
{
  const { app, objects, createCalls } = makeApp({
    folders: [container],
  });

  const result = await establishLanguageRootForRecreation(app, root);

  assert.deepEqual(result, { status: "established" });
  assert.deepEqual(createCalls, [root]);
  assert.ok(objects.get(container) instanceof TFolder);
  assert.ok(objects.get(root) instanceof TFolder);
  assert.equal(objects.size, 2);
}

/*
 * Recreate does not inherit Add Language authority. A missing shared container
 * blocks before createFolder() is called.
 */
{
  const { app, createCalls } = makeApp();

  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "container-missing");
  assert.deepEqual(createCalls, []);
}

/*
 * A non-folder at Languages is creator-visible data and cannot be replaced or
 * reinterpreted as shared structural authority.
 */
{
  const { app, objects, createCalls } = makeApp({
    files: [container],
  });

  const original = objects.get(container);
  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "container-not-folder");
  assert.equal(objects.get(container), original);
  assert.deepEqual(createCalls, []);
}

/*
 * A root folder that already exists at the final observation is not adopted.
 * The creator must reconcile its identity through Repair.
 */
{
  const { app, objects, createCalls } = makeApp({
    folders: [container, root],
  });

  const originalRoot = objects.get(root);
  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "root-now-folder");
  assert.equal(objects.get(root), originalRoot);
  assert.deepEqual(createCalls, []);
}

/*
 * A non-folder at the configured root is a hard collision and remains
 * untouched.
 */
{
  const { app, objects, createCalls } = makeApp({
    folders: [container],
    files: [root],
  });

  const originalRoot = objects.get(root);
  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "root-not-folder");
  assert.equal(objects.get(root), originalRoot);
  assert.deepEqual(createCalls, []);
}

/*
 * Critical creation race: another actor creates the root after our final read
 * but before createFolder() completes. Ordinary additive folder creation may
 * reuse that race; Recreate specifically MUST NOT. The newly present folder is
 * routed to Repair instead.
 */
{
  const raceError = new Error("simulated concurrent root creation");
  const { app, objects, createCalls } = makeApp({
    folders: [container],
    createError: raceError,
    beforeCreate: ({ objects }) => {
      objects.set(root, new TFolder(root));
    },
  });

  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "root-now-folder");
  assert.deepEqual(createCalls, [root]);
  assert.ok(objects.get(root) instanceof TFolder);
}

/*
 * The same final race can produce a non-folder collision. It blocks and is
 * never replaced.
 */
{
  const raceError = new Error("simulated concurrent root file");
  const { app, objects } = makeApp({
    folders: [container],
    createError: raceError,
    beforeCreate: ({ objects }) => {
      objects.set(root, new TFile(root));
    },
  });

  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "root-not-folder");
  assert.ok(objects.get(root) instanceof TFile);
}

/*
 * The shared container can disappear in the final mutation interval. Recreate
 * must not respond by recreating that broader structure.
 */
{
  const raceError = new Error("simulated container removal");
  const { app, objects } = makeApp({
    folders: [container],
    createError: raceError,
    beforeCreate: ({ objects }) => {
      objects.delete(container);
    },
  });

  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "container-missing");
  assert.equal(objects.has(container), false);
  assert.equal(objects.has(root), false);
}

/*
 * A shared-container non-folder collision appearing during creation likewise
 * removes Recreate authority and is preserved unchanged.
 */
{
  const raceError = new Error("simulated container replacement");
  const { app, objects } = makeApp({
    folders: [container],
    createError: raceError,
    beforeCreate: ({ objects }) => {
      objects.set(container, new TFile(container));
    },
  });

  const result = await establishLanguageRootForRecreation(app, root);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "container-not-folder");
  assert.ok(objects.get(container) instanceof TFile);
}

/*
 * Only recognized authority races are converted into blocked results.
 * Permission errors and other unexplained host failures must remain failures.
 */
{
  const operationalError = new Error("simulated permission failure");
  const { app, createCalls } = makeApp({
    folders: [container],
    createError: operationalError,
  });

  await assert.rejects(
    establishLanguageRootForRecreation(app, root),
    (error) => error === operationalError,
    "the exact unexplained createFolder error should be preserved",
  );

  assert.deepEqual(createCalls, [root]);
}

console.log("language root recreation writer regression tests passed.");
