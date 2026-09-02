import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// ---------------------------------------------------------------------------
// Linguistic Example language-scope regression harness
//
// LinguisticExampleInventory normally scans Obsidian TFolder/TFile objects.
// These small stubs model only that host boundary. The bundled inventory,
// parser, and shared language-authority resolver remain production TypeScript.
//
// The regression protects the DS-005-H1 invariant:
// once Workbench positively recognizes a source, contextual language rejection
// may exclude it from the clean example collection but must not make the source
// disappear from diagnostic accounting.
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync(
  join(tmpdir(), "conlang-linguistic-example-language-"),
);
const obsidianStub = join(tempDir, "obsidian-stub.mjs");
const outfile = join(tempDir, "linguistic-examples.mjs");

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
        export { LinguisticExampleInventory } from "./linguistic-examples.ts";
        export { TFile, TFolder } from "obsidian";
      `,
      resolveDir: process.cwd(),
      sourcefile: "linguistic-example-language-scope-entry.mjs",
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

  const { LinguisticExampleInventory, TFile, TFolder } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const folderPath = "Languages/Mer/Examples";

  const acceptedPath = `${folderPath}/accepted.md`;
  const readableMismatchPath = `${folderPath}/readable-mismatch.md`;
  const idMismatchPath = `${folderPath}/id-mismatch.md`;
  const malformedPath = `${folderPath}/malformed.md`;
  const supportingPath = `${folderPath}/notes.md`;

  const files = [
    new TFile(acceptedPath),
    new TFile(readableMismatchPath),
    new TFile(idMismatchPath),
    new TFile(malformedPath),
    new TFile(supportingPath),
  ];

  const folder = new TFolder(folderPath, files);

  const frontmatter = new Map([
    [
      acceptedPath,
      {
        type: "linguistic-example",
        example_id: "accepted",
        text: "Mi varu.",
        translation: "I flow.",
      },
    ],
    [
      readableMismatchPath,
      {
        type: "linguistic-example",
        example_id: "readable-mismatch",
        text: "Example from another configured language.",
        language: "Test Language",
      },
    ],
    [
      idMismatchPath,
      {
        type: "linguistic-example",
        example_id: "id-mismatch",
        text: "Example with conflicting stable language identity.",
        language: "Mer",
        language_id: "test-language",
      },
    ],
    [
      malformedPath,
      {
        type: "linguistic-example",
        example_id: "malformed",
        text: { malformed: "structure" },
      },
    ],
    [
      supportingPath,
      {
        title: "Example notes",
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

  const inventory = new LinguisticExampleInventory(app);

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

  // Only the accepted example belongs in the clean feature collection.
  assert.equal(loaded, 1);
  assert.equal(inventory.allExamples().length, 1);

  const accepted = inventory.allExamples()[0];

  assert.equal(accepted.id, "accepted");
  assert.equal(accepted.language, "Mer");
  assert.equal(
    accepted.languageId,
    "mer-language",
    "legacy examples may inherit canonical language identity in runtime",
  );

  // -------------------------------------------------------------------------
  // Readable-language mismatch: retain parsed source, exclude clean example.
  // -------------------------------------------------------------------------
  assert.equal(
    inventory.allExamples().some(
      (example) => example.id === "readable-mismatch",
    ),
    false,
  );

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
    "contextual rejection must preserve the successfully parsed example",
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

  // -------------------------------------------------------------------------
  // Stable language-ID mismatch: same retained-source behavior.
  // -------------------------------------------------------------------------
  assert.equal(
    inventory.allExamples().some(
      (example) => example.id === "id-mismatch",
    ),
    false,
  );

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
    "stable-ID rejection must preserve the successfully parsed example",
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

  // Existing malformed recognized-source behavior remains unchanged.
  const malformed = inventory
    .allSourceRecords()
    .find((record) => record.path === malformedPath);

  assert.ok(malformed);
  assert.equal(malformed.value, null);
  assert.ok(
    malformed.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "linguistic-example.unusable-text" &&
        diagnostic.severity === "error" &&
        diagnostic.field === "text",
    ),
  );

  // Supporting Markdown was never positively recognized as a standalone
  // linguistic example and therefore receives no invented source record.
  assert.equal(
    inventory
      .allSourceRecords()
      .some((record) => record.path === supportingPath),
    false,
  );

  // Accepted + two contextual rejects + one malformed recognized source.
  assert.equal(inventory.allSourceRecords().length, 4);

  console.log(
    "Linguistic Example language-scope regression tests passed.",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
