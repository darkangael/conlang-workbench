import type { LanguageConfig } from "./types";

/**
 * The settings authority affected when one configured language is removed.
 *
 * LanguageConfig.name is still the inherited alpha identity used by
 * activeLanguages and primaryLanguage, so all three pieces of state must move
 * together inside one settings-authority transaction.
 */
export interface LanguageRemovalState {
  languages: LanguageConfig[];
  activeLanguages: string[];
  primaryLanguage: string;
}

/**
 * Result returned by the normal active-language reload boundary.
 *
 * Runtime reload is prepared against detached candidate inventories. A
 * returned "blocked" result means source preflight refused the requested
 * configuration, while a thrown error means candidate preparation failed.
 * Neither failure path replaces the currently authoritative runtime.
 */
export type LanguageRemovalReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

export type LanguageRemovalStateResult =
  | { status: "cancelled"; name: string }
  | { status: "target-missing" }
  | { status: "target-changed"; name: string }
  | { status: "applied"; name: string; dictionaryCount: number }
  | { status: "save-failed"; name: string; error: unknown }
  | { status: "blocked"; name: string }
  | { status: "rollback-save-failed"; name: string; error: unknown }
  | { status: "reload-failed"; name: string; error: unknown };

export interface ApplyLanguageRemovalStateRequest {
  /**
   * Complete mutable settings object whose language authority is changing.
   */
  state: LanguageRemovalState;

  /**
   * Exact LanguageConfig object selected by the UI.
   *
   * Object identity, rather than an array index or language name alone, is the
   * authorization target. This prevents a stale settings card from removing a
   * different language that later occupies the same array position.
   */
  language: LanguageConfig;

  /**
   * Ask the creator to authorize removal of the authoritative language name.
   *
   * IMPORTANT: production must call applyLanguageRemovalState() from inside the
   * plugin-wide SettingsAuthorityQueue. Because this callback is awaited by the
   * transaction, that queue remains held while the confirmation modal is open.
   * No other queued settings mutation can therefore change what the creator is
   * being asked to approve underneath their decision.
   */
  confirm: (name: string) => Promise<boolean>;

  /**
   * Persist the complete plugin settings object.
   */
  save: () => Promise<void>;

  /**
   * Re-establish runtime linguistic state after the persisted removal.
   *
   * Both a returned "blocked" result and a thrown candidate-preparation error
   * leave the previous runtime authoritative. The transaction can therefore
   * restore the settings snapshot after either failure.
   */
  reload: () => Promise<LanguageRemovalReloadResult>;
}

interface LanguageRemovalSnapshot {
  languages: LanguageConfig[];
  activeLanguages: string[];
  primaryLanguage: string;
}

function restoreLanguageRemoval(
  state: LanguageRemovalState,
  snapshot: LanguageRemovalSnapshot,
): void {
  /*
   * Restore fresh arrays so later mutations cannot accidentally share the
   * transaction's snapshot arrays.
   *
   * LanguageConfig objects themselves are deliberately preserved. Removal
   * never edits or replaces the selected configuration object; it only removes
   * that object from the configured-language collection.
   */
  state.languages = [...snapshot.languages];
  state.activeLanguages = [...snapshot.activeLanguages];
  state.primaryLanguage = snapshot.primaryLanguage;
}

/**
 * Remove one configured language as a complete settings/runtime transaction.
 *
 * Safety ordering:
 *
 * 1. Re-find the exact LanguageConfig object before reading its authoritative
 *    name or showing confirmation.
 * 2. Hold the caller's settings-authority boundary while confirmation is open.
 * 3. After explicit approval, revalidate the exact object and name as
 *    defense-in-depth before taking the rollback snapshot.
 * 4. Remove configuration only; never delete or rename vault folders/files.
 * 5. Persist the requested configuration before rebuilding runtime state.
 * 6. If reload is blocked or detached candidate preparation throws, restore
 *    the complete previous settings snapshot while old runtime remains live.
 * 7. Persist that compensating rollback before reporting the reload failure as
 *    safely restored.
 *
 * This module deliberately owns no Obsidian UI state. Expansion/collapse sets
 * are presentation state and remain the responsibility of Settings.
 */
