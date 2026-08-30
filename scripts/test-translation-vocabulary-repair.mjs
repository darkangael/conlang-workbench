import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = await mkdtemp(
  join(tmpdir(), "conlang-translation-vocabulary-repair-"),
);

try {
  const outfile = join(tempDir, "translation-vocabulary-repair.mjs");

  await build({
    entryPoints: ["translation-vocabulary-repair.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });

  const { repairMissingTranslationVocabulary } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const targetLanguage = {
    name: "Test Language",
    dictionaryFolder: "Languages/Test Language/Lexicon",
    sheets: [],
    inflections: [],
  };

  const missing = (source) => ({
    source,
    reason: "missing",
  });

  const ambiguous = (source) => ({
    source,
    reason: "ambiguous",
    candidates: ["one", "two"],
  });

  const unsupported = (source) => ({
    source,
    reason: "unsupported",
  });

  const wordResult = (source) => ({
    conlangWord: `FORM-${source}`,
    englishDefinition: source,
    partOfSpeech: "",
  });

  const createdWrite = (source) => ({
    status: "created",
    path: `Languages/Test Language/Lexicon/FORM-${source}.md`,
    file: { path: `Languages/Test Language/Lexicon/FORM-${source}.md` },
    wordOverride: false,
  });

  // -----------------------------------------------------------------------
  // Only genuinely missing lexical items enter the creation queue.
  // Ambiguous and unsupported items must remain blockers for later re-plan.
  // -----------------------------------------------------------------------
  {
    const prompted = [];
    const written = [];

    const result = await repairMissingTranslationVocabulary(
      [
        ambiguous("bank"),
        missing("water"),
        unsupported("walked"),
        missing("stone"),
      ],
      targetLanguage,
      {
        promptForWord: async (source, language) => {
          assert.equal(language, targetLanguage);
          prompted.push(source);
          return wordResult(source);
        },
        writeWord: async (language, word) => {
          assert.equal(language, targetLanguage);
          written.push(word.englishDefinition);
          return createdWrite(word.englishDefinition);
        },
      },
    );

    assert.deepEqual(prompted, ["water", "stone"]);
    assert.deepEqual(written, ["water", "stone"]);
    assert.deepEqual(result, {
      status: "completed",
      createdCount: 2,
      existingCount: 0,
    });
  }

  // -----------------------------------------------------------------------
  // Cancelling the very first creation ends the whole operation and writes
  // nothing.
  // -----------------------------------------------------------------------
  {
    let writeCalls = 0;

    const result = await repairMissingTranslationVocabulary(
      [missing("water"), missing("stone")],
      targetLanguage,
      {
        promptForWord: async () => null,
        writeWord: async () => {
          writeCalls += 1;
          throw new Error("writeWord must not run after cancellation");
        },
      },
    );

    assert.equal(writeCalls, 0);
    assert.deepEqual(result, {
      status: "cancelled",
      createdCount: 0,
      existingCount: 0,
    });
  }

  // -----------------------------------------------------------------------
  // Most important cancellation invariant:
  //
  // If one word was explicitly created and the creator cancels the next
  // modal, the first word remains counted as persisted, later words are never
  // attempted, and the whole translation repair returns cancelled.
  // -----------------------------------------------------------------------
  {
    const prompted = [];
    const written = [];

    const result = await repairMissingTranslationVocabulary(
      [missing("water"), missing("stone"), missing("river")],
      targetLanguage,
      {
        promptForWord: async (source) => {
          prompted.push(source);

          if (source === "stone") {
            return null;
          }

          return wordResult(source);
        },
        writeWord: async (_language, word) => {
          written.push(word.englishDefinition);
          return createdWrite(word.englishDefinition);
        },
      },
    );

    assert.deepEqual(prompted, ["water", "stone"]);
    assert.deepEqual(written, ["water"]);
    assert.deepEqual(result, {
      status: "cancelled",
      createdCount: 1,
      existingCount: 0,
    });
  }

  // -----------------------------------------------------------------------
  // An already-existing equivalent entry satisfies that individual repair
  // item without creating a duplicate.
  // -----------------------------------------------------------------------
  {
    let index = 0;

    const result = await repairMissingTranslationVocabulary(
      [missing("water"), missing("stone")],
      targetLanguage,
      {
        promptForWord: async (source) => wordResult(source),
        writeWord: async (_language, word) => {
          index += 1;

          if (index === 1) {
            return {
              status: "existing",
              path: "Languages/Test Language/Lexicon/FORM-water.md",
              file: {
                path: "Languages/Test Language/Lexicon/FORM-water.md",
              },
            };
          }

          return createdWrite(word.englishDefinition);
        },
      },
    );

    assert.deepEqual(result, {
      status: "completed",
      createdCount: 1,
      existingCount: 1,
    });
  }

  // -----------------------------------------------------------------------
  // Persistence failure is terminal. Previously created vocabulary remains,
  // and no later lexical item is prompted.
  // -----------------------------------------------------------------------
  {
    const prompted = [];

    const result = await repairMissingTranslationVocabulary(
      [missing("water"), missing("stone"), missing("river")],
      targetLanguage,
      {
        promptForWord: async (source) => {
          prompted.push(source);
          return wordResult(source);
        },
        writeWord: async (_language, word) => {
          if (word.englishDefinition === "stone") {
            return {
              status: "blocked",
              error: "Synthetic persistence boundary failure",
            };
          }

          return createdWrite(word.englishDefinition);
        },
      },
    );

    assert.deepEqual(prompted, ["water", "stone"]);
    assert.deepEqual(result, {
      status: "failed",
      createdCount: 1,
      existingCount: 0,
      error: "Synthetic persistence boundary failure",
    });
  }

  // -----------------------------------------------------------------------
  // A blocked plan containing no missing vocabulary has nothing this module
  // is authorized to repair.
  // -----------------------------------------------------------------------
  {
    let promptCalls = 0;

    const result = await repairMissingTranslationVocabulary(
      [ambiguous("bank"), unsupported("walked")],
      targetLanguage,
      {
        promptForWord: async () => {
          promptCalls += 1;
          return null;
        },
        writeWord: async () => {
          throw new Error("writeWord must not run");
        },
      },
    );

    assert.equal(promptCalls, 0);
    assert.deepEqual(result, {
      status: "completed",
      createdCount: 0,
      existingCount: 0,
    });
  }

  console.log("translation vocabulary repair tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
