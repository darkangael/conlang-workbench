import type { LanguageConfig } from "./types";
import type { LanguageSourceChangeValidationResult } from "./language-root-authority";

/**
 * The canonical folder-backed inventories that currently participate in the
 * language-source preflight and runtime reload.
 *
 * Keep this list aligned with the inventories that are actually wired into
 * preflightLanguageSources() and reloadActiveLanguage(). Future Markdown-backed
 * Cypher and Inflection sources should join this authority path when those
 * inventories are implemented; they should not gain a separate settings-only
 * source mutation mechanism.
 */
export type CanonicalFolderSetting =
  "dictionaryFolder" | "morphemeFolder" | "exampleFolder" | "phonologyFolder";

export type LanguageSourceReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

export type LanguageSourceStateResult =
  | { status: "applied"; dictionaryCount?: number }
  | { status: "invalid-request"; error: string }
  | { status: "save-failed"; error: unknown }
  | { status: "blocked" }
  | { status: "rollback-save-failed"; error: unknown }
  | { status: "reload-failed"; error: unknown };

export interface ApplyLanguageSourceStateRequest {
  /**
   * The exact LanguageConfig object whose canonical source is being changed.
   *
   * The transaction mutates this object only after validating the request so
   * callers do not need to replace LanguageConfig instances or re-find them by
   * array position.
   */
  language: LanguageConfig;

  /**
   * Active-language names from the configuration state that currently owns
   * runtime language authority.
   *
   * An inactive language has no loaded inventory to synchronize immediately,
   * so its source change can be persisted without forcing a reload. H3 will
   * still validate that source before the language can later become active.
   */
  activeLanguages: readonly string[];

  setting: CanonicalFolderSetting;

  /**
   * Required dictionaryFolder receives a string. Optional canonical inventories
   * may use undefined to mean "no canonical source configured".
   *
   * Structural ownership, path syntax, existence, and folder type are checked
   * proactively by validate() before mutation. This applies to inactive
   * languages too; activation state does not weaken source-edit authority.
   */
  value: string | undefined;

  /**
   * Read-only proactive authority check.
   *
   * This callback runs before LanguageConfig is mutated or settings are saved.
   * Production supplies the vault-aware structural validation; tests can
   * exercise transaction ordering without importing Obsidian.
   */
  validate: () => LanguageSourceChangeValidationResult;

  /**
   * In production this is ConlangPlugin.saveSettings(). Tests provide a small
   * stand-in so this security-sensitive transaction can be exercised without
   * importing Obsidian.
   */
  save: () => Promise<void>;

  /**
   * In production this is ConlangPlugin.reloadActiveLanguage().
   *
   * A returned "blocked" result means H3 preflight refused the reload before
   * candidate preparation. A thrown error can occur later while preparing the
   * detached candidate runtime. Neither path commits replacement runtime state,
   * so restoring and re-saving the previous source configuration is safe.
   */
  reload: () => Promise<LanguageSourceReloadResult>;
}

function getSourceValue(
  language: LanguageConfig,
  setting: CanonicalFolderSetting,
): string | undefined {
  return language[setting];
}

function setSourceValue(
  language: LanguageConfig,
  setting: CanonicalFolderSetting,
  value: string | undefined,
): void {
  /*
   * dictionaryFolder is required by LanguageConfig, while the other canonical
   * folder settings are optional. Rejecting an absent dictionary value before
   * reaching this helper lets this assignment remain type-safe without using
   * an unsafe cast.
   */
  if (setting === "dictionaryFolder") {
    language.dictionaryFolder = value!;
    return;
  }

  language[setting] = value;
}

/**
 * Establish a requested canonical source configuration as one transaction.
 *
 * For an active language, persistence alone is not enough: the requested
 * source must also become the source used by the runtime inventories. If H3
 * preflight blocks that reload, the old runtime is known to be untouched, so
 * the previous source configuration is restored and persisted.
 *
 * For an inactive language there is no loaded inventory for that language to
 * synchronize yet, so a successfully validated source change does not force a
 * reload. Structural/root/existence authority is nevertheless checked before
 * persistence; activation state never weakens source-edit safety.
 */
export async function applyLanguageSourceState(
  request: ApplyLanguageSourceStateRequest,
): Promise<LanguageSourceStateResult> {
  const { language, activeLanguages, setting, value, validate, save, reload } =
    request;

  /*
   * Refuse unauthorized source changes before either in-memory configuration or
   * persisted settings can change. A validation refusal therefore requires no
   * rollback at all.
   */
  const validation = validate();

  if (validation.status === "invalid") {
    return {
      status: "invalid-request",
      error: validation.detail,
    };
  }

  /*
   * Keep this narrow check as defense in depth. Production validation already
   * rejects a blank dictionary folder, but the transaction itself should still
   * preserve LanguageConfig's required-field invariant.
   */
  if (setting === "dictionaryFolder" && !value?.trim()) {
    return {
      status: "invalid-request",
      error: "the dictionary folder cannot be blank",
    };
  }

  const previousValue = getSourceValue(language, setting);
  const isActive = activeLanguages.includes(language.name);

  setSourceValue(language, setting, value);

  try {
    await save();
  } catch (error) {
    /*
     * The requested configuration was not successfully persisted. Restore the
     * in-memory value immediately. There is no successful requested save to
     * compensate for, so a second persistence attempt is not justified here.
     */
    setSourceValue(language, setting, previousValue);
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
     * "blocked" means H3 rejected the requested sources before touching the
     * previous runtime state. Restore the source configuration that still
     * corresponds to that untouched runtime, then persist the rollback.
     */
    setSourceValue(language, setting, previousValue);

    try {
      await save();
    } catch (error) {
      return { status: "rollback-save-failed", error };
    }

    return { status: "blocked" };
  } catch (error) {
    /*
     * Runtime candidates are prepared off to the side and installed only after
     * all loaders succeed. A thrown preparation error therefore leaves the old
     * runtime authoritative. Restore its source configuration and persist that
     * rollback before reporting the original reload failure.
     */
    setSourceValue(language, setting, previousValue);

    try {
      await save();
    } catch (rollbackError) {
      return { status: "rollback-save-failed", error: rollbackError };
    }

    return { status: "reload-failed", error };
  }
}
