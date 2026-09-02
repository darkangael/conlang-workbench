import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";

// Production uses the standards-based Web Crypto global when the current
// Obsidian runtime provides it. Node 18 does not expose that global by default,
// so this regression harness supplies Node's compatible Web Crypto object.
// This affects tests only; production code does not import node:crypto.
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

/**
 * Bundle the production writer together with the mock classes used by the
 * test.
 *
 * `instanceof` compares class identity, not merely class names or shapes.
 * Exporting TFile and TFolder from the SAME bundle as the writer guarantees
 * that objects created by the test use the exact classes checked by production
 * `instanceof TFile/TFolder` guards.
 */
const obsidianMockPlugin = {
  name: "obsidian-test-mock",

  setup(buildApi) {
    buildApi.onResolve({ filter: /^obsidian$/ }, () => ({
      path: "obsidian",
      namespace: "obsidian-test",
    }));

    buildApi.onLoad(
      { filter: /.*/, namespace: "obsidian-test" },
      () => ({
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
      }),
    );
  },
};

const result = await build({
  stdin: {
    contents: `
      export { writeDictionaryEntry } from "./dictionary-entry-writer";
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

const source = result.outputFiles[0].text;
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");

const {
  writeDictionaryEntry,
  TFile,
  TFolder,
} = await import(moduleUrl);

/**
 * Make a minimal in-memory Obsidian-like App.
 *
 * TFile and TFolder above came from the same bundle as writeDictionaryEntry().
 * That detail is important because the production writer deliberately uses
 * runtime `instanceof` checks to distinguish files, folders, and unexpected
 * vault objects before allowing mutations.
 */
function makeApp(initial = {}) {
  const objects = new Map();
  const frontmatter = new Map();
  const writes = [];

  for (const folder of initial.folders ?? []) {
    objects.set(folder, new TFolder(folder));
  }

  for (const item of initial.files ?? []) {
    const file = new TFile(item.path);
    objects.set(item.path, file);

    if ("frontmatter" in item) {
      frontmatter.set(item.path, item.frontmatter);
    }
  }

  const app = {
    vault: {
      getAbstractFileByPath(path) {
        return objects.get(path) ?? null;
      },

      async createFolder(path) {
        if (objects.has(path)) {
          throw new Error("already exists");
        }

        objects.set(path, new TFolder(path));
      },

      async create(path, content) {
        if (objects.has(path)) {
          throw new Error("already exists");
        }

        const file = new TFile(path);
        objects.set(path, file);
        writes.push({ path, content });
        return file;
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

  return {
    app,
    objects,
    frontmatter,
    writes,
  };
}

function request(app, overrides = {}) {
  return {
    app,
    form: "kala",
    definition: "stone",
    partOfSpeech: "noun",
    dictionaryFolder: "Languages/Test/Dictionary",

    // Portable IDs are opt-in at the language policy layer. Individual tests
    // enable them explicitly when exercising that creation boundary.
    includePortableIds: false,

    // The test keeps the template deliberately small. We only need to prove
    // that the writer passes the homograph decision to the caller correctly;
    // individual production entry templates remain their callers'
    // responsibility.
    buildContent: ({ wordOverride }) =>
      wordOverride
        ? "word: kala\ndefinition: stone"
        : "definition: stone",

    ...overrides,
  };
}

// Ordinary creation creates the missing destination hierarchy and one file.
{
  const { app, writes } = makeApp();

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "created");
  assert.equal(result.path, "Languages/Test/Dictionary/kala.md");
  assert.equal(result.wordOverride, false);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "Languages/Test/Dictionary/kala.md");
}

// A same-spelling lexical source with the same meaning is reused, not written.
{
  const { app, writes } = makeApp({
    folders: [
      "Languages",
      "Languages/Test",
      "Languages/Test/Dictionary",
    ],
    files: [
      {
        path: "Languages/Test/Dictionary/kala.md",
        frontmatter: {
          definition: "stone",
        },
      },
    ],
  });

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "existing");
  assert.equal(result.path, "Languages/Test/Dictionary/kala.md");
  assert.equal(writes.length, 0);
}

// A confirmed different meaning receives a homograph path and word override.
{
  const { app, writes } = makeApp({
    folders: [
      "Languages",
      "Languages/Test",
      "Languages/Test/Dictionary",
    ],
    files: [
      {
        path: "Languages/Test/Dictionary/kala.md",
        frontmatter: {
          definition: "river",
        },
      },
    ],
  });

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "created");
  assert.equal(result.path, "Languages/Test/Dictionary/kala (noun).md");
  assert.equal(result.wordOverride, true);
  assert.equal(writes.length, 1);
  assert.match(writes[0].content, /^word: kala/);
}

// Missing metadata is uncertainty, never permission to create a homograph.
{
  const { app, writes } = makeApp({
    folders: [
      "Languages",
      "Languages/Test",
      "Languages/Test/Dictionary",
    ],
    files: [
      {
        path: "Languages/Test/Dictionary/kala.md",
      },
    ],
  });

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "blocked");
  assert.match(result.error, /couldn't safely determine/);
  assert.equal(writes.length, 0);
}

// An explicitly nonlexical source is preserved and blocks creation.
{
  const { app, writes } = makeApp({
    folders: [
      "Languages",
      "Languages/Test",
      "Languages/Test/Dictionary",
    ],
    files: [
      {
        path: "Languages/Test/Dictionary/kala.md",
        frontmatter: {
          type: "morpheme",
          gloss: "stone",
        },
      },
    ],
  });

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "blocked");
  assert.match(result.error, /not established as a lexical entry/);
  assert.equal(writes.length, 0);
}

// Unsafe configured paths fail before creating folders or files.
{
  const { app, writes, objects } = makeApp();

  const result = await writeDictionaryEntry(
    request(app, {
      dictionaryFolder: "../Outside",
    }),
  );

  assert.equal(result.status, "blocked");
  assert.match(result.error, /invalid dictionary folder/);
  assert.equal(writes.length, 0);
  assert.equal(objects.size, 0);
}

// A file occupying one of the required folder components is a hard failure.
{
  const { app, writes } = makeApp({
    files: [
      {
        path: "Languages",
        frontmatter: {
          definition: "unrelated",
        },
      },
    ],
  });

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "failed");
  assert.match(result.error, /exists but is not a folder/);
  assert.equal(writes.length, 0);
}

// A real folder-creation error must stop the write. Only the narrow race where
// the expected folder actually appeared is allowed to recover.
{
  const { app, writes, objects } = makeApp();

  app.vault.createFolder = async (path) => {
    throw new Error(`permission denied for ${path}`);
  };

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "failed");
  assert.match(result.error, /permission denied/);
  assert.equal(writes.length, 0);
  assert.equal(objects.size, 0);
}

// If the preferred part-of-speech homograph path is already occupied, the
// writer must choose another free path rather than overwrite it.
{
  const { app, writes } = makeApp({
    folders: [
      "Languages",
      "Languages/Test",
      "Languages/Test/Dictionary",
    ],
    files: [
      {
        path: "Languages/Test/Dictionary/kala.md",
        frontmatter: {
          definition: "river",
        },
      },
      {
        path: "Languages/Test/Dictionary/kala (noun).md",
        frontmatter: {
          definition: "existing homograph",
        },
      },
    ],
  });

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "created");
  assert.equal(result.path, "Languages/Test/Dictionary/kala (2).md");
  assert.equal(result.wordOverride, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "Languages/Test/Dictionary/kala (2).md");
}

// A non-file vault object occupying the exact lexical destination is preserved
// and blocks creation instead of being reinterpreted.
{
  const { app, writes, objects } = makeApp({
    folders: [
      "Languages",
      "Languages/Test",
      "Languages/Test/Dictionary",
      "Languages/Test/Dictionary/kala.md",
    ],
  });

  const result = await writeDictionaryEntry(request(app));

  assert.equal(result.status, "blocked");
  assert.match(result.error, /not a file/);
  assert.equal(writes.length, 0);
  assert.ok(objects.has("Languages/Test/Dictionary/kala.md"));
}

// Content-generation failures must happen before any persistent vault mutation.
//
// buildContent() is Workbench-owned code rather than creator input, but treating
// it as a possible failure boundary keeps the persistence layer conservative:
// a programming/template error should not leave empty dictionary directories
// behind.
{
  const { app, writes, objects } = makeApp();

  const result = await writeDictionaryEntry(
    request(app, {
      buildContent() {
        throw new Error("template generation failed");
      },
    }),
  );

  assert.equal(result.status, "failed");
  assert.match(result.error, /template generation failed/);

  // Neither the lexical file nor any of its destination folders should exist,
  // because content is now built before ensureFolderStrict() runs.
  assert.equal(writes.length, 0);
  assert.equal(objects.size, 0);
}


// Portable identity is generated only for an authorized new lexical source.
// The exact UUID is intentionally unpredictable; the regression checks the
// stable Workbench convention and that the callback receives the same value
// that is persisted by this test template.
{
  const { app, writes } = makeApp();
  let receivedLexemeId;

  const result = await writeDictionaryEntry(
    request(app, {
      includePortableIds: true,
      buildContent({ wordOverride, lexemeId }) {
        receivedLexemeId = lexemeId;

        return [
          ...(wordOverride ? ["word: kala"] : []),
          `lexeme_id: ${lexemeId}`,
          "definition: stone",
        ].join("\n");
      },
    }),
  );

  assert.equal(result.status, "created");
  assert.equal(result.portableIdOmitted, false);
  assert.match(
    receivedLexemeId,
    /^lex-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.match(writes[0].content, new RegExp(`lexeme_id: ${receivedLexemeId}`));
}

// Disabling portable IDs leaves the content context undefined rather than
// creating a blank or compatibility identity.
{
  const { app } = makeApp();
  let receivedLexemeId = "unexpected";

  const result = await writeDictionaryEntry(
    request(app, {
      includePortableIds: false,
      buildContent({ lexemeId }) {
        receivedLexemeId = lexemeId;
        return "definition: stone";
      },
    }),
  );

  assert.equal(result.status, "created");
  assert.equal(result.portableIdOmitted, false);
  assert.equal(receivedLexemeId, undefined);
}

// A runtime without Web Crypto UUID generation must not lose the creator's
// requested lexical note merely because this optional portability feature
// cannot run. The note is created without lexeme_id and the result carries a
// precise signal so the UI can explain that backfill remains available.
{
  const originalCrypto = globalThis.crypto;

  try {
    globalThis.crypto = undefined;

    const { app, writes } = makeApp();
    let receivedLexemeId = "unexpected";

    const result = await writeDictionaryEntry(
      request(app, {
        includePortableIds: true,
        buildContent({ lexemeId }) {
          receivedLexemeId = lexemeId;
          return "definition: stone";
        },
      }),
    );

    assert.equal(result.status, "created");
    assert.equal(result.portableIdOmitted, true);
    assert.equal(receivedLexemeId, undefined);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].content.includes("lexeme_id"), false);
  } finally {
    globalThis.crypto = originalCrypto;
  }
}

// Reusing an existing entry must return before buildContent(), proving that the
// writer does not manufacture a fresh lexical identity for a source that
// already exists.
{
  const { app } = makeApp({
    folders: [
      "Languages",
      "Languages/Test",
      "Languages/Test/Dictionary",
    ],
    files: [
      {
        path: "Languages/Test/Dictionary/kala.md",
        frontmatter: {
          definition: "stone",
        },
      },
    ],
  });

  let buildCalls = 0;

  const result = await writeDictionaryEntry(
    request(app, {
      includePortableIds: true,
      buildContent() {
        buildCalls += 1;
        return "definition: stone";
      },
    }),
  );

  assert.equal(result.status, "existing");
  assert.equal(buildCalls, 0);
}

console.log("dictionary entry writer security regression tests passed.");
