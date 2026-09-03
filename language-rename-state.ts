import type { LanguageConfig } from "./types";

/**
 * Result returned by the normal active-language reload boundary.
 *
 * Runtime reload is prepared against detached candidate inventories. A
 * returned "blocked" result means source preflight refused the renamed
 * configuration, while a thrown error means candidate preparation failed.
 * Neither failure path replaces the currently authoritative runtime.
 */
export type LanguageRenameReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

/**
 * Configuration established by a validated language-root rename plan.
 *
 * Rename preserves creator-chosen descendant paths. A planner should therefore
 * prefix-rewrite paths beneath the old root rather than resetting them to the
 * standard Lexicon/Morphemes/Examples/Phonology locations.
 *
 * profilePath participates here because physically renaming the root also moves
 * a profile file beneath that root. Leaving its configured path unchanged would
 * immediately point at a location that no longer exists.
 */
export interface LanguageRenameConfiguration {
  name: string;
  rootFolder: string;
  dictionaryFolder: string;
  morphemeFolder?: string;
  exampleFolder?: string;
  phonologyFolder?: string;
  profilePath?: string;
}

/**
 * Complete read-only authorization for one root rename.
 *
 * Production planning must establish that:
 * - the current root belongs to this exact configured language;
 * - the destination is a safe direct child of Languages/;
 * - the destination is structurally unoccupied and unclaimed; and
 * - every rewritten authority-bearing path remains valid.
 *
 * The state transaction deliberately does not infer any of those facts after
 * mutation begins.
 */
export interface LanguageRenamePlan {
  status: "planned";
  oldName: string;
  newName: string;
  oldRoot: string;
  newRoot: string;
  configuration: LanguageRenameConfiguration;
}

export type LanguageRenamePlanResult =
  | LanguageRenamePlan
  | {
      status: "blocked";
      reason: string;
      detail: string;
    };

/**
 * Observable results of one explicit language rename transaction.
 *
 * Rename crosses two persistence systems: the Obsidian vault tree and plugin
 * settings. There is no single atomic operation spanning both, so failures
 * after the physical root move must report whether the compensating move back
 * to the old root succeeded.
 */
export type LanguageRenameStateResult =
  | {
      status: "applied";
      dictionaryCount?: number;
      rootRenamed: true;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    }
  | {
      status: "rename-failed";
      error: unknown;
    }
  | {
      status: "save-failed";
      error: unknown;
      rootRestored: true;
    }
  | {
      status: "save-failed-rollback-rename-failed";
      error: unknown;
      rollbackError: unknown;
      rootRenamed: true;
    }
  | {
      status: "reload-blocked";
      rootRestored: true;
    }
  | {
      status: "reload-blocked-rollback-rename-failed";
      rollbackError: unknown;
      rootRenamed: true;
    }
  | {
      status: "rollback-save-failed";
      error: unknown;
      rootRestored: true;
    }
  | {
      status: "reload-failed-rollback-rename-failed";
      error: unknown;
      rollbackError: unknown;
      rootRenamed: true;
    }
  | {
      status: "reload-failed";
      error: unknown;
      rootRestored: true;
    };

/**
 * The settings fields that use LanguageConfig.name as the inherited alpha
 * identity.
 *
 * Keep these references inside the same transaction as the LanguageConfig
 * rename. Persisting a new language name while activeLanguages or
 * primaryLanguage still contains the old name would create internally
 * inconsistent authority.
 */
export interface LanguageRenameSettingsState {
  activeLanguages: string[];
  primaryLanguage: string;
}

interface LanguageRenameSnapshot {
  name: string;
  rootFolder: string | undefined;
  dictionaryFolder: string;
  morphemeFolder: string | undefined;
  exampleFolder: string | undefined;
  phonologyFolder: string | undefined;
  profilePath: string | undefined;
  activeLanguages: string[];
  primaryLanguage: string;
}

export interface ApplyLanguageRenameStateRequest {
  /**
   * Exact LanguageConfig object being renamed.
   *
   * Object identity is preserved so existing settings/UI references continue
   * to point at the authoritative configuration object after the transaction.
   */
  language: LanguageConfig;

