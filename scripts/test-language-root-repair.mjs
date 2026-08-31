import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-root-repair-"));

try {
  const outputFile = join(tempDir, "language-root-repair.mjs");

  await build({
    entryPoints: ["language-root-repair.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  const { planLanguageRootRepair } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
  );

  function makeLanguage(overrides = {}) {
    return {
      name: "Test Language",
      rootFolder: "Languages/Old Name",
      dictionaryFolder: "Languages/Old Name/Lexicon",
      morphemeFolder: "Languages/Old Name/Morphemes",
      exampleFolder: "Languages/Old Name/Examples",
      phonologyFolder: "Languages/Old Name/Phonology",
      sheets: [],
      hoverEnabled: true,
      ...overrides,
    };
  }

  function makePathState({ folders = [], files = [] } = {}) {
    const folderSet = new Set(folders);
    const fileSet = new Set(files);

    return (path) => {
      if (folderSet.has(path)) {
        return "folder";
      }

      if (fileSet.has(path)) {
        return "other";
      }

      return "missing";
    };
  }

  const repairedRoot = "Languages/New Name";

  const expectedPaths = {
    root: repairedRoot,
    lexicon: `${repairedRoot}/Lexicon`,
    morphemes: `${repairedRoot}/Morphemes`,
    inflections: `${repairedRoot}/Inflections`,
    cyphers: `${repairedRoot}/Cyphers`,
    examples: `${repairedRoot}/Examples`,
    phonology: `${repairedRoot}/Phonology`,
  };

  /*
   * Successful repair operates inside a root this same configuration already
   * owns. Adopting some other existing root belongs to Import Language.
   */
  function makeRepairLanguage(overrides = {}) {
    return makeLanguage({
      rootFolder: repairedRoot,
      dictionaryFolder: expectedPaths.lexicon,
      morphemeFolder: expectedPaths.morphemes,
      exampleFolder: expectedPaths.examples,
      phonologyFolder: expectedPaths.phonology,
      ...overrides,
    });
  }

  /*
   * Existing direct standard folders are reused and missing standard folders
   * are identified for later additive creation.
   */
  {
    const language = makeRepairLanguage();

    const result = planLanguageRootRepair({
      language,
      languages: [language],
      rootFolder: repairedRoot,
      pathState: makePathState({
        folders: [repairedRoot, expectedPaths.lexicon, expectedPaths.examples],
      }),
    });

    assert.equal(result.status, "planned");
    assert.deepEqual(result.paths, expectedPaths);

    assert.deepEqual(result.foldersToReuse, [
      expectedPaths.lexicon,
      expectedPaths.examples,
    ]);

    assert.deepEqual(result.foldersToCreate, [
      expectedPaths.morphemes,
      expectedPaths.inflections,
      expectedPaths.cyphers,
      expectedPaths.phonology,
    ]);

    assert.deepEqual(result.configuration, {
      rootFolder: repairedRoot,
      dictionaryFolder: expectedPaths.lexicon,
      morphemeFolder: expectedPaths.morphemes,
      exampleFolder: expectedPaths.examples,
      phonologyFolder: expectedPaths.phonology,
    });

    /*
     * Planning itself is pure. Asking whether repair is safe must not mutate
     * even the configuration fields the later transaction would establish.
     */
    assert.equal(language.rootFolder, repairedRoot);
    assert.equal(language.dictionaryFolder, expectedPaths.lexicon);
  }

  /*
   * Repair is not a second language-creation mechanism. A configuration may
   * claim a root that disappeared from the vault, but Repair does not recreate
   * that missing language root.
   */
  {
    const language = makeRepairLanguage();

    const result = planLanguageRootRepair({
      language,
      languages: [language],
      rootFolder: repairedRoot,
      pathState: makePathState(),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "missing-root");
  }

  /*
   * A file occupying an expected direct canonical path blocks the complete
   * repair before any later mutation boundary may create folders.
   */
  {
    const language = makeRepairLanguage();

    const result = planLanguageRootRepair({
      language,
      languages: [language],
      rootFolder: repairedRoot,
      pathState: makePathState({
        folders: [repairedRoot, expectedPaths.lexicon],
        files: [expectedPaths.morphemes],
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "standard-path-not-folder");
    assert.match(result.detail, /Morphemes/);
  }

  /*
   * Nested lookalikes are creator data, not repair candidates. Only expected
   * direct children beneath the language root participate in repair.
   */
  {
    const language = makeRepairLanguage();
    const nestedLexicon = `${repairedRoot}/Old Material/Lexicon`;

    const result = planLanguageRootRepair({
      language,
      languages: [language],
      rootFolder: repairedRoot,
      pathState: makePathState({
        folders: [repairedRoot, nestedLexicon],
      }),
    });

    assert.equal(result.status, "planned");
    assert.ok(result.foldersToCreate.includes(expectedPaths.lexicon));
    assert.ok(!result.foldersToReuse.includes(nestedLexicon));
  }

  /*
   * Another configured language retains structural ownership regardless of
   * activation or whether its configured source currently loads.
   */
  {
    const language = makeLanguage();

    const malformedInactiveOwner = {
      name: "Inactive Existing Language",
      dictionaryFolder: `${repairedRoot}/Missing Lexicon`,
      sheets: [],
      hoverEnabled: true,
    };

    const result = planLanguageRootRepair({
      language,
      languages: [language, malformedInactiveOwner],
      rootFolder: repairedRoot,
      pathState: makePathState({
        folders: [repairedRoot],
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "root-conflict");
    assert.match(result.detail, /Inactive Existing Language/);
  }

  /*
   * An existing immediate child beneath Languages/ owns its subtree even when
   * Workbench has no configuration for it yet. Repair must not silently adopt
   * that root for another language; Import Language owns that authority.
   */
  {
    const language = makeLanguage();

    const result = planLanguageRootRepair({
      language,
      languages: [language],
      rootFolder: repairedRoot,
      pathState: makePathState({
        folders: [repairedRoot],
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "unconfigured-root");
    assert.match(result.detail, /Import Language/);
  }

  /*
   * Historical Made Up Words paths are not valid modern language roots even if
   * a folder happens to exist there.
   */
  {
    const language = makeLanguage();

    const result = planLanguageRootRepair({
      language,
      languages: [language],
      rootFolder: "Made Up Words/Example",
      pathState: () => "folder",
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-root");
  }

  /*
   * Creator-authored noncanonical direct children are preserved and ignored.
   * The planner asks only about the six standard direct canonical paths.
   */
  {
    const language = makeRepairLanguage();
    const observed = [];

    const state = makePathState({
      folders: [
        repairedRoot,
        `${repairedRoot}/Grammar`,
        `${repairedRoot}/Notes`,
      ],
    });

    const result = planLanguageRootRepair({
      language,
      languages: [language],
      rootFolder: repairedRoot,
      pathState(path) {
        observed.push(path);
        return state(path);
      },
    });

    assert.equal(result.status, "planned");
    assert.ok(!observed.includes(`${repairedRoot}/Grammar`));
    assert.ok(!observed.includes(`${repairedRoot}/Notes`));
  }

  console.log("language root repair planner regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
