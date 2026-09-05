import { maskMarkdownFencedCodeBlocks } from "./markdown-fences";
import { LexicalSense } from "./types";
import type { WorkbenchDiagnostic } from "./workbench-source";

/**
 * Result of interpreting optional structured lexical senses from a note body.
 *
 * Senses and diagnostics are intentionally returned together without changing
 * the source Markdown. A diagnostic describes structured material Workbench
 * could not safely interpret; it never authorizes repair or normalization.
 */
export interface LexicalSenseInterpretation {
  senses: LexicalSense[];
  diagnostics: WorkbenchDiagnostic[];
}

/**
 * Parse the optional `## Senses` section from a lexical-entry Markdown note.
 *
 * The simple frontmatter `definition:` remains a complete entry format.
 * This parser only adds richer semantic information when a note contains
 * structured sense headings.
 *
 * Recognized structure:
 *
 * ## Senses
 *
 * ### Sense 1
 *
 * **ID:** optional
 * **Gloss:** optional
 * **Definition:** optional
 * **Lookup:** current, flow, course
 *
 * Each `### Sense ...` heading starts a new sense.
 *
 * A sense is kept only when it contains meaningful semantic information:
 * gloss, definition, or at least one lookup term. An ID by itself is not
 * enough to create a sense.
 */
