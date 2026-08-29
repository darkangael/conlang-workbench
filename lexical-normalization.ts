// Shared Unicode lexical-normalization helpers.
//
// Creator-authored spelling is authoritative. These helpers must never be
// used to rewrite dictionary notes, frontmatter, selections, or displayed
// text. Normalization exists only for derived comparison/index keys and for
// recognizing Unicode character classes safely.
//
// NFC is intentionally used rather than compatibility normalization (NFKC).
// Canonically equivalent spellings such as precomposed "š" and decomposed
// "s" + COMBINING CARON should compare as the same lexical spelling, while
// compatibility characters remain distinct.

/** True when the supplied Unicode character is a letter. */
export function isLexicalLetter(ch: string): boolean {
  return /^\p{L}$/u.test(ch);
}

/**
 * True when the supplied Unicode character is a combining mark.
 *
 * Marks are lexical continuation characters rather than standalone word
 * starters. This distinction lets decomposed graphemes remain intact without
 * granting a free-floating combining mark authority as a word by itself.
 */
export function isLexicalMark(ch: string): boolean {
  return /^\p{M}$/u.test(ch);
}

/**
 * True for Unicode letters or combining marks.
 *
 * This is useful for boundary-sensitive features such as the cypher engine,
 * where a combining mark following a base letter must not manufacture a word
 * boundary inside one decomposed grapheme.
 */
export function isLexicalBaseOrMark(ch: string): boolean {
  return /^[\p{L}\p{M}]$/u.test(ch);
}

/**
 * Create a derived key for comparing creator-authored lexical spellings.
 *
 * Case handling deliberately preserves the Workbench's current boolean
 * case-sensitive/case-insensitive policy. A later language-aware casing review
 * may replace that policy independently.
 *
 * Lowercasing happens before NFC normalization so the final derived key is
 * canonical even if case conversion itself produces a decomposed sequence.
 */
export function normalizeLexicalKey(
  text: string,
  caseSensitive: boolean,
): string {
  const cased = caseSensitive ? text : text.toLowerCase();
  return cased.normalize("NFC");
}
