import { normalizeLexicalKey } from "./lexical-normalization";

/**
 * Minimal lexical value needed to resolve one creator-authored `parts` item.
 *
 * The resolver deliberately knows nothing about Obsidian, source records,
 * diagnostics, DOM elements, or file writers. It compares the same fields used
 * by the dictionary's derived headword/alias index while leaving every
 * creator-authored spelling untouched.
 */
export interface LexicalPartRelationshipValue {
  word: string;
  aliases?: readonly string[];
  language?: string;
  languageId?: string;
}

/**
 * Explicit relationship cardinality returned to every consumer.
 *
 * An array alone is easy to misuse by taking `[0]`. A named status makes the
 * caller acknowledge whether a target is missing, unique, or ambiguous before
 * it grants navigation or any future mutation authority.
 */
export type LexicalPartResolution<
  T extends LexicalPartRelationshipValue,
> =
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
 * Determine whether a candidate occupies the owning lexical entry's language
 * scope.
 *
 * Both supplied owner fields must match. Stable language identity prevents a
 * same-named but distinct language from becoming a target, while the readable
 * name preserves the current configured-language boundary and legacy behavior.
 *
 * An unscoped owner can resolve only another unscoped value. It must not borrow
 * a target from whichever configured language happened to load first.
 */
function sharesOwnerLanguage(
  owner: LexicalPartRelationshipValue,
  candidate: LexicalPartRelationshipValue,
): boolean {
  const ownerLanguageId = owner.languageId?.trim();
  const ownerLanguage = owner.language?.trim();

  if (ownerLanguageId && candidate.languageId?.trim() !== ownerLanguageId) {
    return false;
  }

  if (ownerLanguage && candidate.language?.trim() !== ownerLanguage) {
    return false;
  }

  if (!ownerLanguageId && !ownerLanguage) {
    return (
      !candidate.languageId?.trim() &&
      !candidate.language?.trim()
    );
  }

  return true;
}

/**
 * Return every headword or alias that can satisfy one compound-part reference.
 *
 * Case handling and NFC comparison mirror Dictionary's `byWord` index. Declared
 * inflected forms remain excluded because `parts` currently names lexical
 * headwords or aliases, not grammatical surface forms.
 */
export function resolveLexicalPart<
  T extends LexicalPartRelationshipValue,
>(
  owner: LexicalPartRelationshipValue,
  part: string,
  candidates: readonly T[],
  caseSensitive: boolean,
): LexicalPartResolution<T> {
  const partKey = normalizeLexicalKey(part, caseSensitive);

  const targets = candidates.filter((candidate) => {
    if (!sharesOwnerLanguage(owner, candidate)) return false;

    const candidateKeys = [
      candidate.word,
      ...(candidate.aliases ?? []),
    ].map((value) => normalizeLexicalKey(value, caseSensitive));

    return candidateKeys.includes(partKey);
  });

  if (targets.length === 0) {
    return {
      status: "unresolved",
      targets: [],
    };
  }

  if (targets.length === 1) {
    return {
      status: "unique",
      targets: [targets[0]],
    };
  }

  return {
    status: "ambiguous",
    targets,
  };
}
