import { WORD_RE } from "./word-tokens";

/**
 * Describe how an explicit editor selection may safely participate in lexical
 * lookup.
 *
 * `sourceText` always preserves the exact text the user selected.
 *
 * `lookupText` is derived only when the selection can be interpreted without
 * manufacturing a new lexical token:
 * - boundary punctuation may be left outside a single lexical token;
 * - multiple words may form a phrase candidate only when the content between
 *   those words is whitespace;
 * - punctuation or other non-whitespace content between separate words makes
 *   the selection invalid rather than silently deleting that content.
 */
export type SelectionLookupIntent =
  | {
      kind: "single-word";
      sourceText: string;
      lookupText: string;
    }
  | {
      kind: "phrase";
      sourceText: string;
      lookupText: string;
    }
  | {
      kind: "invalid";
      sourceText: string;
    };

/**
 * Classify an explicit editor selection for later lookup.
 *
 * This function deliberately does NOT perform dictionary lookup, translation,
 * UI confirmation, or source mutation. It only decides whether the selected
 * text can safely be interpreted as one lexical token, a multi-word phrase
 * candidate, or neither.
 *
 * The shared WORD_RE defines what Workbench currently considers a lexical
 * word. We clone it here because regular expressions with the global `g` flag
 * keep iteration state (`lastIndex`) and should not be shared across callers.
 */
export function classifySelectionLookup(
  sourceText: string,
): SelectionLookupIntent {
  const wordRe = new RegExp(WORD_RE.source, "gu");

  const matches: Array<{ text: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = wordRe.exec(sourceText)) !== null) {
    matches.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // No lexical token exists in the selection, so there is nothing that can be
  // looked up without inventing content.
  if (matches.length === 0) {
    return { kind: "invalid", sourceText };
  }

  // Material outside the first and last lexical tokens may be ignored only
  // when it is ordinary boundary punctuation or whitespace. Digits, currency
  // symbols, emoji, or other arbitrary characters must not silently disappear
  // and thereby grant a different lookup expression authority.
  const leadingBoundary = sourceText.slice(0, matches[0].start);
  const trailingBoundary = sourceText.slice(matches[matches.length - 1].end);

  const isSafeBoundary = (text: string): boolean =>
    /^[\s\p{P}]*$/u.test(text);

  if (
    !isSafeBoundary(leadingBoundary) ||
    !isSafeBoundary(trailingBoundary)
  ) {
    return { kind: "invalid", sourceText };
  }

  // Exactly one lexical token is safe to look up once its surrounding material
  // has passed the boundary check above.
  //
  // Examples:
  //   "varu"   -> "varu"
  //   "varu,"  -> "varu"
  //   "(varu)" -> "varu"
  if (matches.length === 1) {
    return {
      kind: "single-word",
      sourceText,
      lookupText: matches[0].text,
    };
  }

  // More than one lexical token is a phrase candidate only when every gap
  // between adjacent words contains whitespace and nothing else.
  //
  // This is the critical H7 boundary:
  //   "varu kira" -> phrase candidate
  //   "varu/kira" -> invalid
  //   "varu.kira" -> invalid
  //
  // We preserve the original spacing in lookupText because the downstream
  // phrase/gloss machinery already understands whitespace and there is no need
  // to manufacture a rewritten form here.
  for (let i = 1; i < matches.length; i++) {
    const previous = matches[i - 1];
    const current = matches[i];
    const gap = sourceText.slice(previous.end, current.start);

    if (!/^\s+$/.test(gap)) {
      return { kind: "invalid", sourceText };
    }
  }

  return {
    kind: "phrase",
    sourceText,
    lookupText: sourceText.slice(matches[0].start, matches[matches.length - 1].end),
  };
}
