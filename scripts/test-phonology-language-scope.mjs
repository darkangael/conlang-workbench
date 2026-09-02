import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// ---------------------------------------------------------------------------
// Phonology language-scope regression harness
//
// PhonologyInventory runs inside Obsidian and recursively scans TFolder/TFile
// objects. These tiny host stubs model only that boundary. The inventory,
// parser, shared language-authority resolver, and indexing logic remain the
// actual production TypeScript bundled below.
//
// The regression deliberately exercises both phonological-unit and realization
// branches because they retain separate source-record collections and indexes.
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync(join(tmpdir(), "conlang-phonology-language-"));
const obsidianStub = join(tempDir, "obsidian-stub.mjs");
const outfile = join(tempDir, "phonology.mjs");

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
        export { PhonologyInventory } from "./phonology.ts";
        export { TFile, TFolder } from "obsidian";
      `,
      resolveDir: process.cwd(),
      sourcefile: "phonology-language-scope-entry.mjs",
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

  const { PhonologyInventory, TFile, TFolder } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const folderPath = "Languages/Mer/Phonology";

  const acceptedUnitPath = `${folderPath}/p.md`;
  const rejectedUnitPath = `${folderPath}/foreign-unit.md`;
  const acceptedRealizationPath = `${folderPath}/p-aspirated.md`;
  const rejectedRealizationPath = `${folderPath}/foreign-realization.md`;
  const unresolvedRealizationPath = `${folderPath}/unresolved-reference.md`;
  const malformedUnitPath = `${folderPath}/malformed-unit.md`;
  const supportingPath = `${folderPath}/notes.md`;

  const files = [
    new TFile(acceptedUnitPath),
    new TFile(rejectedUnitPath),
    new TFile(acceptedRealizationPath),
    new TFile(rejectedRealizationPath),
    new TFile(unresolvedRealizationPath),
    new TFile(malformedUnitPath),
    new TFile(supportingPath),
  ];

  const folder = new TFolder(folderPath, files);

  const frontmatter = new Map([
    [
      acceptedUnitPath,
      {
        type: "phonological-unit",
        unit_id: "p",
        symbol: "/p/",
      },
    ],
    [
      rejectedUnitPath,
      {
        type: "phonological-unit",
        unit_id: "foreign-unit",
        symbol: "/x/",
        language: "Test Language",
      },
    ],
    [
      acceptedRealizationPath,
      {
        type: "phonological-realization",
        realization_id: "p-aspirated",
        unit_id: "p",
        symbol: "[pʰ]",
      },
    ],
    [
      rejectedRealizationPath,
      {
        type: "phonological-realization",
        realization_id: "foreign-realization",
        unit_id: "p",
        symbol: "[pː]",
        language: "Mer",
        language_id: "test-language",
      },
    ],
    [
      unresolvedRealizationPath,
      {
        type: "phonological-realization",
        realization_id: "unresolved-reference",
        unit_id: "missing-unit",
        symbol: "[q]",
      },
    ],
    [
      malformedUnitPath,
      {
        type: "phonological-unit",
        unit_id: "malformed-unit",
        symbol: { malformed: "structure" },
      },
    ],
    [
      supportingPath,
      {
        title: "Phonology notes",
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

  const inventory = new PhonologyInventory(app);

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

  // One accepted unit plus two accepted realizations should enter the clean
  // inventory. Contextual rejects and malformed records must not contribute.
  assert.equal(loaded, 3);
  assert.equal(inventory.allUnits().length, 1);
  assert.equal(inventory.allRealizations().length, 2);

  // -------------------------------------------------------------------------
  // Accepted legacy unit: inherit configured scope in runtime only.
  // -------------------------------------------------------------------------
  const acceptedUnits = inventory.lookupId(
    "p",
    "mer-language",
    "Mer",
  );

  assert.equal(acceptedUnits.length, 1);
  assert.equal(acceptedUnits[0].language, "Mer");
  assert.equal(
    acceptedUnits[0].languageId,
    "mer-language",
    "legacy phonological units may inherit canonical language identity in runtime",
  );

  // -------------------------------------------------------------------------
  // Readable-language rejected unit: retain source, exclude clean object.
  // -------------------------------------------------------------------------
  assert.equal(inventory.lookupId("foreign-unit").length, 0);

  const rejectedUnit = inventory
    .allUnitSourceRecords()
    .find((record) => record.path === rejectedUnitPath);

  assert.ok(
    rejectedUnit,
    "recognized unit rejected by readable language must remain retained",
  );
  assert.notEqual(
    rejectedUnit.value,
    null,
    "contextual rejection must preserve the successfully parsed unit value",
  );
  assert.ok(
    rejectedUnit.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "language.membership-mismatch" &&
        diagnostic.severity === "warning" &&
        diagnostic.field === "language",
    ),
    "retained unit should explain its readable-language rejection",
  );

  // -------------------------------------------------------------------------
  // Accepted realization: inherit runtime scope and enter relationship indexes.
  // -------------------------------------------------------------------------
  const acceptedRealizations = inventory.lookupRealizationId(
    "p-aspirated",
    "mer-language",
    "Mer",
  );

  assert.equal(acceptedRealizations.length, 1);
  assert.equal(acceptedRealizations[0].language, "Mer");
  assert.equal(acceptedRealizations[0].languageId, "mer-language");

  assert.equal(
    inventory.lookupRealizationsForUnit(
      "p",
      "mer-language",
      "Mer",
    ).length,
    1,
  );

  // -------------------------------------------------------------------------
  // Stable-ID rejected realization: retain source, exclude every clean index.
  // -------------------------------------------------------------------------
  assert.equal(
    inventory.lookupRealizationId("foreign-realization").length,
    0,
  );

  assert.equal(
    inventory.lookupRealizationsForUnit("p").some(
      (realization) => realization.id === "foreign-realization",
    ),
    false,
  );

  const rejectedRealization = inventory
    .allRealizationSourceRecords()
    .find((record) => record.path === rejectedRealizationPath);

  assert.ok(
    rejectedRealization,
    "recognized realization rejected by stable language ID must remain retained",
  );
  assert.notEqual(
    rejectedRealization.value,
    null,
    "stable-ID rejection must preserve the parsed realization value",
  );
  assert.ok(
    rejectedRealization.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "language.id-mismatch" &&
        diagnostic.severity === "warning" &&
        diagnostic.field === "language_id",
    ),
    "retained realization should explain its stable language-ID rejection",
  );

  // -------------------------------------------------------------------------
  // Unresolved relationship is NOT contextual authority failure.
  //
  // A structurally valid realization remains loaded even when its unit_id does
  // not currently resolve. source-diagnostics.ts owns that later semantic
  // relationship warning.
  // -------------------------------------------------------------------------
  const unresolved = inventory.lookupRealizationId(
    "unresolved-reference",
    "mer-language",
    "Mer",
  );

  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].unitId, "missing-unit");

  assert.equal(
    inventory.lookupRealizationsForUnit(
      "missing-unit",
      "mer-language",
      "Mer",
    ).length,
    1,
  );

  // -------------------------------------------------------------------------
  // Existing malformed-source retention remains unchanged.
  // -------------------------------------------------------------------------
  const malformedUnit = inventory
    .allUnitSourceRecords()
    .find((record) => record.path === malformedUnitPath);

  assert.ok(malformedUnit);
  assert.equal(malformedUnit.value, null);
  assert.ok(
    malformedUnit.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "phonology.unit.missing-symbol" &&
        diagnostic.severity === "error",
    ),
  );

  // Supporting Markdown was never recognized as a phonology source.
  assert.equal(
    inventory
      .allUnitSourceRecords()
      .some((record) => record.path === supportingPath),
    false,
  );
  assert.equal(
    inventory
      .allRealizationSourceRecords()
      .some((record) => record.path === supportingPath),
    false,
  );

  // Accepted + rejected + malformed recognized unit sources.
  assert.equal(inventory.allUnitSourceRecords().length, 3);

  // Accepted + rejected + unresolved-but-valid realization sources.
  assert.equal(inventory.allRealizationSourceRecords().length, 3);

  console.log("Phonology language-scope regression tests passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
