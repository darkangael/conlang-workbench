import type { DictionaryEntry } from "./types";

/**
 * Runtime support for stable lexical identity.
 *
 * A creator-authored `lexeme_id` identifies a lexeme linguistically. It is
 * deliberately separate from a note's path and from Workbench's internal
 * source identity. This index is derived from loaded dictionary entries; it is
 * not another source of authority and never writes identity back to Markdown.
 */

/**
 * Result of resolving one lexical ID within an optional language scope.
 *
 * `T extends DictionaryEntry` is a generic constraint: callers may preserve a
 * more specific DictionaryEntry subtype, but this type can only be used with
 * values that are DictionaryEntry-compatible.
 *
 * This is a discriminated union. TypeScript can inspect `status` and then know
 * the matching shape of `targets`:
 *
 * - `readonly []` means resolution found no target.
 * - `readonly [T]` is a one-element tuple and guarantees exactly one target.
 * - `readonly T[]` preserves every candidate when identity is ambiguous.
 *
 * Keeping ambiguity explicit is intentional. Duplicate IDs never authorize
 * Workbench to choose an arbitrary creator entry.
 */
export type LexicalIdentityResolution<T extends DictionaryEntry> =
  | {
      status: "unresolved";
      targets: readonly [];
    }
  | {
      status: "unique";
      targets: readonly [T];
    }
  | {
      status: "ambiguous";
      targets: readonly T[];
    };

/**
 * Comparison is three-valued because missing or ambiguous identity does not
 * provide enough authority to claim that two entries are either the same or
 * different lexeme.
 */
export type LexicalEquivalence = "same" | "different" | "indeterminate";

/**
 * IDs are compared using a normalized lookup key while the creator-authored
 * value itself remains untouched on the DictionaryEntry.
 */
function normalizeLexemeId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Restrict an ID match to the language authority supplied by the caller.
 *
 * Stable lexical IDs are not assumed to be globally unique across every
 * language loaded into Workbench. A supplied `languageId` and/or language name
 * narrows the candidates; when both are supplied, both must match. The stable
 * language ID supports canonical scoping while the name retains compatibility
 * with older material that may not have a language ID.
 */
function sharesLexicalLanguageScope(
  candidate: DictionaryEntry,
  languageId?: string,
  language?: string,
): boolean {
  if (languageId && candidate.languageId !== languageId) return false;
  if (language && candidate.language !== language) return false;

  return true;
}

/**
 * Derived in-memory index over the lexical entries loaded by Dictionary.
 *
 * The map stores arrays rather than a single DictionaryEntry because duplicate
 * creator-authored IDs are possible. Retaining every candidate lets resolution
 * report ambiguity instead of silently letting one entry overwrite another.
 */
export class LexicalIdentityIndex {
  private byId = new Map<string, DictionaryEntry[]>();

  clear(): void {
    this.byId.clear();
  }

  add(entry: DictionaryEntry): void {
    const key = entry.lexemeId ? normalizeLexemeId(entry.lexemeId) : "";
    if (!key) return;

    const entries = this.byId.get(key) ?? [];
    entries.push(entry);
    this.byId.set(key, entries);
  }

  /**
   * Resolve an ID without inventing certainty.
   *
   * Zero matches are unresolved, one match is unique, and multiple matches are
   * ambiguous. Callers can therefore fail closed when stable identity cannot
   * identify exactly one creator entry.
   */
  resolve(
    lexemeId: string,
    languageId?: string,
    language?: string,
  ): LexicalIdentityResolution<DictionaryEntry> {
    const key = normalizeLexemeId(lexemeId);

    if (!key) {
      return { status: "unresolved", targets: [] };
    }

    const targets = (this.byId.get(key) ?? []).filter((candidate) =>
      sharesLexicalLanguageScope(candidate, languageId, language),
    );

    if (targets.length === 0) {
      return { status: "unresolved", targets: [] };
    }

    if (targets.length === 1) {
      return { status: "unique", targets: [targets[0]] };
    }

    return { status: "ambiguous", targets };
  }

  /**
   * Compare two entries using stable lexical identity only.
   *
   * Missing identity or non-unique resolution is `indeterminate`: path,
   * spelling, or another identity domain must not be substituted to manufacture
   * an answer after stable lexical identity has proved insufficient.
   */
  compare(left: DictionaryEntry, right: DictionaryEntry): LexicalEquivalence {
    const leftId = left.lexemeId ? normalizeLexemeId(left.lexemeId) : "";
    const rightId = right.lexemeId ? normalizeLexemeId(right.lexemeId) : "";

    if (!leftId || !rightId) return "indeterminate";
    if (leftId !== rightId) return "different";

    // The `!` is TypeScript's non-null assertion, not boolean negation.
    // The missing-ID guard above has already proved both IDs exist here.
    const leftResolution = this.resolve(
      left.lexemeId!,
      left.languageId,
      left.language,
    );

    const rightResolution = this.resolve(
      right.lexemeId!,
      right.languageId,
      right.language,
    );

    if (
      leftResolution.status !== "unique" ||
      rightResolution.status !== "unique"
    ) {
      return "indeterminate";
    }

    // Each unique resolution returns the actual DictionaryEntry object held
    // by this index. Reference equality (`===`) therefore asks whether both
    // scoped IDs resolved to the very same loaded lexical entry.
    return leftResolution.targets[0] === rightResolution.targets[0]
      ? "same"
      : "different";
  }
}
