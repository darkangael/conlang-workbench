import type { LanguageConfig } from "./types";

/**
 * The subset of settings authority needed by new-language registration.
 *
 * Keeping this deliberately narrow makes the transaction independent from
 * Obsidian and from unrelated ConlangSettings fields. The plugin-wide
 * SettingsAuthorityQueue remains responsible for serialization.
 */
export interface LanguageCreationState {
  languages: LanguageConfig[];
}

/**
 * Structural result accepted from the existing H5 language creator.
 *
 * The production creator also returns its StandardLanguagePaths on success,
 * but H13 does not need to own or reinterpret those paths. Its responsibility
 * begins and ends with registering the exact LanguageConfig returned after the
 * creator has completed its existing filesystem-authority work.
 */
export type LanguageCreationAttemptResult =
  | {
      status: "created";
      language: LanguageConfig;
    }
  | {
      status: "blocked" | "failed";
      error: string;
    };

/**
 * Observable result of one complete new-language settings transaction.
 *
 * "blocked" and "failed" retain the meanings supplied by the H5 creator.
 * "save-failed" is deliberately separate: the complete standard folder
 * structure was established successfully, but the new configuration did not
 * become persisted settings authority.
 */
export type LanguageCreationStateResult =
  | {
      status: "created";
      name: string;
      language: LanguageConfig;
    }
  | {
      status: "blocked" | "failed";
      name: string;
      error: string;
    }
  | {
      status: "save-failed";
      name: string;
      error: unknown;
      foldersEstablished: true;
    };

export interface ApplyLanguageCreationStateRequest {
  /**
   * Live settings-backed language collection.
   *
   * Production must enter SettingsAuthorityQueue before this collection is
   * inspected. Name selection is authority-sensitive because a concurrent
   * transaction may add, remove, rename, or roll back a language.
   */
  state: LanguageCreationState;

  /**
   * Perform the existing H5 filesystem-authority transaction.
   *
   * The callback receives the current configured-language array so the creator
   * can apply its existing root and inventory ownership checks against the same
   * settled authority used to choose the generated language name.
   */
  create: (
    name: string,
    existingLanguages: readonly LanguageConfig[],
  ) => Promise<LanguageCreationAttemptResult>;

  /**
   * Persist the plugin's complete current settings object.
   */
  save: () => Promise<void>;
}

/**
 * Choose the next generated "Language N" name using the existing settings-tab
 * behavior.
 *
 * This function intentionally starts from languages.length + 1 rather than
 * searching from 1. That preserves the established UI behavior while moving
 * the authority-sensitive read inside the serialized transaction.
 */
function chooseUniqueLanguageName(
  languages: readonly LanguageConfig[],
): string {
  const names = new Set(languages.map((language) => language.name));
  let i = languages.length + 1;
  let name = `Language ${i}`;

  while (names.has(name)) {
    name = `Language ${++i}`;
  }

  return name;
}

/**
 * Register one newly created standard language as persisted settings authority.
 *
 * Safety contract:
 *
 * 1. Choose the generated name from the currently settled language collection.
 * 2. Run the existing H5 creator against that same settled configuration.
 * 3. Do not mutate settings when creation is blocked or fails.
 * 4. Append exactly the LanguageConfig returned by a successful creator.
 * 5. Persist the complete settings object.
 * 6. If persistence fails, remove only that exact object by identity.
 *
 * Folder creation is intentionally NOT rolled back when persistence fails.
 * Once the creator has established additive vault structure, creator or
 * concurrent filesystem data may already exist there. H13 therefore restores
 * only the settings mutation that it can prove belongs to this transaction.
 *
 * This primitive deliberately does not serialize itself. Production callers
 * must run the complete function through the plugin-wide
 * SettingsAuthorityQueue so name selection, filesystem authority work,
 * provisional registration, persistence, and rollback share one boundary.
 */
export async function applyLanguageCreationState(
  request: ApplyLanguageCreationStateRequest,
): Promise<LanguageCreationStateResult> {
  const name = chooseUniqueLanguageName(request.state.languages);

  const creation = await request.create(name, request.state.languages);

  if (creation.status !== "created") {
    return {
      status: creation.status,
      name,
      error: creation.error,
    };
  }

  const language = creation.language;
  request.state.languages.push(language);

  try {
    await request.save();
  } catch (error) {
    /*
     * Locate by object identity rather than by an array position captured
     * before an awaited save. Only the exact configuration inserted by this
     * transaction is authorized for rollback.
     */
    const currentIndex = request.state.languages.indexOf(language);

    if (currentIndex !== -1) {
      request.state.languages.splice(currentIndex, 1);
    }

    return {
      status: "save-failed",
      name,
      error,
      foldersEstablished: true,
    };
  }

  return {
    status: "created",
    name,
    language,
  };
}
