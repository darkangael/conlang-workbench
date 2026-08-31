import type { LanguageConfig } from "./types";
import type { LanguageProfilePathValidationResult } from "./language-profile";

export type LanguageProfileReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

export type LanguageProfileStateResult =
  | { status: "applied"; dictionaryCount?: number }
  | { status: "invalid-request"; error: string }
  | { status: "save-failed"; error: unknown }
  | { status: "blocked" }
  | { status: "rollback-save-failed"; error: unknown }
  | { status: "reload-failed"; error: unknown };

export interface ApplyLanguageProfileStateRequest {
  /**
   * Exact configured language whose optional canonical profile is changing.
   *
   * The transaction preserves this object rather than replacing it because
   * other runtime and UI code may already hold its identity.
   */
  language: LanguageConfig;

  /**
   * Languages currently contributing linguistic runtime state.
   *
   * An inactive language has no loaded LanguageProfile or profile-derived
   * language_id to synchronize immediately, so a validated persisted change
   * does not require a reload until that language is later activated.
   */
  activeLanguages: readonly string[];

  /**
   * Requested canonical profile path. Undefined explicitly removes the optional
   * profile rather than representing an invalid blank path.
   */
  profilePath: string | undefined;

  /**
   * Read-only validation performed before either memory or persistence changes.
   *
   * Production validates path safety, file/Markdown identity, and the existing
   * Language Profile frontmatter contract. Profiles may legitimately live
   * outside the configured language root.
   */
  validate: () => LanguageProfilePathValidationResult;

  /**
   * Persist the complete plugin settings object.
   *
   * Production supplies ConlangPlugin.saveSettings(); tests use a small
   * stand-in so the authority transaction remains independently testable.
   */
  save: () => Promise<void>;

  /**
   * Re-establish active linguistic runtime authority.
   *
   * A returned "blocked" result proves H3 source preflight rejected the reload
   * before any existing profiles or inventories were replaced. A thrown error
   * does not provide that guarantee and therefore cannot justify rollback.
   */
  reload: () => Promise<LanguageProfileReloadResult>;
}

/**
 * Establish one requested Language Profile path as configuration and runtime
 * authority.
 *
 * For active languages, profile identity feeds the morpheme, linguistic-example,
 * and phonology loaders. Persistence alone is therefore insufficient: a
 * successful active-language change must also rebuild those inventories using
 * the newly loaded profile.
 *
 * Failure handling mirrors the proven source-authority boundary:
 *
 * 1. Invalid requests fail before mutation.
 * 2. Initial save failure restores the previous in-memory path.
 * 3. Inactive languages stop after successful persistence because they have no
 *    loaded profile-derived runtime state.
 * 4. A preflight-blocked active reload restores and re-persists the previous
 *    path because runtime state is proven untouched.
 * 5. A thrown post-preflight reload error does not roll settings back because
 *    runtime replacement may already have begun.
 */
export async function applyLanguageProfileState(
  request: ApplyLanguageProfileStateRequest,
): Promise<LanguageProfileStateResult> {
  const { language, activeLanguages, profilePath, validate, save, reload } =
    request;

  const validation = validate();

  if (validation.status === "invalid") {
    return {
      status: "invalid-request",
      error: validation.error,
    };
  }

  const previousProfilePath = language.profilePath;
  const isActive = activeLanguages.includes(language.name);

  language.profilePath = profilePath;

  try {
    await save();
  } catch (error) {
    /*
     * The requested profile was never successfully persisted, and runtime
     * reload has not begun. Restoring memory is therefore both sufficient and
     * safe; no compensating save is warranted.
     */
    language.profilePath = previousProfilePath;
    return { status: "save-failed", error };
  }

  if (!isActive) {
    return { status: "applied" };
  }

  try {
    const reloadResult = await reload();

    if (reloadResult.status === "loaded") {
      return {
        status: "applied",
        dictionaryCount: reloadResult.dictionaryCount,
      };
    }

    /*
     * H3's "blocked" contract proves reload stopped before clearing the old
     * Language Profile map or rebuilding inventories. Restore the configuration
     * that still corresponds to that untouched runtime and persist it.
     */
    language.profilePath = previousProfilePath;

    try {
      await save();
    } catch (error) {
      return { status: "rollback-save-failed", error };
    }

    return { status: "blocked" };
  } catch (error) {
    /*
     * Do not manufacture a rollback after an arbitrary reload exception.
     * reloadActiveLanguage() may already have replaced the profile map or one
     * of the profile-derived inventories. Keep the persisted requested path and
     * report the uncertain runtime state to the caller.
     */
    return { status: "reload-failed", error };
  }
}
