import type { LanguageConfig } from "./types";

export type LanguageRenameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: "blank" | "duplicate" | "unchanged" };

/**
 * Validate a requested language rename without mutating settings.
 *
 * LanguageConfig.name still serves as runtime identity in the inherited alpha
 * settings model. Blank or duplicate names would therefore make language-
 * scoped lookup, active-language state, and primary-language state ambiguous.
 */
export function validateLanguageRename(
  languages: readonly LanguageConfig[],
  current: LanguageConfig,
  proposedName: string,
): LanguageRenameValidation {
  const name = proposedName.trim();

  if (!name) {
    return { ok: false, reason: "blank" };
  }

  if (name === current.name) {
    return { ok: false, reason: "unchanged" };
  }

  if (
    languages.some((language) => language !== current && language.name === name)
  ) {
    return { ok: false, reason: "duplicate" };
  }

  return { ok: true, name };
}

/*
 * FUTURE DAUGHTER-LANGUAGE CREATION ATTACHMENT POINT
 *
 * Daughter creation is NOT rename.
 *
 * A future daughter-language module should:
 *   1. copy the parent's canonical source trees to independent new folders;
 *   2. create a unique temporary identity for the copied language;
 *   3. register the daughter against only those copied canonical sources; and
 *   4. leave the parent language and its canonical files untouched.
 *
 * Parent and daughter must never point at the same canonical source folders.
 *
 * Do not rewrite creator-authored `language:` metadata merely to make the
 * daughter copy. Under the default Folder authority policy, the daughter's
 * newly configured canonical source folders establish runtime membership and
 * legacy `language:` values may remain unchanged until the creator chooses to
 * edit or remove them.
 *
 * When daughter creation is implemented, reuse this identity-validation
 * boundary rather than introducing a second naming policy.
 */
