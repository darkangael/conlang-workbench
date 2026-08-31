/**
 * Transactional persistence for ordinary settings that take effect directly
 * from the plugin's live settings object.
 *
 * Unlike language-source, case-matching, or other linguistic authority
 * transactions, these preferences do not rebuild an external runtime index.
 * Their authority boundary is therefore simple: the requested value becomes
 * authoritative only if the complete settings object is persisted
 * successfully.
 *
 * Keeping this operation independent from Obsidian makes the failure boundary
 * directly testable and prevents individual UI controls from implementing
 * subtly different rollback behavior.
 */

export type PersistedSettingStateResult =
  | { status: "applied" }
  | { status: "unchanged" }
  | { status: "save-failed"; error: unknown };

export interface ApplyPersistedSettingStateRequest<T> {
  /**
   * Read the currently authoritative in-memory value.
   *
   * A callback is used instead of a property name so this helper can protect
   * both top-level ConlangSettings properties and nested LanguageConfig
   * properties without owning either schema.
   */
  read: () => T;

  /**
   * Install a value into the live settings-backed object.
   *
   * The requested value must temporarily be present while save() runs because
   * ConlangPlugin.saveSettings() persists the complete live settings object.
   * On persistence failure this same callback restores the previous value.
   */
  write: (value: T) => void;

  /**
   * Value requested by the user.
   */
  requested: T;

  /**
   * Persist the plugin's complete current settings object.
   */
  save: () => Promise<void>;
}

/**
 * Persist one ordinary live setting without allowing a failed save to retain
 * runtime authority.
 *
 * Safety contract:
 *
 * 1. Read the previously authoritative value before mutation.
 * 2. Avoid a redundant persistence write when the value is unchanged.
 * 3. Install the requested value only for the persistence attempt.
 * 4. If persistence fails, immediately restore the previous in-memory value.
 *
 * The restoration matters beyond the current UI interaction. saveSettings()
 * serializes the complete settings object, so leaving a failed mutation in
 * memory could allow a later unrelated successful save to persist it.
 *
 * This helper deliberately does not claim to serialize unrelated settings
 * saves. Whole-settings concurrency remains a separate persistence boundary.
 */
export async function applyPersistedSettingState<T>(
  request: ApplyPersistedSettingStateRequest<T>,
): Promise<PersistedSettingStateResult> {
  const previous = request.read();

  if (Object.is(previous, request.requested)) {
    return { status: "unchanged" };
  }

  request.write(request.requested);

  try {
    await request.save();
  } catch (error) {
    /*
     * Persistence never completed reliably, so the requested value did not
     * become authoritative. Restore memory immediately so runtime consumers
     * and later whole-settings saves continue from the previous persisted
     * authority.
     */
    request.write(previous);
    return { status: "save-failed", error };
  }

  return { status: "applied" };
}
