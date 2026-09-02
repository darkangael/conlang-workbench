import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// ---------------------------------------------------------------------------
// Atomic language-runtime candidate regression harness
//
// language-runtime.ts coordinates the detached preparation half of linguistic
// reload. The feature inventories already have focused tests for their own
// parsing and indexing behavior, so this harness substitutes small inventory
// doubles and concentrates on the cross-module transaction contract:
//
// - canonical Language Profiles are prepared before inventory loading;
// - their stable language IDs are supplied consistently to every inventory;
// - an empty active-language set returns complete empty candidate objects;
// - a failure in the final loader rejects the whole preparation rather than
//   returning a partially prepared runtime.
//
// The production coordinator has no reference to the plugin's live inventories.
// That separation is intentional: candidate preparation cannot progressively
// mutate settled runtime state because the only inventories it can reach are
// the detached instances constructed inside prepareLanguageRuntime().
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync(join(tmpdir(), "conlang-language-runtime-"));
const outfile = join(tempDir, "language-runtime.mjs");

const dictionaryStub = join(tempDir, "dictionary-stub.mjs");
const morphemeStub = join(tempDir, "morpheme-stub.mjs");
const exampleStub = join(tempDir, "example-stub.mjs");
const phonologyStub = join(tempDir, "phonology-stub.mjs");
const profileStub = join(tempDir, "profile-stub.mjs");

const sharedInventoryStub = (className, kind) => `
export class ${className} {
  constructor(app) {
    this.app = app;
    this.kind = ${JSON.stringify(kind)};
    this.loads = [];
  }

  async loadFromFolders(sources, membershipMode) {
    this.loads.push({ sources, membershipMode });

    if (this.app.failInventory === this.kind) {
      throw new Error("forced " + this.kind + " load failure");
    }

    return sources.length;
  }
}
`;

writeFileSync(
  dictionaryStub,
  `
export class Dictionary {
  constructor(app) {
    this.app = app;
    this.kind = "dictionary";
    this.caseSensitive = false;
    this.loads = [];
  }

  setCaseSensitive(value) {
    this.caseSensitive = value;
  }

  async loadFromFolders(sources, membershipMode) {
    this.loads.push({ sources, membershipMode });

    if (this.app.failInventory === this.kind) {
      throw new Error("forced dictionary load failure");
    }

    return sources.length;
  }
}
`,
);

writeFileSync(
  morphemeStub,
  sharedInventoryStub("MorphemeInventory", "morphemes"),
);

writeFileSync(
  exampleStub,
  sharedInventoryStub("LinguisticExampleInventory", "examples"),
);

writeFileSync(
  phonologyStub,
  sharedInventoryStub("PhonologyInventory", "phonology"),
);

writeFileSync(
  profileStub,
  `
export function loadLanguageProfile(app, config) {
  app.profileLoads.push(config.name);

  const id = app.profileIds.get(config.name);
  return id ? { id, name: config.name } : null;
}
`,
);

