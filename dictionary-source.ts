import type { DictionaryEntry } from "./types";
import {
  firstParsedFrontmatterValue,
  parseNonBlankYamlScalarText,
  parseNonBlankYamlString,
  parseYamlScalarText,
} from "./frontmatter-values";
import { createObsidianWorkbenchIdentity } from "./workbench-id";
import type {
  WorkbenchDiagnostic,
  WorkbenchSourceRecord,
} from "./workbench-source";
import {
  parseInflectedForms,
  parseStringList,
} from "./word-tokens";

/**
 * Raw source information needed to interpret one possible lexical-entry note.
 *
 * This adapter deliberately receives plain data rather than Obsidian objects.
 * That keeps source interpretation pure, independently testable, and reusable
 * by future import adapters.
 */
export interface DictionarySourceInput {
  path: string;
  basename: string;
  mtime?: number;
  frontmatter: Record<string, unknown>;
}

/**
 * Fields that strongly indicate a note is intended to describe a lexical
 * object. Generic metadata such as `language`, `notes`, `category`, or `ipa`
 * is intentionally excluded because those fields can appear on supporting
 * documentation that is not a dictionary entry.
 */
const LEXICAL_SIGNAL_FIELDS = [
  "definition",
  "gloss",
  "translation",
  "meaning",
  "word",
  "lemma",
  "forms",
  "inflections",
] as const;

function hasOwn(
  record: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function addRejectedAliasDiagnostics(
  diagnostics: WorkbenchDiagnostic[],
  rejectedKeys: string[],
): void {
  for (const field of rejectedKeys) {
    diagnostics.push({
      code: "frontmatter.unusable-alias",
      severity: "warning",
      field,
      message:
        `Frontmatter field "${field}" was present but could not be ` +
        "interpreted in its supported form. A later supported alias may " +
        "still be used; the source file was not modified.",
    });
  }
}

/**
 * Interpret a possible dictionary source.
 *
 * Recognition is intentionally broader than `type: lexeme` because existing
 * Workbench and user lexicons pre-date that convention and commonly use fields
 * such as `lemma` + `gloss`. At the same time, merely living under a configured
 * lexicon folder is not sufficient: supporting Markdown should stay outside
 * dictionary authority unless it contains a strong lexical signal.
 *
 * The source is never rewritten. Unsupported structures remain in the user's
 * Markdown exactly as authored and are represented only by diagnostics.
 */
export function parseDictionarySource(
  input: DictionarySourceInput,
): WorkbenchSourceRecord<DictionaryEntry> | null {
  const fm = input.frontmatter;
  const diagnostics: WorkbenchDiagnostic[] = [];

  const declaredType = parseNonBlankYamlString(fm.type)?.toLowerCase();

  // An explicit usable document type establishes source authority. Dictionary
  // owns `lexeme`; other named document types belong to their own feature or
  // remain supporting documentation, even if they happen to reuse fields such
  // as `gloss`.
  if (declaredType && declaredType !== "lexeme") {
    return null;
  }

  const explicitlyLexeme = declaredType === "lexeme";
  const hasLexicalSignal = LEXICAL_SIGNAL_FIELDS.some((key) =>
    hasOwn(fm, key),
  );

  // Untyped legacy lexical notes remain supported through strong lexical
  // fields. Mer and older Workbench dictionaries therefore need no migration.
  if (!explicitlyLexeme && !hasLexicalSignal) {
    return null;
  }

  // Short English/documentation-language meaning. These compatibility aliases
  // intentionally preserve tolerant scalar reading, but selection is based on
  // the first value that can actually be interpreted rather than the first
  // value that merely happens to be non-null.
  const definitionResult = firstParsedFrontmatterValue(
    [
      { key: "definition", value: fm.definition },
      { key: "gloss", value: fm.gloss },
      { key: "translation", value: fm.translation },
      { key: "meaning", value: fm.meaning },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(
    diagnostics,
    definitionResult.rejectedKeys,
  );

  // `word` is the older Workbench name and `lemma` is the common
  // lexicographic name. If neither is usable, preserve the existing filename
  // fallback rather than inventing a new identity scheme.
  const wordResult = firstParsedFrontmatterValue(
    [
      { key: "word", value: fm.word },
      { key: "lemma", value: fm.lemma },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(diagnostics, wordResult.rejectedKeys);

  const word = wordResult.value ?? input.basename;

  // The resolved lexical headword is a creator-facing linguistic identity.
  // Workbench/source identity remains independently derived from source path.
  const identity = createObsidianWorkbenchIdentity(
    input.path,
    word,
  );

  if (!definitionResult.value) {
    diagnostics.push({
      code: "dictionary.entry.missing-definition",
      severity: "error",
      field: "definition",
      message:
        "Recognized lexical source has no interpretable definition, gloss, " +
        "translation, or meaning. The source is retained but is not loaded " +
        "as a valid dictionary entry.",
    });

    return {
      identity,
      path: input.path,
      value: null,
      diagnostics,
    };
  }

  const partOfSpeechResult = firstParsedFrontmatterValue(
    [
      { key: "partOfSpeech", value: fm.partOfSpeech },
      { key: "pos", value: fm.pos },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(
    diagnostics,
    partOfSpeechResult.rejectedKeys,
  );

  const nameCategoryResult = firstParsedFrontmatterValue(
    [
      { key: "nameCategory", value: fm.nameCategory },
      { key: "category", value: fm.category },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(
    diagnostics,
    nameCategoryResult.rejectedKeys,
  );

  // `forms` has deliberately richer input semantics than ordinary scalar
  // fields: lists, maps, and lists of single-key maps are all supported.
  // Therefore alias selection must ask parseInflectedForms() whether each
  // candidate is usable rather than applying a scalar-string helper.
  const formsResult = firstParsedFrontmatterValue(
    [
      { key: "forms", value: fm.forms },
      { key: "inflections", value: fm.inflections },
    ],
    parseInflectedForms,
  );
  addRejectedAliasDiagnostics(diagnostics, formsResult.rejectedKeys);

  // These direct optional fields preserve the dictionary's previous tolerant
  // scalar semantics. Structured values remain uninterpreted rather than being
  // converted to implementation-generated strings.
  const ipa = parseYamlScalarText(fm.ipa);
  const etymology = parseYamlScalarText(fm.etymology);
  const notes = parseYamlScalarText(fm.notes);
  const language = parseYamlScalarText(fm.language);

  const parts = parseStringList(fm.parts);
  const aliases = parseStringList(fm.aliases);
  const inflectAs = parseStringList(fm.inflectAs)?.join(",");

  const isPhrase = /\s/.test(word);
  const wordCount = word
    .split(/\s+/)
    .filter((piece) => piece.length > 0)
    .length;

  const entry: DictionaryEntry = {
    word,
    definition: definitionResult.value,
    path: input.path,
    partOfSpeech: partOfSpeechResult.value,
    ipa,
    etymology,
    notes,
    language,
    mtime: input.mtime,
    nameCategory: nameCategoryResult.value,
    isPhrase,
    wordCount,
    parts,
    aliases,
    forms: formsResult.value,
    inflectAs,
  };

  return {
    identity,
    path: input.path,
    value: entry,
    diagnostics,
  };
}
