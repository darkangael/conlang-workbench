/**
 * Transactional authority for changing only the configured primary language.
 *
 * The active-language transaction owns changes to which languages are loaded.
 * This smaller transaction has a different responsibility: choose one language
 * from that already-established active set as the primary translation and
 * entry-creation target.
 *
 * Keeping this logic independent from Obsidian makes the persistence boundary
 * directly testable and prevents separate UI surfaces from implementing
 * subtly different failure handling.
 */

export interface PrimaryLanguageState {
  languages: Array<{ name: string }>;
  activeLanguages: string[];
  primaryLanguage: string;
}

export type PrimaryLanguageStateResult =
  | { status: "applied" }
  | { status: "unchanged" }
  | { status: "invalid-request"; error: string }
  | { status: "save-failed"; error: unknown };

export interface ApplyPrimaryLanguageStateRequest {
  /**
   * Mutable settings-backed state owned by the plugin.
   */
  state: PrimaryLanguageState;

  /**
   * Name of the configured, already-active language that should become primary.
   */
  primaryLanguage: string;

  /**
   * Persist the current in-memory settings state.
   */
  save: () => Promise<void>;
}

/**
 * Establish a primary-language-only change.
 *
 * Safety contract:
 *
 * 1. Validate the requested identity before changing settings.
 * 2. Require the requested primary to be both configured and already active.
 * 3. Persist the requested primary before treating the change as successful.
 * 4. If persistence fails, immediately restore the previous in-memory primary.
 *
 * No linguistic reload belongs here. Changing the primary selects among
 * languages whose runtime inventories were already established by the
 * active-language authority transaction.
 */
export async function applyPrimaryLanguageState(
  request: ApplyPrimaryLanguageStateRequest,
): Promise<PrimaryLanguageStateResult> {
  const requestedPrimary = request.primaryLanguage.trim();

  if (!requestedPrimary) {
    return {
      status: "invalid-request",
      error: "the primary language cannot be blank",
    };
  }

  const configuredMatches = request.state.languages.filter(
    (language) => language.name === requestedPrimary,
  );

  if (configuredMatches.length === 0) {
    return {
      status: "invalid-request",
      error: "the primary language must be configured",
    };
  }

  if (configuredMatches.length > 1) {
    return {
      status: "invalid-request",
      error: "the primary language identity must be unique",
    };
  }

  if (!request.state.activeLanguages.includes(requestedPrimary)) {
    return {
      status: "invalid-request",
      error: "the primary language must be active",
    };
  }

  if (request.state.primaryLanguage === requestedPrimary) {
    return { status: "unchanged" };
  }

  const previousPrimary = request.state.primaryLanguage;
  request.state.primaryLanguage = requestedPrimary;

  try {
    await request.save();
  } catch (error) {
    /*
     * Persistence never completed reliably, so the requested primary did not
     * become authoritative. Restore memory immediately so runtime callers that
     * read settings.primaryLanguage continue to see the previous persisted
     * selection.
     */
    request.state.primaryLanguage = previousPrimary;
    return { status: "save-failed", error };
  }

  return { status: "applied" };
}
