import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// ---------------------------------------------------------------------------
// Morpheme language-scope regression harness
//
// MorphemeInventory normally scans Obsidian folders and relies on TFile /
// TFolder instanceof checks. These small classes model only that host boundary
// while the bundled inventory and morpheme parser remain the real production
// TypeScript.
//
// These tests focus on contextual language authority after source recognition:
// accepted legacy sources enter the clean inventory, while recognized usable
// sources rejected by language authority remain available for diagnostics
// without entering feature indexes.
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync(join(tmpdir(), "conlang-morpheme-language-"));
const obsidianStub = join(tempDir, "obsidian-stub.mjs");
const outfile = join(tempDir, "morphemes.mjs");

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
        export { MorphemeInventory } from "./morphemes.ts";
        export { TFile, TFolder } from "obsidian";
      `,
      resolveDir: process.cwd(),
      sourcefile: "morpheme-language-scope-entry.mjs",
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

  const { MorphemeInventory, TFile, TFolder } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const acceptedPath = "Languages/Mer/Morphemes/plural.md";
  const readableMismatchPath =
    "Languages/Mer/Morphemes/readable-mismatch.md";
  const idMismatchPath = "Languages/Mer/Morphemes/id-mismatch.md";
  const malformedPath = "Languages/Mer/Morphemes/malformed.md";
  const supportingPath = "Languages/Mer/Morphemes/notes.md";

  const files = [
    new TFile(acceptedPath),
    new TFile(readableMismatchPath),
    new TFile(idMismatchPath),
    new TFile(malformedPath),
    new TFile(supportingPath),
  ];

  const folderPath = "Languages/Mer/Morphemes";
  const folder = new TFolder(folderPath, files);

  const frontmatter = new Map([
    [
      acceptedPath,
      {
        type: "morpheme",
        morpheme_id: "plural",
        form: "-i",
        gloss: "plural",
      },
    ],
    [
      readableMismatchPath,
      {
        type: "morpheme",
        morpheme_id: "readable-mismatch",
        form: "-x",
        gloss: "test readable mismatch",
        language: "Test Language",
      },
    ],
    [
      idMismatchPath,
      {
        type: "morpheme",
        morpheme_id: "id-mismatch",
        form: "-y",
        gloss: "test stable identity mismatch",
        language: "Mer",
        language_id: "test-language",
      },
    ],
    [
      malformedPath,
      {
        type: "morpheme",
        morpheme_id: "malformed",
        form: "-z",
        gloss: { malformed: "structure" },
      },
    ],
    [
      supportingPath,
      {
        title: "Morpheme documentation notes",
      },
    ],
  ]);

  const app = {
    vault: {
      getAbstractFileByPath(path) {
        return path === folderPath ? folder : null;
      },
    },

    metadataCache: {
      getFileCache(file) {
        const fm = frontmatter.get(file.path);
        return fm ? { frontmatter: fm } : null;
      },
    },
  };

  const inventory = new MorphemeInventory(app);

  const loaded = await inventory.loadFromFolders(
    [
      {
        folder: folderPath,
        language: "Mer",
        languageId: "mer-language",
      },
    ],
    "respect-explicit",
  );

  // Only the accepted legacy morpheme belongs in the clean feature inventory.
  assert.equal(loaded, 1);
  assert.equal(inventory.allMorphemes().length, 1);

  const accepted = inventory.lookupId(
    "plural",
    "mer-language",
    "Mer",
  );

  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].language, "Mer");
  assert.equal(
    accepted[0].languageId,
    "mer-language",
    "a legacy morpheme may inherit canonical language identity in runtime",
  );

  // Readable-name rejection remains a successfully parsed source record.
  assert.equal(inventory.lookupId("readable-mismatch").length, 0);

  const readableMismatch = inventory
    .allSourceRecords()
    .find((record) => record.path === readableMismatchPath);

  assert.ok(
    readableMismatch,
    "recognized readable-language mismatch must remain retained",
  );
  assert.notEqual(
    readableMismatch.value,
    null,
    "contextual rejection must not turn a successfully parsed morpheme into malformed data",
  );
  assert.ok(
    readableMismatch.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "language.membership-mismatch" &&
        diagnostic.severity === "warning" &&
        diagnostic.field === "language",
    ),
    "retained source should explain its readable-language rejection",
  );

  // Stable language identity is independently authoritative and also retains
  // the recognized source while excluding it from the clean ID index.
  assert.equal(inventory.lookupId("id-mismatch").length, 0);

  const idMismatch = inventory
    .allSourceRecords()
    .find((record) => record.path === idMismatchPath);

  assert.ok(
    idMismatch,
    "recognized stable-ID mismatch must remain retained",
  );
  assert.notEqual(
    idMismatch.value,
    null,
    "stable-ID rejection must preserve the successfully parsed morpheme value",
  );
  assert.ok(
    idMismatch.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "language.id-mismatch" &&
        diagnostic.severity === "warning" &&
        diagnostic.field === "language_id",
    ),
    "retained source should explain its stable language-ID rejection",
  );

  // Existing malformed-source behavior remains intact: positive morpheme
  // recognition retains the source even though no clean Morpheme can be made.
  const malformed = inventory
    .allSourceRecords()
    .find((record) => record.path === malformedPath);

  assert.ok(malformed);
  assert.equal(malformed.value, null);
  assert.ok(
    malformed.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "morpheme.missing-gloss" &&
        diagnostic.severity === "error",
    ),
  );

  // The supporting Markdown note was never positively recognized as a
  // morpheme, so the inventory must not manufacture a diagnostic record for it.
  assert.equal(
    inventory
      .allSourceRecords()
      .some((record) => record.path === supportingPath),
    false,
  );

  // We expect one accepted source, two contextual rejects, and one malformed
  // recognized source. The unrelated supporting note is outside authority.
  assert.equal(inventory.allSourceRecords().length, 4);

  console.log("Morpheme language-scope regression tests passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
