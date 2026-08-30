import type { GlossToken } from "./gloss";
import type { DictionaryEntry } from "./types";

/**
 * Why an authoritative translation commit could not resolve one source item.
 *
 * These are deliberately different states:
 *
 * - "missing" means no creator-authored lexical entry established a
 *   translation. A cypher suggestion may exist, but generated text is not
 *   authoritative vocabulary.
 * - "ambiguous" means creator-authored lexical data supplied more than one
 *   possible destination entry. Mutation must not silently choose one.
 * - "unsupported" is a conservative fallback for a token kind that the commit
 *   planner does not know how to authorize safely.
 */
export type TranslationCommitUnresolvedReason =
  | "missing"
  | "ambiguous"
  | "unsupported";

export interface TranslationCommitUnresolved {
  source: string;
  reason: TranslationCommitUnresolvedReason;

  /**
   * Optional exploratory cypher output.
   *
   * This may be useful to display when helping the creator coin a missing
   * word, but its presence never turns a missing item into an authoritative
   * dictionary match.
   */
  suggestion?: string;

  /**
   * Candidate lexical entries when the dictionary supplied more than one
   * possible translation.
   *
   * Retaining the candidates now allows a later sense/entry chooser to resolve
   * ambiguity without making this safety boundary guess.
   */
  candidates?: DictionaryEntry[];
}

/**
 * How one successfully resolved lexical item can safely be represented in the
 * creator's Markdown note.
 *
 * "known-wikilink" means both the lexical translation and its Obsidian link
 * representation are safe.
 *
 * "known-plain-text" is still a fully known lexical translation. Only the
 * optional wikilink representation is unsafe, so the creator-authored target
 * form is preserved literally instead of rewriting the language to satisfy
 * Markdown syntax.
 */
export type TranslationCommitRepresentation =
  | "known-wikilink"
  | "known-plain-text";

export interface TranslationCommitResolved {
  source: string;
  target: string;
  representation: TranslationCommitRepresentation;
}

/**
 * The plan separates unresolved lexical authority from successfully resolved
 * representation.
 *
 * This is a TypeScript discriminated union: callers inspect `status` first,
 * and TypeScript then knows which fields are available on that branch.
 *
 * A blocked plan contains no replacement at all. There is intentionally no
 * partially writable result: one unresolved lexical item blocks the whole
 * replacement.
 *
 * A ready plan records how each lexical piece will be represented so the later
 * confirmation UI can explain plain-text fallbacks accurately.
 */
export type TranslationCommitPlan =
  | {
      status: "ready";
      translated: string;
      replacement: string;
      resolved: TranslationCommitResolved[];
    }
  | {
      status: "blocked";
      unresolved: TranslationCommitUnresolved[];
    };

/**
 * Deduplicate entry references while preserving their original order.
 *
 * Structured senses can cause several EnglishLookupMatch objects to point to
 * the same lexical entry. That is not true ambiguity: if every matching sense
 * leads to the same creator-authored word, the destination is still unique.
 */
function uniqueCandidates(token: GlossToken): DictionaryEntry[] {
  const entries =
    token.englishMatches?.map((match) => match.entry) ??
    token.candidates ??
    [];

  return Array.from(new Set(entries));
}

/**
 * `|` separates a wikilink destination from its alias, while `]` can terminate
 * the link syntax. If either creator-authored side contains one of those
 * structural characters, do not escape, delete, or reinterpret it.
 *
 * Instead we preserve the target lexical form as literal text. Wikilink safety
 * is a Markdown representation concern, not a judgment about whether a
 * language's lexical form is valid.
 */
function isWikilinkSafe(value: string): boolean {
  return !/[|\]]/.test(value);
}

/**
 * Choose the safe Markdown representation for one established lexical match.
 *
 * The returned `target` always remains the creator-authored lexical form.
 * `replacement` is either the normal directional wikilink:
 *
 *     water -> [[DeWa|water]]
 *
 * or the target form itself when the source or target cannot safely occupy
 * Obsidian wikilink syntax.
 */
function resolveKnownTranslation(
  entry: DictionaryEntry,
  source: string,
): {
  translated: string;
  replacement: string;
  resolved: TranslationCommitResolved;
} {
  const target = entry.word;
  const wikilinkSafe = isWikilinkSafe(target) && isWikilinkSafe(source);

  return {
    translated: target,
    replacement: wikilinkSafe
      ? `[[${target}|${source}]]`
      : target,
    resolved: {
      source,
      target,
      representation: wikilinkSafe
        ? "known-wikilink"
        : "known-plain-text",
    },
  };
}

/**
 * Build an authoritative commit plan from the existing gloss pipeline.
 *
 * This module deliberately does NOT perform dictionary lookup, cypher
 * generation, UI, or vault/editor mutation. `gloss.ts` remains responsible for
 * linguistic resolution; this module only decides whether those results carry
 * enough creator-authored authority to modify a note.
 *
 * Safety rules:
 *
 * 1. Separators are preserved exactly.
 * 2. A dictionary/phrase match is usable only when it resolves to exactly one
 *    lexical destination.
 * 3. Multiple distinct destination entries are ambiguous and block the whole
 *    operation.
 * 4. Cypher fallback is exploratory, not established vocabulary, so it blocks
 *    commit even when it produced a plausible-looking word.
 * 5. No-match also blocks commit.
 * 6. Any token kind not explicitly authorized fails conservatively.
 */
export function buildEnglishToConlangCommitPlan(
  tokens: GlossToken[],
): TranslationCommitPlan {
  const translatedParts: string[] = [];
  const replacementParts: string[] = [];
  const resolved: TranslationCommitResolved[] = [];
  const unresolved: TranslationCommitUnresolved[] = [];

  for (const token of tokens) {
    if (token.kind === "separator") {
      translatedParts.push(token.source);
      replacementParts.push(token.source);
      continue;
    }

    if (token.kind === "dictionary" || token.kind === "phrase") {
      const candidates = uniqueCandidates(token);

      if (candidates.length === 1) {
        const known = resolveKnownTranslation(candidates[0], token.source);

        translatedParts.push(known.translated);
        replacementParts.push(known.replacement);
        resolved.push(known.resolved);
        continue;
      }

      unresolved.push({
        source: token.source,
        reason: candidates.length === 0 ? "unsupported" : "ambiguous",
        ...(candidates.length > 0 ? { candidates } : {}),
      });
      continue;
    }

    if (token.kind === "cypher-fallback") {
      unresolved.push({
        source: token.source,
        reason: "missing",
        ...(token.cypherOutput
          ? { suggestion: token.cypherOutput }
          : {}),
      });
      continue;
    }

    if (token.kind === "no-match") {
      unresolved.push({
        source: token.source,
        reason: "missing",
      });
      continue;
    }

    /**
     * English -> conlang currently should not produce "inflected" tokens, but
     * this is an authority boundary rather than a place to rely on that
     * implementation detail. If the gloss pipeline grows later, an unfamiliar
     * token must not silently become permission to mutate creator text.
     */
    unresolved.push({
      source: token.source,
      reason: "unsupported",
    });
  }

  if (unresolved.length > 0) {
    return {
      status: "blocked",
      unresolved,
    };
  }

  return {
    status: "ready",
    translated: translatedParts.join(""),
    replacement: replacementParts.join(""),
    resolved,
  };
}
