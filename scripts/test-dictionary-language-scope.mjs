import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// ---------------------------------------------------------------------------
// Dictionary language-scope regression harness
//
// Dictionary normally runs inside Obsidian and uses TFile/TFolder instanceof
// checks while scanning a configured Lexicon root. These tiny classes model
// only that boundary. The Dictionary implementation itself remains the real
// production TypeScript bundled below.
//
// Exercising loadFromFolders() matters here: it proves that a lexical note
// without creator-authored `language:` metadata receives its configured
// Lexicon language at runtime and can then participate in strict scoping.
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync(join(tmpdir(), "conlang-dictionary-language-"));
const obsidianStub = join(tempDir, "obsidian-stub.mjs");
const outfile = join(tempDir, "dictionary.mjs");

writeFileSync(
  obsidianStub,
  `
export class TFile {
  constructor(path) {
    this.path = path;
    const filename = path.split("/").pop();
    this.basename = filename.endsWith(".md")
      ? filename.slice(0, -3)
      : filename;
    this.extension = "md";
    this.stat = { mtime: 1 };
  }
}

export class TFolder {
  constructor(path, children = []) {
    this.path = path;
    this.children = children;
  }
}

export class App {}
`,
);

try {
  await build({
    stdin: {
      contents: `
        export { Dictionary } from "./dictionary.ts";
        export { TFile, TFolder } from "obsidian";
      `,
      resolveDir: process.cwd(),
      sourcefile: "dictionary-language-scope-entry.mjs",
      loader: "js",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
    plugins: [
      {
        name: "obsidian-test-stub",
        setup(build) {
          build.onResolve({ filter: /^obsidian$/ }, () => ({
            path: obsidianStub,
          }));
        },
      },
    ],
  });

  const { Dictionary, TFile, TFolder } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  // Build two configured lexicons with deliberately colliding vocabulary.
  // None of these notes declares `language:` unless a test specifically needs
  // to exercise explicit source metadata.
  const merFiles = [
    new TFile("Languages/Mer/Lexicon/shared.md"),
    new TFile("Languages/Mer/Lexicon/river way.md"),
    new TFile("Languages/Mer/Lexicon/sense-word.md"),
    new TFile("Languages/Mer/Lexicon/ambiguous-a.md"),
    new TFile("Languages/Mer/Lexicon/ambiguous-b.md"),
    new TFile("Languages/Mer/Lexicon/conflicting-language-id.md"),
  ];

  const testFiles = [
    new TFile("Languages/Test Language/Lexicon/shared.md"),
    new TFile("Languages/Test Language/Lexicon/river way.md"),
    new TFile("Languages/Test Language/Lexicon/sense-word.md"),
  ];

  // This third source deliberately has no configured language. Its entry has
  // no effective language and therefore must never leak into a strict scope.
  const unscopedFiles = [new TFile("Languages/Unscoped/Lexicon/orphan.md")];

  const folders = new Map([
    ["Languages/Mer/Lexicon", new TFolder("Languages/Mer/Lexicon", merFiles)],
    [
      "Languages/Test Language/Lexicon",
      new TFolder("Languages/Test Language/Lexicon", testFiles),
    ],
    [
      "Languages/Unscoped/Lexicon",
      new TFolder("Languages/Unscoped/Lexicon", unscopedFiles),
    ],
  ]);

  const frontmatter = new Map([
    [
      "Languages/Mer/Lexicon/shared.md",
      {
        definition: "shared meaning",
        aliases: ["shared alias"],
        forms: ["plural: shared-form"],
      },
    ],
    [
      "Languages/Test Language/Lexicon/shared.md",
      {
        definition: "shared meaning",
        aliases: ["shared alias"],
        forms: ["plural: shared-form"],
      },
    ],
    [
      "Languages/Mer/Lexicon/river way.md",
      {
        definition: "river route",
      },
    ],
    [
      "Languages/Test Language/Lexicon/river way.md",
      {
        definition: "river route",
      },
    ],
    [
      "Languages/Mer/Lexicon/sense-word.md",
      {
        definition: "ordinary mer definition",
      },
    ],
    [
      "Languages/Test Language/Lexicon/sense-word.md",
      {
        definition: "ordinary test definition",
      },
    ],
    [
      "Languages/Mer/Lexicon/ambiguous-a.md",
      {
        definition: "same-language ambiguity",
      },
    ],
    [
      "Languages/Mer/Lexicon/ambiguous-b.md",
      {
        definition: "same-language ambiguity",
      },
    ],
    [
      "Languages/Mer/Lexicon/conflicting-language-id.md",
      {
        definition: "must not load under Mer",
        language: "Mer",
        language_id: "test-language",
      },
    ],
    [
      "Languages/Unscoped/Lexicon/orphan.md",
      {
        definition: "orphan meaning",
      },
    ],
  ]);

  const bodies = new Map([
    [
      "Languages/Mer/Lexicon/sense-word.md",
      `---
definition: ordinary mer definition
---

# sense-word

## Senses

### Sense 1

**ID:** current
**Gloss:** flowing water
**Lookup:** stream
`,
    ],
    [
      "Languages/Test Language/Lexicon/sense-word.md",
      `---
definition: ordinary test definition
---

# sense-word

## Senses

### Sense 1

**ID:** current
**Gloss:** flowing water
**Lookup:** stream
`,
    ],
  ]);

  const app = {
    vault: {
      getAbstractFileByPath(path) {
        return folders.get(path) ?? null;
      },

      async cachedRead(file) {
        return bodies.get(file.path) ?? "";
      },
    },

    metadataCache: {
      getFileCache(file) {
        const fm = frontmatter.get(file.path);
        return fm ? { frontmatter: fm } : null;
      },
    },
  };

  const dictionary = new Dictionary(app);

  const loaded = await dictionary.loadFromFolders([
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
    { folder: "Languages/Unscoped/Lexicon" },
  ]);

  assert.equal(
    loaded,
    9,
    "an explicit conflicting language_id must not enter the configured language",
  );
  assert.equal(
    dictionary.lookup("conflicting-language-id"),
    undefined,
    "stable parent-language identity mismatch must fail closed",
  );

  // Rejection from the clean Dictionary must not erase a source that Workbench
  // positively recognized as lexical data. Keep the parsed source available
  // with a contextual warning so the creator can diagnose the mismatch later.
  const conflictingSource = dictionary
    .allSourceRecords()
    .find(
      (record) =>
        record.path === "Languages/Mer/Lexicon/conflicting-language-id.md",
    );

  assert.ok(
    conflictingSource,
    "a recognized source rejected by language authority must remain retained",
  );
  assert.notEqual(
    conflictingSource.value,
    null,
    "contextual rejection must not pretend a successfully parsed source is malformed",
  );
  assert.ok(
    conflictingSource.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "language.id-mismatch" &&
        diagnostic.severity === "warning" &&
        diagnostic.field === "language_id",
    ),
    "the retained source should explain the stable language-ID rejection",
  );

  // -------------------------------------------------------------------------
  // Runtime language assignment
  // -------------------------------------------------------------------------

  const merShared = dictionary.lookup("shared", "Mer");
  const testShared = dictionary.lookup("shared", "Test Language");

  assert.ok(merShared);
  assert.ok(testShared);
  assert.equal(merShared.language, "Mer");
  assert.equal(testShared.language, "Test Language");
  assert.equal(
    merShared.languageId,
    "mer-language",
    "legacy lexical notes may inherit canonical language identity in runtime",
  );
  assert.equal(
    testShared.languageId,
    "test-language",
    "configured language identity should scope the runtime lexical object",
  );

  // The source notes did not declare `language:`. These assertions therefore
  // prove that configured Lexicon membership established effective runtime
  // language without requiring creator metadata to be rewritten.
  assert.equal(
    dictionary.lookupAll("shared").length,
    2,
    "unscoped lookup should preserve both loaded languages",
  );
  assert.deepEqual(
    dictionary.lookupAll("shared", "Mer").map((entry) => entry.language),
    ["Mer"],
  );
  assert.deepEqual(
    dictionary
      .lookupAll("shared", "Test Language")
      .map((entry) => entry.language),
    ["Test Language"],
  );

  // -------------------------------------------------------------------------
  // Alias and declared-form scope
  // -------------------------------------------------------------------------

  assert.equal(dictionary.lookupAll("shared alias").length, 2);
  assert.deepEqual(
    dictionary.lookupAll("shared alias", "Mer").map((entry) => entry.language),
    ["Mer"],
  );

  assert.equal(dictionary.lookupForm("shared-form").length, 2);
  assert.deepEqual(
    dictionary
      .lookupForm("shared-form", "Test Language")
      .map((match) => match.lemma.language),
    ["Test Language"],
  );

  // -------------------------------------------------------------------------
  // English lookup scope
  // -------------------------------------------------------------------------

  assert.equal(dictionary.lookupEnglish("shared meaning").length, 2);
  assert.deepEqual(
    dictionary
      .lookupEnglish("shared meaning", "Mer")
      .map((entry) => entry.language),
    ["Mer"],
  );
  assert.deepEqual(
    dictionary
      .lookupEnglishMatches("shared meaning", "Test Language")
      .map((match) => match.entry.language),
    ["Test Language"],
  );

  // Structured sense keys are indexed only after body metadata has loaded.
  // They must obey the same language boundary as simple definitions.
  assert.equal(dictionary.lookupEnglishMatches("stream").length, 2);
  assert.deepEqual(
    dictionary
      .lookupEnglishMatches("stream", "Mer")
      .map((match) => match.entry.language),
    ["Mer"],
  );

  // -------------------------------------------------------------------------
  // Phrase-index scope
  // -------------------------------------------------------------------------

  const globalPhraseIndex = dictionary.phraseIndex();
  const merPhraseIndex = dictionary.phraseIndex("Mer");
  const testPhraseIndex = dictionary.phraseIndex("Test Language");

  // Each language contributes two phrase-index entries:
  //
  // - "river way", the ordinary multi-word lexical headword
  // - "shared alias", the synthetic phrase created from the multi-word alias
  //
  // The totals therefore also verify that language scoping preserves
  // synthetic phrase entries instead of accidentally dropping them.
  assert.equal(globalPhraseIndex.size, 4);
  assert.equal(merPhraseIndex.size, 2);
  assert.equal(testPhraseIndex.size, 2);

  const merRiverBucket = merPhraseIndex.byFirstWord.get("river");
  const testRiverBucket = testPhraseIndex.byFirstWord.get("river");

  assert.equal(merRiverBucket?.length, 1);
  assert.equal(testRiverBucket?.length, 1);
  assert.equal(merRiverBucket?.[0].entry.language, "Mer");
  assert.equal(testRiverBucket?.[0].entry.language, "Test Language");

  // -------------------------------------------------------------------------
  // Unknown language fails closed under an authoritative scope
  // -------------------------------------------------------------------------

  const orphan = dictionary.lookup("orphan");
  assert.ok(orphan);
  assert.equal(orphan.language, undefined);

  assert.equal(
    dictionary.lookup("orphan", "Mer"),
    undefined,
    "an entry with unknown language must not enter a strict Mer scope",
  );
  assert.deepEqual(dictionary.lookupEnglish("orphan meaning", "Mer"), []);

  // -------------------------------------------------------------------------
  // Scoping filters languages; it does NOT erase genuine ambiguity
  // -------------------------------------------------------------------------

  assert.equal(
    dictionary.lookupEnglish("same-language ambiguity", "Mer").length,
    2,
    "two distinct Mer entries must remain ambiguous inside the Mer scope",
  );

  console.log("Dictionary language-scope regression tests passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