  /**
   * Name-keyed plugin settings that must migrate with LanguageConfig.name.
   */
  settings: LanguageRenameSettingsState;

  /**
   * Produce a fresh, complete read-only authorization immediately before any
   * physical or configuration mutation.
   */
  plan: () => LanguageRenamePlanResult;

  /**
   * Rename the already-authorized root folder.
   *
   * Production supplies an Obsidian FileManager.renameFile() wrapper. The same
   * callback is intentionally used for the compensating newRoot -> oldRoot move
   * so rollback exercises the same filesystem semantics as the forward rename.
   */
  renameRoot: (from: string, to: string) => Promise<void>;

  /**
   * Persist current plugin settings.
   */
  save: () => Promise<void>;

  /**
   * Re-establish runtime inventories when the renamed language was active.
   *
   * Both explicit preflight blocking and a thrown detached-preparation error
   * leave the previous runtime authoritative. Either failure therefore permits
   * an exact structural/configuration rollback attempt.
   */
  reload: () => Promise<LanguageRenameReloadResult>;
}

function snapshotLanguageRename(
  language: LanguageConfig,
  settings: LanguageRenameSettingsState,
): LanguageRenameSnapshot {
  return {
    name: language.name,
    rootFolder: language.rootFolder,
    dictionaryFolder: language.dictionaryFolder,
    morphemeFolder: language.morphemeFolder,
    exampleFolder: language.exampleFolder,
    phonologyFolder: language.phonologyFolder,
    profilePath: language.profilePath,
    activeLanguages: [...settings.activeLanguages],
    primaryLanguage: settings.primaryLanguage,
  };
}

function applyPlannedLanguageRename(
  language: LanguageConfig,
  settings: LanguageRenameSettingsState,
  plan: LanguageRenamePlan,
): void {
  language.name = plan.configuration.name;
  language.rootFolder = plan.configuration.rootFolder;
  language.dictionaryFolder = plan.configuration.dictionaryFolder;
  language.morphemeFolder = plan.configuration.morphemeFolder;
  language.exampleFolder = plan.configuration.exampleFolder;
  language.phonologyFolder = plan.configuration.phonologyFolder;
  language.profilePath = plan.configuration.profilePath;

  /*
   * map() constructs a new array rather than editing the old array while it is
   * being read. Every occurrence of the inherited old name is migrated as part
   * of the same requested identity change.
   */
  settings.activeLanguages = settings.activeLanguages.map((name) =>
    name === plan.oldName ? plan.newName : name,
  );

  if (settings.primaryLanguage === plan.oldName) {
    settings.primaryLanguage = plan.newName;
  }
}

function restoreLanguageRename(
  language: LanguageConfig,
  settings: LanguageRenameSettingsState,
  snapshot: LanguageRenameSnapshot,
): void {
  language.name = snapshot.name;
  language.rootFolder = snapshot.rootFolder;
  language.dictionaryFolder = snapshot.dictionaryFolder;
  language.morphemeFolder = snapshot.morphemeFolder;
  language.exampleFolder = snapshot.exampleFolder;
  language.phonologyFolder = snapshot.phonologyFolder;
  language.profilePath = snapshot.profilePath;
  settings.activeLanguages = [...snapshot.activeLanguages];
  settings.primaryLanguage = snapshot.primaryLanguage;
}

/**
 * Apply one explicit language identity/root rename transaction.
 *
 * Ordering is security-sensitive:
 *
 * 1. Calculate a fresh complete plan before any mutation.
 * 2. Rename the physical owned root exactly once.
 * 3. Apply the corresponding identity/path configuration in memory.
 * 4. Persist that configuration.
 * 5. Reload only if the language was active before the rename.
 *
 * If the first settings save fails, the physical rename is compensatable
 * because runtime replacement has not begun. The transaction first attempts to
 * move the root back and restores old in-memory settings only after that move
 * succeeds.
 *
 * That ordering is intentional. If the compensating filesystem rename fails,
 * keeping the new in-memory paths aligned with the root's actual new location
 * is more truthful than restoring settings to paths that no longer exist.
 *
 * A blocked active reload or thrown detached candidate-preparation error leaves
 * old runtime data untouched. The root can therefore be moved back, old settings
 * restored, and the rollback persisted.
 *
 * Structural truth remains authoritative during compensation: if the reverse
 * filesystem rename fails, the transaction keeps the new in-memory paths aligned
 * with the root that still physically exists at the new location.
 */
