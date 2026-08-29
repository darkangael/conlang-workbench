import { isWordChar } from "./word-tokens";

/**
 * A lexical word range expressed in UTF-16 offsets.
 *
 * JavaScript strings, Obsidian EditorPosition.ch values, DOM text offsets,
 * substring(), and slice() all use UTF-16 coordinates. Keep that coordinate
 * system at the API boundary even though the scanner itself must reason about
 * complete Unicode code points.
 */
export interface WordRange {
  start: number;
  end: number;
}

interface CodePointSpan {
  /** UTF-16 offset where this complete Unicode code point begins. */
  start: number;

  /** UTF-16 offset immediately after this complete Unicode code point. */
  end: number;

  /** The complete Unicode code point, never an isolated surrogate half. */
  text: string;

  /** Whether the current Workbench word grammar accepts this code point. */
  isWord: boolean;
}

/**
 * Split a JavaScript string into complete Unicode code points while retaining
 * the UTF-16 offsets required by Obsidian and DOM APIs.
 *
 * `for...of` is important here: unlike text[index], it iterates Unicode code
 * points, so supplementary-plane characters such as U+10400 are delivered as
 * one character rather than two UTF-16 surrogate halves.
 */
function collectCodePointSpans(text: string): CodePointSpan[] {
  const spans: CodePointSpan[] = [];
  let offset = 0;

  for (const codePoint of text) {
    const start = offset;

    // A BMP code point has length 1 in UTF-16. A supplementary-plane code
    // point has length 2 because JavaScript represents it as a surrogate pair.
    offset += codePoint.length;

    spans.push({
      start,
      end: offset,
      text: codePoint,
      isWord: isWordChar(codePoint),
    });
  }

  return spans;
}

/**
 * Find the lexical word touching a UTF-16 text offset.
 *
 * This preserves the old cursor semantics:
 *
 * - at the beginning of a word, inspect the word to the right;
 * - at the end of a word, the word to the left still counts;
 * - at a separator followed by a word, inspect the word to the right;
 * - inside either UTF-16 half of a supplementary-plane character, treat the
 *   complete Unicode code point as the character under the cursor.
 *
 * The scanner deliberately preserves the existing Workbench punctuation
 * grammar supplied by isWordChar(). Orthographic punctuation policy is a
 * separate deferred design question and is not broadened by this fix.
 */
export function findWordRangeAt(
  text: string,
  offset: number,
): WordRange | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
    return null;
  }

  if (text.length === 0) return null;

  const spans = collectCodePointSpans(text);
  if (spans.length === 0) return null;

  let anchor = -1;

  // First handle an offset that falls *inside* a multi-unit Unicode code
  // point. This is the case the former text[index] scanner could not handle.
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];

    if (span.start < offset && offset < span.end) {
      if (!span.isWord) return null;
      anchor = i;
      break;
    }
  }

  if (anchor === -1) {
    // Preserve the established boundary behavior by preferring a lexical
    // character immediately to the left of the cursor. For example, a cursor
    // immediately after "varu" still resolves "varu".
    for (let i = 0; i < spans.length; i++) {
      if (spans[i].end === offset && spans[i].isWord) {
        anchor = i;
        break;
      }
    }
  }

  if (anchor === -1) {
    // If the left side is not lexical, accept a lexical character beginning
    // exactly at the cursor. This covers the start of a word.
    for (let i = 0; i < spans.length; i++) {
      if (spans[i].start === offset && spans[i].isWord) {
        anchor = i;
        break;
      }
    }
  }

  if (anchor === -1) return null;

  let first = anchor;
  let last = anchor;

  // Expand by complete code points rather than UTF-16 code units.
  while (first > 0 && spans[first - 1].isWord) {
    first--;
  }

  while (last + 1 < spans.length && spans[last + 1].isWord) {
    last++;
  }

  return {
    start: spans[first].start,
    end: spans[last].end,
  };
}
