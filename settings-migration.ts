import type { ConlangSettings } from "./types";

/**
 * Evidence about which migration-sensitive settings fields were actually
 * present in the persisted representation before current defaults were merged.
 */
export interface LanguageSelectionMigrationEvidence {
  persistedActiveLanguages: boolean;
}

/**
 * Reconcile legacy single-active-language settings with the modern
 * activeLanguages/primaryLanguage model.
 *
 * The important authority boundary is field PRESENCE, not field VALUE:
 *
 * - if activeLanguages was persisted, it is modern creator authority and the
 *   obsolete activeLanguage field must not override it;
 * - if activeLanguages was absent, a legacy activeLanguage may seed the modern
 *   list before ordinary validation/fallback runs.
 *
 * This function only changes in-memory plugin settings. It never reads, writes,
 * renames, or repairs creator-authored vault sources.
 */
export function migrateLanguageSelectionSettings(
  settings: ConlangSettings,
  evidence: LanguageSelectionMigrationEvidence,
): void {
  const known = new Set(settings.languages.map((language) => language.name));

  /*
   * Defaults have already been merged by the persisted-settings decoder.
   * Therefore settings.activeLanguages may contain today's default even when
   * the legacy file never contained that field. Use the preserved presence
   * evidence to decide whether the obsolete single-language value still has
   * migration authority.
   */
  if (!evidence.persistedActiveLanguages && settings.activeLanguage) {
    settings.activeLanguages = [settings.activeLanguage];
  }

  /*
   * Keep only configured language names. A stale or removed language must not
   * remain active merely because its name survives in old settings.
   */
  settings.activeLanguages = (settings.activeLanguages ?? []).filter((name) =>
    known.has(name),
  );

  /*
   * Workbench requires a usable active language whenever at least one language
   * is configured. If neither modern nor valid legacy state supplies one, use
   * the first configured language as the existing compatibility fallback.
   */
  if (settings.activeLanguages.length === 0 && settings.languages.length > 0) {
    settings.activeLanguages = [settings.languages[0].name];
  }

  /*
   * Primary language must identify an active configured language. This also
   * repairs the default value injected into truly old settings after the
   * legacy active-language selection above has been preserved.
   */
  if (!settings.primaryLanguage || !known.has(settings.primaryLanguage)) {
    settings.primaryLanguage =
      settings.activeLanguages[0] ?? settings.languages[0]?.name ?? "";
  }

  if (
    settings.activeLanguages.length > 0 &&
    !settings.activeLanguages.includes(settings.primaryLanguage)
  ) {
    settings.primaryLanguage = settings.activeLanguages[0];
  }
}