export async function applyLanguageRenameState(
  request: ApplyLanguageRenameStateRequest,
): Promise<LanguageRenameStateResult> {
  const plan = request.plan();

  if (plan.status === "blocked") {
    return {
      status: "blocked",
      reason: plan.reason,
      detail: plan.detail,
    };
  }

  const previous = snapshotLanguageRename(request.language, request.settings);
  const wasActive = previous.activeLanguages.includes(plan.oldName);

  /*
   * Physical structure moves before configuration. No in-memory or persisted
   * settings have changed yet, so a forward rename failure requires no rollback.
   */
  try {
    await request.renameRoot(plan.oldRoot, plan.newRoot);
  } catch (error) {
    return { status: "rename-failed", error };
  }

  applyPlannedLanguageRename(request.language, request.settings, plan);

  try {
    await request.save();
  } catch (error) {
    /*
     * Runtime replacement has not begun, so reversing the exact root move is
     * still authorized. Do that before restoring old settings so memory never
     * intentionally points at the wrong physical root.
     */
    try {
      await request.renameRoot(plan.newRoot, plan.oldRoot);
    } catch (rollbackError) {
      return {
        status: "save-failed-rollback-rename-failed",
        error,
        rollbackError,
        rootRenamed: true,
      };
    }

    restoreLanguageRename(request.language, request.settings, previous);

    return {
      status: "save-failed",
      error,
      rootRestored: true,
    };
  }

  if (!wasActive) {
    return {
      status: "applied",
      rootRenamed: true,
    };
  }

  try {
    const reload = await request.reload();

    if (reload.status === "loaded") {
      return {
        status: "applied",
        dictionaryCount: reload.dictionaryCount,
        rootRenamed: true,
      };
    }

    /*
     * "blocked" proves old runtime data is still authoritative. Reverse the
     * structural move before restoring old settings for the same reason used
     * in the initial-save rollback above.
     */
    try {
      await request.renameRoot(plan.newRoot, plan.oldRoot);
    } catch (rollbackError) {
      return {
        status: "reload-blocked-rollback-rename-failed",
        rollbackError,
        rootRenamed: true,
      };
    }

    restoreLanguageRename(request.language, request.settings, previous);

    try {
      await request.save();
    } catch (error) {
      return {
        status: "rollback-save-failed",
        error,
        rootRestored: true,
      };
    }

    return {
      status: "reload-blocked",
      rootRestored: true,
    };
  } catch (reloadError) {
    /*
     * Detached candidate preparation failed before runtime commit, so the old
     * runtime is still authoritative. First reverse the exact structural move.
     * Do not restore old settings unless that physical rollback succeeds.
     */
    try {
      await request.renameRoot(plan.newRoot, plan.oldRoot);
    } catch (rollbackError) {
      /*
       * The root still physically lives at the new location. Keep the new
       * in-memory identity/paths aligned with that vault structure rather than
       * manufacturing an old configuration that points somewhere else.
       */
      return {
        status: "reload-failed-rollback-rename-failed",
        error: reloadError,
        rollbackError,
        rootRenamed: true,
      };
    }

    restoreLanguageRename(request.language, request.settings, previous);

    try {
      await request.save();
    } catch (error) {
      /*
       * Vault structure, memory, and runtime now reflect the old authority, but
       * durable settings could not be confirmed restored.
       */
      return {
        status: "rollback-save-failed",
        error,
        rootRestored: true,
      };
    }

    return {
      status: "reload-failed",
      error: reloadError,
      rootRestored: true,
    };
  }
}
