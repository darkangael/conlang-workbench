import { ConlangSettings, DEFAULT_SETTINGS } from "./types";

/**
 * Runtime validation for persisted settings whose valid values form a closed
 * set.
 *
 * TypeScript union types protect code while it is being compiled, but settings
 * loaded from disk are ordinary runtime data. A damaged, manually edited, or
 * older settings file can therefore contain values the TypeScript type says
 * should be impossible.
 *
 * Keep this validation at the load boundary so the rest of the plugin can rely
 * on these settings having one of their documented values.
 */
function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

/**
 * Repair closed-choice settings after persisted data has been merged with the
 * defaults.
 *
 * Only closed-choice fields are handled here. Free-form creator configuration
 * such as language names, folders, and linguistic rules must not be silently
 * rewritten merely because it is unusual.
 */
export function normalizeClosedChoiceSettings(settings: ConlangSettings): void {
  if (
    !isOneOf(settings.languageMembership, [
      "folder",
      "respect-explicit",
    ] as const)
  ) {
    settings.languageMembership = DEFAULT_SETTINGS.languageMembership;
  }

  if (
    !isOneOf(settings.commitWrapper, [
      "footnote-style",
      "html-tooltip",
      "wikilink",
    ] as const)
  ) {
    settings.commitWrapper = DEFAULT_SETTINGS.commitWrapper;
  }

  if (
    !isOneOf(settings.hoverModifier, ["none", "shift", "alt", "ctrl"] as const)
  ) {
    settings.hoverModifier = DEFAULT_SETTINGS.hoverModifier;
  }

  if (!isOneOf(settings.hoverFallback, ["cypher", "nothing"] as const)) {
    settings.hoverFallback = DEFAULT_SETTINGS.hoverFallback;
  }

  if (
    !isOneOf(settings.highlightStyle, [
      "underline",
      "italic",
      "background",
    ] as const)
  ) {
    settings.highlightStyle = DEFAULT_SETTINGS.highlightStyle;
  }
}
