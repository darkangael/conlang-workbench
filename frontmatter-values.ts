/**
 * Shared helpers for interpreting frontmatter values safely.
 *
 * These helpers deliberately separate "a value exists" from "a value can be
 * meaningfully interpreted". JavaScript's nullish-coalescing operator (`??`)
 * only answers the first question, which means a malformed preferred field can
 * otherwise hide a perfectly usable compatibility alias.
 *
 * None of these functions mutate source Markdown or YAML.
 */

export interface FrontmatterCandidate {
  /** The source field name, retained so diagnostics can identify it later. */
  key: string;

  /** The raw value supplied by the source parser. */
  value: unknown;
}

export interface ParsedFrontmatterValue<T> {
  /** First candidate successfully interpreted by the supplied parser. */
  value?: T;

  /** Field that supplied `value`, when one was successfully interpreted. */
  key?: string;

  /**
   * Present fields that the parser could not interpret.
   *
   * Keeping this information gives a future diagnostics layer enough context
   * to explain recovery without making feature modules understand raw YAML.
   */
  rejectedKeys: string[];
}

/**
 * Interpret a simple YAML scalar as text.
 *
 * Strings remain strings. Numbers and booleans may be tolerated as textual
 * scalars in readers that deliberately support that compatibility behavior.
 *
 * Arrays and objects are not stringified because doing so would manufacture
 * text such as "[object Object]" that the author did not supply.
 */
export function parseYamlScalarText(value: unknown): string | undefined {
  if (typeof value === "string") return value;

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

/**
 * Interpret a simple YAML scalar as nonblank trimmed text.
 *
 * This is useful when choosing among compatibility aliases. A present-but-
 * blank preferred field is not usable data and therefore must not prevent a
 * later valid alias from being considered.
 */
export function parseNonBlankYamlScalarText(
  value: unknown,
): string | undefined {
  const parsed = parseYamlScalarText(value)?.trim();
  return parsed ? parsed : undefined;
}

/**
 * Interpret only actual strings.
 *
 * Stricter parsers, such as the current phonology parser, can use this without
 * inheriting the scalar tolerance used by dictionary or morpheme readers.
 */
export function parseYamlString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Interpret only an actual, nonblank YAML string.
 *
 * This is the strict-string counterpart to parseNonBlankYamlScalarText().
 * It is useful for readers such as phonology that intentionally do not coerce
 * numbers or booleans into text, while still allowing alias recovery when a
 * preferred field is blank.
 */
export function parseNonBlankYamlString(
  value: unknown,
): string | undefined {
  const parsed = parseYamlString(value)?.trim();
  return parsed ? parsed : undefined;
}

/**
 * Return the first PRESENT candidate that the supplied parser can USE.
 *
 * This intentionally differs from:
 *
 *     preferred ?? fallback
 *
 * because `??` stops at any non-null value even when that value has the wrong
 * structure. Malformed preferred fields are remembered in rejectedKeys while
 * later supported aliases still get an opportunity to recover the value.
 */
export function firstParsedFrontmatterValue<T>(
  candidates: FrontmatterCandidate[],
  parser: (value: unknown) => T | undefined,
): ParsedFrontmatterValue<T> {
  const rejectedKeys: string[] = [];

  for (const candidate of candidates) {
    if (candidate.value === undefined || candidate.value === null) {
      continue;
    }

    const parsed = parser(candidate.value);

    if (parsed !== undefined) {
      return {
        value: parsed,
        key: candidate.key,
        rejectedKeys,
      };
    }

    rejectedKeys.push(candidate.key);
  }

  return { rejectedKeys };
}
