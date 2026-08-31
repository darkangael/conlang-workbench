import assert from "node:assert/strict";
import { build } from "esbuild";

/**
 * Load the real production modules while replacing Obsidian's runtime classes
 * with small test doubles.
 *
 * Keeping TFile/TFolder inside the same esbuild bundle is important because the
 * production safety checks use `instanceof TFolder`. The mock and production
 * code therefore see exactly the same constructor identity.
 */
const obsidianMockPlugin = {
  name: "obsidian-language-creator-test",
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
        buildStandardLanguagePaths,
        createStandardLanguage,
      } from "./language-creator";
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

const { buildStandardLanguagePaths, createStandardLanguage, TFile, TFolder } =
  await import(moduleUrl);

/**
 * Minimal in-memory Obsidian vault used to observe exactly which folders the
 * production creator attempts to establish.
 */
function makeApp(initial = {}) {
  const objects = new Map();
  const created = [];

  for (const folder of initial.folders ?? []) {
    objects.set(folder, new TFolder(folder));
  }

  for (const file of initial.files ?? []) {
    objects.set(file, new TFile(file));
  }

  const app = {
    vault: {
      getAbstractFileByPath(path) {
        return objects.get(path) ?? null;
      },

      async createFolder(path) {
        if (objects.has(path)) {
          throw new Error(`already exists: ${path}`);
        }

        objects.set(path, new TFolder(path));
        created.push(path);
      },
    },
  };

  return {
    app,
    objects,
    created,
  };
}

const expected = {
  root: "Languages/Language 1",
  lexicon: "Languages/Language 1/Lexicon",
  morphemes: "Languages/Language 1/Morphemes",
  inflections: "Languages/Language 1/Inflections",
  cyphers: "Languages/Language 1/Cyphers",
  examples: "Languages/Language 1/Examples",
  phonology: "Languages/Language 1/Phonology",
};

assert.deepEqual(
  buildStandardLanguagePaths("Language 1"),
  expected,
  "the standard new-language folder convention should remain stable",
);

/*
 * Fresh creation establishes the complete six-folder skeleton and wires only
 * the four source roots supported by the current LanguageConfig.
 */
{
  const { app, objects } = makeApp();

  const result = await createStandardLanguage(app, "Language 1", []);

  assert.equal(result.status, "created");

  for (const path of Object.values(expected)) {
    assert.ok(
      objects.get(path) instanceof TFolder,
      `${path} should exist as a folder`,
    );
  }

  assert.deepEqual(result.language, {
    name: "Language 1",
    dictionaryFolder: expected.lexicon,
    morphemeFolder: expected.morphemes,
    exampleFolder: expected.examples,
    phonologyFolder: expected.phonology,
    hoverEnabled: true,
    sheets: [],
  });
}

/*
 * Existing valid folders are reused. Workbench may establish missing siblings,
 * but it must not replace the canonical root or disturb creator organization
 * already nested beneath Lexicon.
 */
{
  const nestedDictionary =
    "Languages/Language 1/Lexicon/My Existing Dictionary";

  const { app, objects } = makeApp({
    folders: ["Languages", expected.root, expected.lexicon, nestedDictionary],
  });

  const originalLexicon = objects.get(expected.lexicon);

  const result = await createStandardLanguage(app, "Language 1", []);

  assert.equal(result.status, "created");
  assert.equal(objects.get(expected.lexicon), originalLexicon);
  assert.ok(objects.get(nestedDictionary) instanceof TFolder);
}

/*
 * A Markdown note whose filename resembles a standard folder name is merely a
 * sibling. `Morphemes.md` must not be mistaken for the `Morphemes/` directory.
 */
{
  const morphemeNote = "Languages/Language 1/Morphemes.md";
  const { app, objects } = makeApp({
    folders: ["Languages", expected.root],
    files: [morphemeNote],
  });

  const result = await createStandardLanguage(app, "Language 1", []);

  assert.equal(result.status, "created");
  assert.ok(objects.get(morphemeNote) instanceof TFile);
  assert.ok(objects.get(expected.morphemes) instanceof TFolder);
}

