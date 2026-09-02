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
import { parseInflectedForms, parseStringList } from "./word-tokens";

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
 * The three possible results when comparing a new meaning with an existing
 * dictionary entry.
 *
 * This is a TypeScript "union type": a value of this type may be exactly one
 * of these three strings and nothing else.
 *
 * - "same" means the existing entry already covers the requested meaning.
 * - "different" means the existing entry has a usable meaning, but it does not
 *   match the requested one.
 * - "unknown" means Workbench could not safely determine what the existing
 *   entry means.
 *
 * Keeping "unknown" separate from "different" is important for data safety.
 * Failure to read creator-authored data must never become permission to create
 * another persistent entry.
 */
export type DictionaryDefinitionComparison = "same" | "different" | "unknown";

/**
 * Which feature, if any, has enough evidence to claim a Markdown source as a
 * dictionary entry.
 *
 * This does NOT require `type: lexeme`. Older Workbench dictionaries and the
 * Mer lexicon commonly identify lexical sources through fields such as
 * `gloss`, `definition`, or `lemma`, and that compatibility is intentional.
 *
 * - "lexical" means Dictionary may interpret the note as a lexical source.
 * - "other-source" means a usable explicit `type` assigns it elsewhere.
 * - "unclaimed" means metadata exists but has no lexical authority signal.
 * - "unknown" means frontmatter itself is unavailable.
 */
export type DictionarySourceAuthority =
  "lexical" | "other-source" | "unclaimed" | "unknown";

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

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  // Function.call() is typed broadly enough that ESLint sees its result as
  // `any`. Converting it explicitly to Boolean preserves the own-property
  // check while making the runtime and TypeScript return type agree.
  return Boolean(Object.prototype.hasOwnProperty.call(record, key));
}

/**
 * Establish whether Dictionary has authority to interpret a source.
 *
 * The order matters:
 *
 * 1. Missing frontmatter is genuinely unknown and must never authorize
 *    mutation.
 * 2. A usable explicit non-lexeme `type` belongs to another source kind.
 * 3. `type: lexeme` explicitly establishes lexical authority.
 * 4. Otherwise, strong lexical fields preserve compatibility with older and
 *    user-authored lexicons that never used a `type` marker.
 * 5. A note with none of those signals is merely unclaimed by Dictionary.
 */
