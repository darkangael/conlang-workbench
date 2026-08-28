import { LexicalSense } from "./types";

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
export function parseLexicalSenses(markdown: string): LexicalSense[] {
  const sensesSection = extractSensesSection(markdown);
  if (!sensesSection) return [];

  const senses: LexicalSense[] = [];
  const senseHeadingRe = /^###\s+Sense\b.*$/gim;

  const matches = [...sensesSection.matchAll(senseHeadingRe)];
  if (matches.length === 0) return [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = (match.index ?? 0) + match[0].length;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? sensesSection.length)
        : sensesSection.length;

    const block = sensesSection.slice(start, end);
    const sense = parseSenseBlock(block);

    if (sense) senses.push(sense);
  }

  return senses;
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
function parseSenseBlock(block: string): LexicalSense | null {
  const id = readField(block, "ID");
  const gloss = readField(block, "Gloss");
  const definition = readField(block, "Definition");
  const lookupRaw = readField(block, "Lookup");

  const lookupTerms = lookupRaw
    ?.split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

  // An ID is a reference aid, not semantic content. Ignore empty sense blocks
  // so unfinished headings do not become meaningless DictionaryEntry data.
  const hasMeaning =
    Boolean(gloss?.trim()) ||
    Boolean(definition?.trim()) ||
    Boolean(lookupTerms && lookupTerms.length > 0);

  if (!hasMeaning) return null;

  return {
    id: id?.trim() || undefined,
    gloss: gloss?.trim() || undefined,
    definition: definition?.trim() || undefined,
    lookupTerms:
      lookupTerms && lookupTerms.length > 0 ? lookupTerms : undefined,
  };
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
  const re = new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.*)$`, "im");

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
