import { classifySelectionLookup } from "./selection-lookup";

/**
 * Result of interpreting user-provided text for the general Lookup command.
 *
 * `sourceText` always preserves exactly what the caller supplied.
 *
 * A valid result contains `lookupText`, which may exclude harmless outer
 * punctuation/whitespace but must never be manufactured by deleting internal
 * separators or other meaningful characters.
 */
export type LookupQueryIntent =
  | {
      kind: "valid";
      sourceText: string;
      lookupText: string;
    }
  | {
      kind: "invalid";
      sourceText: string;
    };

/**
 * Decide whether arbitrary user-provided text grants authority for lookup.
 *
 * The general Lookup command accepts both:
 * - one lexical word;
 * - a whitespace-separated lexical phrase.
 *
 * Unlike Preview-to-English, a phrase does not need an additional confirmation
 * step here because invoking Lookup is already an explicit request to search
 * the selected expression.
 *
 * This function performs no dictionary lookup, normalization, source mutation,
 * or UI work. It only establishes the authority boundary for the command.
 */
export function classifyLookupQuery(sourceText: string): LookupQueryIntent {
  const intent = classifySelectionLookup(sourceText);

  if (intent.kind === "invalid") {
    return {
      kind: "invalid",
      sourceText,
    };
  }

  return {
    kind: "valid",
    sourceText,
    lookupText: intent.lookupText,
  };
}
