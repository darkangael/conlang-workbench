/**
 * Shared language-membership policy for canonical linguistic sources.
 *
 * This module deliberately has no vault/file-writing authority. Resolving a
 * source's runtime membership must never rewrite creator-authored `language:`
 * metadata.
 */

export type LanguageMembershipMode = "folder" | "respect-explicit";

export interface LanguageMembershipResult {
  accepted: boolean;
  runtimeLanguage?: string;
  explicitMismatch: boolean;
}

/**
 * Resolve an optional explicit language name against the language assigned to
 * the configured canonical source.
 *
 * Folder authority:
 *   The configured canonical source establishes runtime membership. A stale or
 *   different `language:` value remains preserved in the source file.
 *
 * Respect explicit metadata:
 *   Preserve the historical Workbench behavior. If both values exist and
 *   disagree, the source is rejected from this configured language.
 */
export function resolveLanguageMembership(
  configuredLanguage: string | undefined,
  explicitLanguage: string | undefined,
  mode: LanguageMembershipMode,
): LanguageMembershipResult {
  const configured = configuredLanguage?.trim() || undefined;
  const explicit = explicitLanguage?.trim() || undefined;

  const explicitMismatch =
    Boolean(configured && explicit) && configured !== explicit;

  if (mode === "respect-explicit" && explicitMismatch) {
    return {
      accepted: false,
      runtimeLanguage: explicit,
      explicitMismatch: true,
    };
  }

  return {
    accepted: true,
    runtimeLanguage: configured ?? explicit,
    explicitMismatch,
  };
}