/*
 * An exact non-folder collision anywhere in the intended tree blocks the whole
 * onboarding operation before the first folder mutation.
 */
{
  const { app, objects, created } = makeApp({
    files: [expected.morphemes],
  });

  const result = await createStandardLanguage(app, "Language 1", []);

  assert.equal(result.status, "blocked");
  assert.match(result.error, /exists but is not a folder/);
  assert.deepEqual(created, []);
  assert.equal(objects.size, 1);
}

/*
 * A non-folder at the language root also blocks before Workbench creates the
 * top-level Languages folder or any sibling source destination.
 */
{
  const { app, created } = makeApp({
    files: [expected.root],
  });

  const result = await createStandardLanguage(app, "Language 1", []);

  assert.equal(result.status, "blocked");
  assert.deepEqual(created, []);
}

/*
 * The generated language name must remain one path component. Traversal-like
 * names are rejected rather than repaired into some different destination.
 */
{
  const { app, created } = makeApp();

  const result = await createStandardLanguage(app, "../Outside", []);

  assert.equal(result.status, "blocked");
  assert.deepEqual(created, []);
}

/*
 * Same-inventory canonical authority cannot be shared with another configured
 * language, even when the path happens to be a perfectly valid folder.
 */
{
  const { app, created } = makeApp();

  const result = await createStandardLanguage(app, "Language 1", [
    {
      name: "Existing Language",
      dictionaryFolder: expected.lexicon,
      hoverEnabled: true,
      sheets: [],
    },
  ]);

  assert.equal(result.status, "blocked");
  assert.match(result.error, /already configured for "Existing Language"/);
  assert.deepEqual(created, []);
}

/*
 * Because source inventories are recursively scanned, ancestor/descendant
 * overlap is also a same-inventory authority collision.
 */
{
  const { app, created } = makeApp();

  const result = await createStandardLanguage(app, "Language 1", [
    {
      name: "Existing Language",
      dictionaryFolder: `${expected.lexicon}/Historical Dictionary`,
      hoverEnabled: true,
      sheets: [],
    },
  ]);

  assert.equal(result.status, "blocked");
  assert.match(result.error, /lexicon folder/);
  assert.deepEqual(created, []);
}

/*
 * A failure AFTER safe additive creation has begun does not authorize rollback
 * deletion. Successfully created folders stay in the vault.
 */
{
  const { app, objects } = makeApp();
  const ordinaryCreateFolder = app.vault.createFolder;

  app.vault.createFolder = async (path) => {
    if (path === expected.inflections) {
      throw new Error("simulated permission failure");
    }

    return ordinaryCreateFolder(path);
  };

  const result = await createStandardLanguage(app, "Language 1", []);

  assert.equal(result.status, "failed");
  assert.match(result.error, /simulated permission failure/);

  assert.ok(objects.get(expected.root) instanceof TFolder);
  assert.ok(objects.get(expected.lexicon) instanceof TFolder);
  assert.ok(objects.get(expected.morphemes) instanceof TFolder);
  assert.equal(objects.has(expected.inflections), false);
}

/*
 * The shared writer tolerates only the narrow concurrent-creation race where
 * createFolder() reports failure but the expected folder truly exists when it
 * immediately re-checks the vault.
 */
{
  const { app, objects } = makeApp();
  const ordinaryCreateFolder = app.vault.createFolder;
  let simulatedRace = false;

  app.vault.createFolder = async (path) => {
    if (!simulatedRace && path === expected.cyphers) {
      simulatedRace = true;
      objects.set(path, new TFolder(path));
      throw new Error("simulated concurrent folder creation");
    }

    return ordinaryCreateFolder(path);
  };

  const result = await createStandardLanguage(app, "Language 1", []);

  assert.equal(result.status, "created");
  assert.ok(objects.get(expected.cyphers) instanceof TFolder);
}

console.log("language creator security regression tests passed.");