export function classifyDictionarySourceAuthority(
  frontmatter: Record<string, unknown> | undefined,
): DictionarySourceAuthority {
  if (!frontmatter) return "unknown";

  const declaredType = parseNonBlankYamlString(frontmatter.type)?.toLowerCase();

  if (declaredType) {
    return declaredType === "lexeme" ? "lexical" : "other-source";
  }

  const hasLexicalSignal = LEXICAL_SIGNAL_FIELDS.some((key) =>
    hasOwn(frontmatter, key),
  );

  return hasLexicalSignal ? "lexical" : "unclaimed";
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
 * Parse one optional scalar field while preserving the dictionary's existing
 * tolerant scalar semantics.
 *
 * Missing/null fields are simply absent optional metadata. A present array or
 * object is different: Workbench cannot safely manufacture scalar text from
 * that structure, so the clean entry keeps the field undefined while a
 * warning preserves the reason for creator-facing diagnostics.
 *
 * This helper is observational only. It never changes the raw frontmatter.
 */
function parseOptionalScalarWithDiagnostic(
  frontmatter: Record<string, unknown>,
  field: string,
  diagnostics: WorkbenchDiagnostic[],
): string | undefined {
  const raw = frontmatter[field];

  if (raw === undefined || raw === null) {
    return undefined;
  }

  const parsed = parseYamlScalarText(raw);

  if (parsed !== undefined) {
    return parsed;
  }

  diagnostics.push({
    code: "frontmatter.unusable-value",
    severity: "warning",
    field,
    message:
      `Frontmatter field "${field}" was present but could not be ` +
      "interpreted as supported scalar text. The source file was not modified.",
  });

  return undefined;
}

/**
 * Read the first usable dictionary-definition alias.
 *
 * This is shared by ordinary source parsing and mutation-authority checks so
 * they cannot silently disagree about which creator-authored values count as
 * a usable definition.
 */
function parseDictionaryDefinition(frontmatter: Record<string, unknown>) {
  return firstParsedFrontmatterValue(
    [
      { key: "definition", value: frontmatter.definition },
      { key: "gloss", value: frontmatter.gloss },
      { key: "translation", value: frontmatter.translation },
      { key: "meaning", value: frontmatter.meaning },
    ],
    parseNonBlankYamlScalarText,
  );
}

/**
 * Compare a requested meaning with the frontmatter from an existing entry.
 *
 * `frontmatter` may be undefined because Obsidian's metadata cache is not
 * guaranteed to have usable data available at the moment this check runs.
 *
 * Missing metadata, missing definitions, and malformed definitions therefore
 * produce "unknown". Only after Workbench successfully reads an existing
 * definition may it decide that the meaning is either "same" or "different".
 */
export function compareDictionaryDefinition(
  frontmatter: Record<string, unknown> | undefined,
  requestedDefinition: string,
): DictionaryDefinitionComparison {
  if (!frontmatter) return "unknown";

  const existingResult = parseDictionaryDefinition(frontmatter);
  if (!existingResult.value) return "unknown";

  const toSenses = (value: string): string[] =>
    value
      .split(/[,;]/)
      .map((piece) => piece.trim().toLowerCase())
      .filter((piece) => piece.length > 0);

  const existingSenses = new Set(toSenses(existingResult.value));
  const requestedSenses = toSenses(requestedDefinition);

  // An empty requested meaning cannot safely establish either equivalence or
  // difference. Keep uncertainty non-authoritative.
  if (requestedSenses.length === 0) return "unknown";

  return requestedSenses.some((sense) => existingSenses.has(sense))
    ? "same"
    : "different";
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

  // Use the same source-authority rule that mutation paths use. This keeps
  // ordinary parsing and creation-time collision handling from drifting apart.
  //
  // Untyped legacy lexical notes remain supported through strong lexical
  // fields. Mer and older Workbench dictionaries therefore need no migration.
  if (classifyDictionarySourceAuthority(fm) !== "lexical") {
    return null;
  }

  // Short English/documentation-language meaning. These compatibility aliases
  // intentionally preserve tolerant scalar reading, but selection is based on
  // the first value that can actually be interpreted rather than the first
  // value that merely happens to be non-null.
  const definitionResult = parseDictionaryDefinition(fm);
  addRejectedAliasDiagnostics(diagnostics, definitionResult.rejectedKeys);

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

  /*
   * Lexical identity is deliberately independent from the current surface
   * form. A lemma may be corrected, respelled, or renamed without meaning that
   * the creator intended to describe a different lexical object.
   *
   * `lexeme_id` is optional for compatibility with existing dictionaries. A
   * legacy source without it remains fully usable under Workbench/source
   * identity; Workbench must not manufacture a linguistic ID while reading.
   *
   * When the field is present but structurally unusable, retain that fact as a
   * diagnostic rather than silently substituting the lemma or filename.
   */
  const lexemeId = parseOptionalScalarWithDiagnostic(
    fm,
    "lexeme_id",
    diagnostics,
  );
  const normalizedLexemeId =
    lexemeId !== undefined && lexemeId.trim().length > 0
      ? lexemeId.trim()
      : undefined;

  if (lexemeId !== undefined && normalizedLexemeId === undefined) {
    diagnostics.push({
      code: "dictionary.lexeme.unusable-id",
      severity: "warning",
      field: "lexeme_id",
      message:
        'Frontmatter field "lexeme_id" was blank and therefore could not ' +
        "establish portable linguistic identity. The source file was not modified.",
    });
  }

  const identity = createObsidianWorkbenchIdentity(
    input.path,
    normalizedLexemeId,
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
  addRejectedAliasDiagnostics(diagnostics, partOfSpeechResult.rejectedKeys);

  const nameCategoryResult = firstParsedFrontmatterValue(
    [
      { key: "nameCategory", value: fm.nameCategory },
      { key: "category", value: fm.category },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(diagnostics, nameCategoryResult.rejectedKeys);

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
  // converted to implementation-generated strings, but they now leave a
  // source-facing warning instead of disappearing silently from interpretation.
  const ipa = parseOptionalScalarWithDiagnostic(fm, "ipa", diagnostics);
  const etymology = parseOptionalScalarWithDiagnostic(
    fm,
    "etymology",
    diagnostics,
  );
  const notes = parseOptionalScalarWithDiagnostic(fm, "notes", diagnostics);
  const language = parseOptionalScalarWithDiagnostic(
    fm,
    "language",
    diagnostics,
  );
  const languageId = parseOptionalScalarWithDiagnostic(
    fm,
    "language_id",
    diagnostics,
  );

  const parts = parseStringList(fm.parts);
  const aliases = parseStringList(fm.aliases);
  const inflectAs = parseStringList(fm.inflectAs)?.join(",");

  const isPhrase = /\s/.test(word);
  const wordCount = word
    .split(/\s+/)
    .filter((piece) => piece.length > 0).length;

  const entry: DictionaryEntry = {
    word,
    definition: definitionResult.value,
    path: input.path,
    partOfSpeech: partOfSpeechResult.value,
    ipa,
    etymology,
    notes,
    language,
    languageId,
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
