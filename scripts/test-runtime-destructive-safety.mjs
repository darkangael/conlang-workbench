import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

/*
 * Data Safety §20 runtime destructive-test harness.
 *
 * This regression deliberately does NOT use the repository's persistent
 * test-vault. Every creator-visible file and folder exercised below lives
 * beneath a fresh operating-system temporary directory that is removed in
 * finally.
 *
 * The test complements the deeper in-memory authority regressions. Those tests
 * are better for exact race/rollback state machines; this test supplies the
 * missing physical evidence that the production writer boundaries preserve
 * real files and real directory structure when operations collide or fail.
 */
const tempDir = await mkdtemp(
  join(tmpdir(), "conlang-runtime-destructive-safety-"),
);
const vaultRoot = join(tempDir, "vault");
const bundlePath = join(tempDir, "runtime-destructive-bundle.mjs");

/*
 * Production uses instanceof TFile/TFolder at mutation-authority boundaries.
 * Bundle the production modules and these Obsidian test doubles together so
 * the filesystem-backed objects below use the exact constructors production
 * checks.
 */
const obsidianMockPlugin = {
  name: "obsidian-runtime-destructive-test",

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
              const pieces = path.split("/");
              const filename = pieces[pieces.length - 1];
              this.basename = filename.replace(/\\.md$/, "");
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

try {
  await mkdir(vaultRoot, { recursive: true });

  await build({
    stdin: {
      contents: `
        export {
          writeDictionaryEntry,
        } from "./dictionary-entry-writer";

        export {
          createStandardLanguage,
        } from "./language-creator";

        export {
          ensureVaultFolderStrict,
        } from "./vault-folder-writer";

        export {
          planLanguageRootRepair,
        } from "./language-root-repair";

        export {
          applyLanguageRootRepairState,
        } from "./language-root-repair-state";

        export {
          establishLanguageRootForRecreation,
        } from "./language-root-recreation-writer";

        export { TFile, TFolder } from "obsidian";
      `,
      resolveDir: process.cwd(),
      loader: "js",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundlePath,
    logLevel: "silent",
    plugins: [obsidianMockPlugin],
  });

  const {
    writeDictionaryEntry,
    createStandardLanguage,
    ensureVaultFolderStrict,
    planLanguageRootRepair,
    applyLanguageRootRepairState,
    establishLanguageRootForRecreation,
    TFile,
    TFolder,
  } = await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`);

  /*
   * Convert a vault-relative path into this test's disposable physical vault.
   * Production owns path validation; this helper only maps already-selected
   * test paths into the temporary directory.
   */
  function physicalPath(vaultPath) {
    return join(vaultRoot, ...vaultPath.split("/"));
  }

  function pathState(vaultPath) {
    const absolute = physicalPath(vaultPath);

    if (!existsSync(absolute)) {
      return "missing";
    }

    return statSync(absolute).isDirectory() ? "folder" : "other";
  }

  async function writeVaultFile(vaultPath, content) {
    const absolute = physicalPath(vaultPath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }

  async function hashVaultFile(vaultPath) {
    const bytes = await readFile(physicalPath(vaultPath));
    return createHash("sha256").update(bytes).digest("hex");
  }

  /*
   * The metadata-cache map is intentionally independent of filesystem bytes.
   * Obsidian's metadata cache is likewise a derived runtime service rather than
   * the persistent source itself.
   *
   * Leaving a file absent from this map simulates malformed/unusable
   * frontmatter while preserving the exact physical bytes for comparison.
   */
  const frontmatter = new Map();
  const createFolderCalls = [];
  let failFolderPath = null;

  const app = {
    vault: {
      getAbstractFileByPath(vaultPath) {
        const absolute = physicalPath(vaultPath);

        if (!existsSync(absolute)) {
          return null;
        }

        return statSync(absolute).isDirectory()
          ? new TFolder(vaultPath)
          : new TFile(vaultPath);
      },

      async createFolder(vaultPath) {
        createFolderCalls.push(vaultPath);

        if (vaultPath === failFolderPath) {
          throw new Error(
            `simulated physical createFolder failure at ${vaultPath}`,
          );
        }

        await mkdir(physicalPath(vaultPath));
      },

      async create(vaultPath, content) {
        const absolute = physicalPath(vaultPath);

        /*
         * "wx" is the filesystem equivalent of the create-only contract relied
         * on by Workbench's dictionary writer: an existing creator file cannot
         * be silently truncated or replaced.
         */
        await writeFile(absolute, content, { flag: "wx" });
        return new TFile(vaultPath);
      },
    },

    metadataCache: {
      getFileCache(file) {
        if (!frontmatter.has(file.path)) {
          return null;
        }

        return {
          frontmatter: frontmatter.get(file.path),
        };
      },
    },
  };

  await mkdir(physicalPath("Languages"));

  // -----------------------------------------------------------------------
  // Single-Note Mutation / Existing Destination / Malformed Notes
  // -----------------------------------------------------------------------

  const dictionaryRoot = "Languages/Dictionary Test";
  const dictionaryFolder = `${dictionaryRoot}/Lexicon`;
  const malformedPath = `${dictionaryFolder}/kala.md`;

  await mkdir(physicalPath(dictionaryRoot));
  await mkdir(physicalPath(dictionaryFolder));

  const malformedBytes = [
    "---",
    "document_type: dictionary",
    "word: kala",
    "definition: [unterminated",
    "---",
    "",
    "CREATOR SENTINEL: preserve these exact bytes.",
    "",
  ].join("\n");

  await writeVaultFile(malformedPath, malformedBytes);

  const malformedHashBefore = await hashVaultFile(malformedPath);

  const malformedResult = await writeDictionaryEntry({
    app,
    form: "kala",
    definition: "stone",
    partOfSpeech: "noun",
    dictionaryFolder,
    includePortableIds: false,
    buildContent: () => "definition: stone",
  });

  assert.equal(
    malformedResult.status,
    "blocked",
    "unusable existing source authority must block lexical creation",
  );
  assert.equal(
    await hashVaultFile(malformedPath),
    malformedHashBefore,
    "blocked lexical creation must preserve malformed note bytes exactly",
  );

  /*
   * A normal fresh creation exercises the physical create-only boundary.
   */
  const riverContent = [
    "---",
    "definition: watercourse",
    "---",
    "",
    "Fresh runtime-destructive-test entry.",
    "",
  ].join("\n");

  const createdRiver = await writeDictionaryEntry({
    app,
    form: "river",
    definition: "watercourse",
    partOfSpeech: "noun",
    dictionaryFolder,
    includePortableIds: false,
    buildContent: () => riverContent,
  });

  assert.equal(createdRiver.status, "created");
  assert.equal(
    readFileSync(physicalPath(createdRiver.path), "utf8"),
    riverContent,
  );

  /*
   * Simulate Obsidian's metadata cache having indexed the newly-created source,
   * then repeat the SAME semantic creation request.
   *
   * Repetition is expected to reuse the established entry, not overwrite it or
   * allocate a homograph.
   */
  frontmatter.set(createdRiver.path, {
    definition: "watercourse",
  });

  const riverHashBeforeRepeat = await hashVaultFile(createdRiver.path);

  const repeatedRiver = await writeDictionaryEntry({
    app,
    form: "river",
    definition: "watercourse",
    partOfSpeech: "noun",
    dictionaryFolder,
    includePortableIds: false,
    buildContent: () => {
      throw new Error(
        "buildContent must not run when an equivalent source already exists",
      );
    },
  });

  assert.equal(repeatedRiver.status, "existing");
  assert.equal(
    await hashVaultFile(createdRiver.path),
    riverHashBeforeRepeat,
    "repeated equivalent lexical creation must not rewrite the note",
  );

  const dictionaryNames = await readdir(physicalPath(dictionaryFolder));
  assert.deepEqual(
    dictionaryNames.filter((name) => name.startsWith("river")).sort(),
    ["river.md"],
    "repeated equivalent creation must not manufacture a homograph",
  );

  // -----------------------------------------------------------------------
  // Interrupted Operations / Large Scope
  // -----------------------------------------------------------------------

  const interruptionSentinel = "Languages/add-language-sentinel.md";
  const interruptionSentinelBytes =
    "CREATOR SENTINEL: unrelated Add Language data must survive.\n";

  await writeVaultFile(interruptionSentinel, interruptionSentinelBytes);
  const interruptionSentinelHashBefore =
    await hashVaultFile(interruptionSentinel);

  const interruptedRoot = "Languages/Interrupted Language";
  const interruptedInflections = `${interruptedRoot}/Inflections`;

  failFolderPath = interruptedInflections;

  const interruptedCreation = await createStandardLanguage(
    app,
    "Interrupted Language",
    [],
    false,
  );

  failFolderPath = null;

  assert.equal(interruptedCreation.status, "failed");
  assert.ok(statSync(physicalPath(interruptedRoot)).isDirectory());
  assert.ok(statSync(physicalPath(`${interruptedRoot}/Lexicon`)).isDirectory());
  assert.ok(
    statSync(physicalPath(`${interruptedRoot}/Morphemes`)).isDirectory(),
  );

  for (const missing of ["Inflections", "Cyphers", "Examples", "Phonology"]) {
    assert.equal(
      existsSync(physicalPath(`${interruptedRoot}/${missing}`)),
      false,
      `${missing} must not appear after the injected earlier failure`,
    );
  }

  assert.equal(
    await hashVaultFile(interruptionSentinel),
    interruptionSentinelHashBefore,
    "partial additive language creation must not rewrite unrelated creator data",
  );

  // -----------------------------------------------------------------------
  // Recovery / Repetition: explicit Repair of an already-owned root
  // -----------------------------------------------------------------------

  const repairRoot = "Languages/Repair Language";
  const repairLexicon = `${repairRoot}/Lexicon`;
  const repairSentinel = `${repairRoot}/Notes/creator-note.md`;
  const repairSentinelBytes =
    "CREATOR SENTINEL: repair must preserve noncanonical material.\n";

  await mkdir(physicalPath(repairRoot));
  await mkdir(physicalPath(repairLexicon));
  await writeVaultFile(repairSentinel, repairSentinelBytes);

  const repairSentinelHashBefore = await hashVaultFile(repairSentinel);

  const repairLanguage = {
    name: "Repair Language",
    rootFolder: repairRoot,
    dictionaryFolder: repairLexicon,
    morphemeFolder: `${repairRoot}/Morphemes`,
    exampleFolder: `${repairRoot}/Examples`,
    phonologyFolder: `${repairRoot}/Phonology`,
    sheets: [],
    hoverEnabled: true,
  };

  const makeRepairPlan = () =>
    planLanguageRootRepair({
      language: repairLanguage,
      languages: [repairLanguage],
      rootFolder: repairRoot,
      pathState,
    });

  const applyRepair = () =>
    applyLanguageRootRepairState({
      language: repairLanguage,
      activeLanguages: [],
      plan: makeRepairPlan,
      createMissingFolders: async (plan) => {
        for (const folder of plan.foldersToCreate) {
          await ensureVaultFolderStrict(app, folder);
        }
      },
      save: async () => {},
      reload: async () => {
        throw new Error("inactive repair must not reload");
      },
    });

  const firstRepair = await applyRepair();

  assert.deepEqual(firstRepair, {
    status: "applied",
    foldersEstablished: true,
  });

  for (const child of [
    "Lexicon",
    "Morphemes",
    "Inflections",
    "Cyphers",
    "Examples",
    "Phonology",
  ]) {
    assert.ok(
      statSync(physicalPath(`${repairRoot}/${child}`)).isDirectory(),
      `repair should establish canonical child ${child}`,
    );
  }

  assert.equal(
    await hashVaultFile(repairSentinel),
    repairSentinelHashBefore,
    "repair must preserve unrelated creator-authored bytes",
  );

  /*
   * A second repair observes the now-complete structure and performs no folder
   * creation. This is the idempotent recovery behavior expected by §20.
   */
  const createCallsBeforeRepeatRepair = createFolderCalls.length;
  const secondRepair = await applyRepair();

  assert.deepEqual(secondRepair, {
    status: "applied",
    foldersEstablished: true,
  });
  assert.equal(
    createFolderCalls.length,
    createCallsBeforeRepeatRepair,
    "repeating a complete Repair must not create additional structure",
  );
  assert.equal(await hashVaultFile(repairSentinel), repairSentinelHashBefore);

  // -----------------------------------------------------------------------
  // Recovery boundary: Recreate must preserve collisions and stay narrow
  // -----------------------------------------------------------------------

  const recreateCollisionRoot = "Languages/Recreate Collision";
  const recreateCollisionBytes =
    "CREATOR SENTINEL: exact root collision must survive.\n";

  await writeVaultFile(recreateCollisionRoot, recreateCollisionBytes);
  const recreateCollisionHashBefore = await hashVaultFile(
    recreateCollisionRoot,
  );

  const collisionResult = await establishLanguageRootForRecreation(
    app,
    recreateCollisionRoot,
  );

  assert.equal(collisionResult.status, "blocked");
  assert.equal(collisionResult.reason, "root-not-folder");
  assert.equal(
    await hashVaultFile(recreateCollisionRoot),
    recreateCollisionHashBefore,
    "Recreate must not replace a non-folder at the configured root",
  );

  const recreatedRoot = "Languages/Recreated Language";

  const recreationResult = await establishLanguageRootForRecreation(
    app,
    recreatedRoot,
  );

  assert.deepEqual(recreationResult, { status: "established" });
  assert.ok(statSync(physicalPath(recreatedRoot)).isDirectory());

  /*
   * Recreate is intentionally not idempotent-as-success: once the root exists,
   * repeating the stronger ownership-boundary operation must stop and route the
   * creator toward Repair instead of silently adopting current structure.
   */
  const repeatedRecreation = await establishLanguageRootForRecreation(
    app,
    recreatedRoot,
  );

  assert.equal(repeatedRecreation.status, "blocked");
  assert.equal(repeatedRecreation.reason, "root-now-folder");
  assert.ok(statSync(physicalPath(recreatedRoot)).isDirectory());

  console.log(
    "runtime destructive safety regression tests passed on disposable filesystem",
  );
} finally {
  /*
   * Cleanup is outside the disposable vault's modeled Workbench authority.
   * This removes only the mkdtemp() directory created by this test process.
   */
  await rm(tempDir, { recursive: true, force: true });
}
