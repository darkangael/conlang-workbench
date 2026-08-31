import { App, TFolder } from "obsidian";
import { validateVaultRelativePath } from "./vault-paths";

/**
 * A problem found while inspecting a requested folder hierarchy.
 *
 * Inspection is deliberately separate from mutation. Operations that need to
 * establish several related folders can therefore prove the complete intended
 * structure is safe before creating the first missing folder.
 */
export interface VaultFolderInspectionIssue {
  requestedPath: string;
  blockingPath: string;
  kind: "invalid-path" | "not-folder";
  detail: string;
}

/**
 * Inspect requested vault-relative folder paths without changing the vault.
 *
 * Existing folders are valid and reusable. This is important because the
 * creator owns the organization beneath a configured Workbench source root.
 *
 * An existing file or other non-folder object at any required path component
 * is a hard stop. Workbench must never rename, replace, delete, or reinterpret
 * creator-authored data merely because it wanted a folder at that location.
 */
export function inspectVaultFolderPaths(
  app: App,
  paths: string[],
): VaultFolderInspectionIssue[] {
  const issues: VaultFolderInspectionIssue[] = [];

  for (const requestedPath of paths) {
    let safePath: string;

    try {
      safePath = validateVaultRelativePath(requestedPath);
    } catch (error) {
      issues.push({
        requestedPath,
        blockingPath: requestedPath,
        kind: "invalid-path",
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const parts = safePath.split("/");
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;

      const existing = app.vault.getAbstractFileByPath(current);

      if (!existing || existing instanceof TFolder) {
        continue;
      }

      issues.push({
        requestedPath: safePath,
        blockingPath: current,
        kind: "not-folder",
        detail: `"${current}" exists but is not a folder`,
      });

      /*
       * Once an ancestor is unusable, there is no meaningful descendant path
       * to inspect beneath it. Record the authoritative blocking object once.
       */
      break;
    }
  }

  return issues;
}

/**
 * Establish one configured folder hierarchy through a strict mutation boundary.
 *
 * Important safety invariants:
 *
 * - unsafe vault-relative paths are rejected instead of guessed or normalized;
 * - existing folders are reused unchanged;
 * - existing non-folder objects are a hard stop;
 * - createFolder() failures are ignored ONLY for the narrow race where another
 *   operation actually created the expected folder before our re-check.
 *
 * This helper never deletes or replaces creator-authored vault objects.
 */
export async function ensureVaultFolderStrict(
  app: App,
  path: string,
): Promise<void> {
  const safePath = validateVaultRelativePath(path);
  const parts = safePath.split("/");
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;

    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) {
      continue;
    }

    if (existing) {
      throw new Error(`"${current}" exists but is not a folder`);
    }

    try {
      await app.vault.createFolder(current);
    } catch (error) {
      /*
       * Only the known concurrent-creation race is recoverable. Swallowing
       * every createFolder() error would let permission failures or unexpected
       * vault errors masquerade as successful authority establishment.
       */
      if (!(app.vault.getAbstractFileByPath(current) instanceof TFolder)) {
        throw error;
      }
    }
  }
}