export function interpretLexicalSenses(
  markdown: string,
): LexicalSenseInterpretation {
  // Fenced code is literal/example content, not active lexical metadata.
  // Mask it before looking for `## Senses`, sense headings, or semantic fields
  // so documentation examples cannot accidentally acquire dictionary authority.
  const activeMarkdown = maskMarkdownFencedCodeBlocks(markdown);

  const sensesSection = extractSensesSection(activeMarkdown);
  if (!sensesSection) {
    return { senses: [], diagnostics: [] };
  }

  const senses: LexicalSense[] = [];
  const diagnostics: WorkbenchDiagnostic[] = [];
  const senseHeadingRe = /^###\s+Sense\b.*$/gim;

  const matches = [...sensesSection.matchAll(senseHeadingRe)];

  if (matches.length === 0) {
    /*
     * A Senses section may legitimately be empty or contain ordinary prose
     * while the creator is still developing the entry. Do not diagnose that
     * uncertainty.
     *
     * A nonblank supported semantic field is different: it is positive
     * evidence that structured sense data was supplied, but without a Sense
     * heading Workbench cannot safely decide which sense owns that material.
     * Preserve the Markdown and report the omission instead of silently
     * treating the structured data as absent.
     */
    if (containsNonBlankSemanticField(sensesSection)) {
      diagnostics.push({
        code: "dictionary.senses.unowned-semantic-field",
        severity: "warning",
        field: "Senses",
        message:
          "The Senses section contains structured semantic fields without a " +
          "recognized Sense heading. The lexical entry remains valid and the " +
          "source file was not modified, but Workbench could not assign those " +
          "fields to a structured sense.",
      });
    }

    return { senses, diagnostics };
  }

  /*
   * Content before the first recognized Sense heading cannot belong to any
   * structured sense. Diagnose only explicit nonblank semantic fields there;
   * ordinary introductory prose remains valid and intentionally ignored.
   */
  const prefix = sensesSection.slice(0, matches[0].index ?? 0);
  if (containsNonBlankSemanticField(prefix)) {
    diagnostics.push({
      code: "dictionary.senses.unowned-semantic-field",
      severity: "warning",
      field: "Senses",
      message:
        "The Senses section contains structured semantic fields before the " +
        "first recognized Sense heading. The source file was not modified, " +
        "and Workbench did not guess which sense owns those fields.",
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = (match.index ?? 0) + match[0].length;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? sensesSection.length)
        : sensesSection.length;

    const block = sensesSection.slice(start, end);
    const result = parseSenseBlock(block);

    if (result.sense) senses.push(result.sense);
    diagnostics.push(...result.diagnostics);
  }

  return { senses, diagnostics };
}

/**
 * Compatibility parser for callers that only need successfully interpreted
 * senses. Diagnostic-aware inventory loading should use
 * interpretLexicalSenses() instead so recognized omissions remain observable.
 */
export function parseLexicalSenses(markdown: string): LexicalSense[] {
  return interpretLexicalSenses(markdown).senses;
}

/**
 * Extract only the contents of the `## Senses` section.
 *
 * The section ends at the next level-2 Markdown heading or at end of file.
 * Keeping this logic here prevents unrelated note sections from being
 * interpreted as lexical-sense fields.
 */
function extractSensesSection(markdown: string): string | null {
  const headingRe = /^##\s+Senses\s*$/im;
  const match = headingRe.exec(markdown);
  if (!match || match.index === undefined) return null;

  const start = match.index + match[0].length;
  const remaining = markdown.slice(start);

  const nextHeading = /^##\s+.+$/m.exec(remaining);
  const end = nextHeading?.index ?? remaining.length;

  return remaining.slice(0, end);
}

/**
 * Parse one sense block.
 *
 * Fields are intentionally small in v0.1. More semantic information can be
 * added later without changing the simple-entry format.
 */
function parseSenseBlock(block: string): {
  sense: LexicalSense | null;
  diagnostics: WorkbenchDiagnostic[];
} {
  const diagnostics: WorkbenchDiagnostic[] = [];
  const id = readField(block, "ID");
  const gloss = readField(block, "Gloss");
  const definition = readField(block, "Definition");
  const lookupRaw = readField(block, "Lookup");

  const lookupTerms = lookupRaw
    ?.split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

  /*
   * A nonblank Lookup field containing no actual terms is positively
   * structured input that Workbench cannot use. Report that fact without
   * inventing a lookup term or invalidating the surrounding lexical entry.
   */
  if (lookupRaw && (!lookupTerms || lookupTerms.length === 0)) {
    diagnostics.push({
      code: "dictionary.senses.unusable-lookup",
      severity: "warning",
      field: "Senses / Lookup",
      message:
        "A structured sense Lookup field contained no usable lookup terms. " +
        "The source file was not modified.",
    });
  }

  // An ID is a reference aid, not semantic content. Ignore empty sense blocks
  // so unfinished headings do not become meaningless DictionaryEntry data.
  const hasMeaning =
    Boolean(gloss?.trim()) ||
    Boolean(definition?.trim()) ||
    Boolean(lookupTerms && lookupTerms.length > 0);

  if (!hasMeaning) {
    return { sense: null, diagnostics };
  }

  return {
    sense: {
      id: id?.trim() || undefined,
      gloss: gloss?.trim() || undefined,
      definition: definition?.trim() || undefined,
      lookupTerms:
        lookupTerms && lookupTerms.length > 0 ? lookupTerms : undefined,
    },
    diagnostics,
  };
}

/**
 * Detect supported semantic fields that contain actual creator-authored
 * content. Blank fields are intentionally excluded: an unfinished template is
 * not enough evidence to classify the creator's semantic analysis as invalid.
 */
function containsNonBlankSemanticField(block: string): boolean {
  return ["Gloss", "Definition", "Lookup"].some(
    (label) => readField(block, label) !== undefined,
  );
}

/**
 * Read a bold Markdown field such as:
 *
 * **Gloss:** water current
 *
 * For v0.1 the field value is read from the same line. Multi-line semantic
 * prose can be supported later once we define how continuation lines should
 * behave unambiguously.
 */
function readField(block: string, label: string): string | undefined {
  const escaped = escapeRegExp(label);
  // Only horizontal whitespace may separate the field marker from its value.
  // `\\s*` would also consume newlines, allowing an empty field such as
  // `**Gloss:**` to steal the following structured field as its value.
  // The v0.1 format is explicitly same-line, so keep that boundary strict.
  const re = new RegExp(`^\\*\\*${escaped}:\\*\\*[ \\t]*(.*)$`, "im");

  const match = re.exec(block);
  const value = match?.[1]?.trim();

  return value || undefined;
}

/**
 * Escape text before inserting it into a regular expression.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