try {
  await build({
    entryPoints: ["language-runtime.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
    plugins: [
      {
        name: "language-runtime-test-stubs",
        setup(build) {
          const replacements = new Map([
            ["./dictionary", dictionaryStub],
            ["./morphemes", morphemeStub],
            ["./linguistic-examples", exampleStub],
            ["./phonology", phonologyStub],
            ["./language-profile", profileStub],
          ]);

          build.onResolve({ filter: /^obsidian$/ }, () => ({
            path: join(tempDir, "obsidian-empty.mjs"),
          }));

          build.onResolve({ filter: /^\.\// }, (args) => {
            const replacement = replacements.get(args.path);
            return replacement ? { path: replacement } : null;
          });
        },
      },
    ],
  });

  const { prepareLanguageRuntime } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const makeApp = () => ({
    profileLoads: [],
    profileIds: new Map([
      ["Mer", "mer-language"],
      ["Test Language", "test-language"],
    ]),
    failInventory: null,
  });

  const activeLanguages = [
    {
      name: "Mer",
      dictionaryFolder: "Languages/Mer/Lexicon",
      morphemeFolder: "Languages/Mer/Morphemes",
      exampleFolder: "Languages/Mer/Examples",
      phonologyFolder: "Languages/Mer/Phonology",
    },
    {
      name: "Test Language",
      dictionaryFolder: "Languages/Test Language/Lexicon",
      morphemeFolder: "Languages/Test Language/Morphemes",
      exampleFolder: "Languages/Test Language/Examples",
      phonologyFolder: "Languages/Test Language/Phonology",
    },
  ];

  // -------------------------------------------------------------------------
  // Complete candidate preparation
  // -------------------------------------------------------------------------
  const app = makeApp();

  const candidate = await prepareLanguageRuntime({
    app,
    activeLanguages,
    caseSensitiveMatching: true,
    languageMembership: "respect-explicit",
  });

  assert.deepEqual(
    app.profileLoads,
    ["Mer", "Test Language"],
    "profiles must be prepared for every active language",
  );

  assert.equal(candidate.profiles.get("Mer")?.id, "mer-language");
  assert.equal(
    candidate.profiles.get("Test Language")?.id,
    "test-language",
  );

  assert.equal(
    candidate.dictionary.caseSensitive,
    true,
    "case-sensitive indexing mode belongs to the detached dictionary candidate",
  );

  const expectedDictionarySources = [
    {
      folder: "Languages/Mer/Lexicon",
      language: "Mer",
      languageId: "mer-language",
    },
    {
      folder: "Languages/Test Language/Lexicon",
      language: "Test Language",
      languageId: "test-language",
    },
  ];

  assert.deepEqual(
    candidate.dictionary.loads[0],
    {
      sources: expectedDictionarySources,
      membershipMode: "respect-explicit",
    },
    "dictionary candidate must receive canonical profile identity",
  );

  for (const [inventory, folderKey] of [
    [candidate.morphemes, "morphemeFolder"],
    [candidate.linguisticExamples, "exampleFolder"],
    [candidate.phonology, "phonologyFolder"],
  ]) {
    assert.deepEqual(
      inventory.loads[0],
      {
        sources: activeLanguages.map((language) => ({
          folder: language[folderKey],
          language: language.name,
          languageId:
            language.name === "Mer" ? "mer-language" : "test-language",
        })),
        membershipMode: "respect-explicit",
      },
      `${inventory.kind} candidate must receive canonical profile identity`,
    );
  }

  assert.equal(
    candidate.dictionaryCount,
    2,
    "coordinator must preserve the dictionary loader's count",
  );

  // -------------------------------------------------------------------------
  // Empty active-language state
  // -------------------------------------------------------------------------
  const emptyApp = makeApp();

  const empty = await prepareLanguageRuntime({
    app: emptyApp,
    activeLanguages: [],
    caseSensitiveMatching: false,
    languageMembership: "folder",
  });

  assert.equal(empty.profiles.size, 0);
  assert.equal(empty.dictionary.loads.length, 0);
  assert.equal(empty.morphemes.loads.length, 0);
  assert.equal(empty.linguisticExamples.loads.length, 0);
  assert.equal(empty.phonology.loads.length, 0);
  assert.equal(empty.dictionaryCount, 0);
  assert.equal(empty.dictionary.caseSensitive, false);

  // -------------------------------------------------------------------------
  // Late preparation failure
  //
  // Phonology is deliberately last. Dictionary, morphemes, and examples have
  // already loaded into detached candidates when this error occurs. The
  // coordinator must reject instead of exposing that incomplete candidate as
  // though it were a complete replacement runtime.
  // -------------------------------------------------------------------------
  const failingApp = makeApp();
  failingApp.failInventory = "phonology";

  await assert.rejects(
    () =>
      prepareLanguageRuntime({
        app: failingApp,
        activeLanguages,
        caseSensitiveMatching: true,
        languageMembership: "respect-explicit",
      }),
    /forced phonology load failure/,
  );

  console.log("language runtime candidate regression tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
