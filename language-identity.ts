import type { LanguageConfig } from "./types";

export type LanguageRenameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: "blank" | "duplicate" | "unchanged" };

export type ConfiguredLanguageWorkbenchIdentityValidation =
  | { ok: true }
  | {
      ok: false;
      reason: "missing";
      languageIndex: number;
      languageName: string;
    }
  | {
      ok: false;
      reason: "duplicate";
      workbenchID: string;
      firstLanguageIndex: number;
      firstLanguageName: string;
      duplicateLanguageIndex: number;
      duplicateLanguageName: string;
    };

/**
 * Validate the stable local identities of the complete configured-language
 * collection after legacy migration has had an opportunity to establish any
 * legitimately missing IDs.
 *
 * This is a semantic authority check, not persisted representation decoding.
 * A missing or duplicate ID makes configured objects ambiguous, so callers must
 * fail closed rather than choosing a winner or silently manufacturing a repair.
 */
export function validateConfiguredLanguageWorkbenchIdentities(
  languages: readonly LanguageConfig[],
): ConfiguredLanguageWorkbenchIdentityValidation {
  const seen = new Map<
    string,
    { languageIndex: number; languageName: string }
  >();

  for (let index = 0; index < languages.length; index += 1) {
    const language = languages[index];
    const workbenchID = language.workbenchID?.trim();

    if (!workbenchID) {
      return {
        ok: false,
        reason: "missing",
        languageIndex: index,
        languageName: language.name,
      };
    }

    const prior = seen.get(workbenchID);

    if (prior) {
      return {
        ok: false,
        reason: "duplicate",
        workbenchID,
        firstLanguageIndex: prior.languageIndex,
        firstLanguageName: prior.languageName,
        duplicateLanguageIndex: index,
        duplicateLanguageName: language.name,
      };
    }

    seen.set(workbenchID, {
      languageIndex: index,
      languageName: language.name,
    });
  }

  return { ok: true };
}

/**
 * Check whether one newly created configured-language Workbench ID is already
 * claimed by settled settings authority.
 *
 * Existing legacy fixtures may omit workbenchID, so this narrow creator helper
 * checks only actual claims. Production startup separately establishes and
 * validates the stronger complete-collection invariant before creation can run.
 */
export function findConfiguredLanguageWorkbenchIDConflict(
  candidateWorkbenchID: string,
  existingLanguages: readonly LanguageConfig[],
): LanguageConfig | null {
  return (
    existingLanguages.find(
      (language) => language.workbenchID === candidateWorkbenchID,
    ) ?? null
  );
}

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