export async function applyLanguageRemovalState(
  request: ApplyLanguageRemovalStateRequest,
): Promise<LanguageRemovalStateResult> {
  /*
   * Do not ask the creator to authorize a stale card. The exact object must
   * still be part of settled settings authority when this queued transaction
   * reaches the front of the line.
   */
  const initialIndex = request.state.languages.indexOf(request.language);

  if (initialIndex < 0) {
    return { status: "target-missing" };
  }

  const approvedName = request.language.name;
  const confirmed = await request.confirm(approvedName);

  if (!confirmed) {
    return { status: "cancelled", name: approvedName };
  }

  /*
   * The common queue should prevent another queued settings transaction from
   * changing this target while confirmation is open. Rechecking nevertheless
   * preserves the confirmation module's exact-target contract and fails closed
   * if some non-queued code changed settings unexpectedly.
   */
  const currentIndex = request.state.languages.indexOf(request.language);

  if (currentIndex < 0) {
    return { status: "target-missing" };
  }

  if (request.language.name !== approvedName) {
    return { status: "target-changed", name: approvedName };
  }

  const previous: LanguageRemovalSnapshot = {
    languages: [...request.state.languages],
    activeLanguages: [...request.state.activeLanguages],
    primaryLanguage: request.state.primaryLanguage,
  };

  /*
   * Preserve the existing removal policy exactly:
   *
   * - remove every active-language reference to the approved identity;
   * - if configured languages remain but none are active, activate the first;
   * - if the removed language was primary, prefer the first active language,
   *   then the first configured language, and finally the inherited empty
   *   fallback when no configured languages remain.
   *
   * The stronger future Conlang Workbench Tutorial/minimum-language invariant
   * is intentionally NOT introduced by this H13 migration.
   */
  request.state.languages.splice(currentIndex, 1);
  request.state.activeLanguages = request.state.activeLanguages.filter(
    (name) => name !== approvedName,
  );

  if (
    request.state.languages.length > 0 &&
    request.state.activeLanguages.length === 0
  ) {
    request.state.activeLanguages = [request.state.languages[0].name];
  }

  if (request.state.primaryLanguage === approvedName) {
    request.state.primaryLanguage =
      request.state.activeLanguages[0] ??
      request.state.languages[0]?.name ??
      "";
  }

  try {
    await request.save();
  } catch (error) {
    /*
     * Runtime replacement has not begun, so the unsuccessful requested
     * configuration is not authoritative. Restore the complete previous
     * settings state in memory; no compensating save is appropriate because
     * the initial persistence itself failed.
     */
    restoreLanguageRemoval(request.state, previous);
    return { status: "save-failed", name: approvedName, error };
  }

  let reload: LanguageRemovalReloadResult;

  try {
    reload = await request.reload();
  } catch (reloadError) {
    /*
     * Runtime preparation is detached, so a thrown loader error cannot have
     * replaced the old authoritative inventories. Restore the complete settings
     * snapshot that still matches that runtime and persist the compensation.
     */
    restoreLanguageRemoval(request.state, previous);

    try {
      await request.save();
    } catch (error) {
      /*
       * Memory and runtime still agree on the previous language authority, but
       * durable settings could not be confirmed restored. Surface the rollback
       * persistence error because it describes the transaction's final state.
       */
      return {
        status: "rollback-save-failed",
        name: approvedName,
        error,
      };
    }

    return {
      status: "reload-failed",
      name: approvedName,
      error: reloadError,
    };
  }

  if (reload.status === "loaded") {
    return {
      status: "applied",
      name: approvedName,
      dictionaryCount: reload.dictionaryCount,
    };
  }

  /*
   * Explicit preflight blocking also leaves old runtime untouched. Restore the
   * configuration matching that authoritative runtime and persist the
   * compensating rollback.
   */
  restoreLanguageRemoval(request.state, previous);

  try {
    await request.save();
  } catch (error) {
    return {
      status: "rollback-save-failed",
      name: approvedName,
      error,
    };
  }

  return { status: "blocked", name: approvedName };
}
