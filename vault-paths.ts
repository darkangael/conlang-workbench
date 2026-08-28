/**
 * Vault path safety helpers.
 *
 * Workbench treats configured paths as logical authority boundaries rather
 * than trusting mutation-time path normalization by Obsidian. In particular,
 * "." and ".." are rejected instead of being silently normalized because doing
 * so could redirect a write outside the folder the feature was meant to own.
 */

/**
 * Validate a vault-relative path and return it unchanged.
 *
 * This function intentionally does not "repair" unsafe input. A caller should
 * surface the validation error to the user rather than guessing which
 * destination they intended.
 */
export function validateVaultRelativePath(path: string): string {
  if (!path) {
    throw new Error("Vault path must not be empty.");
  }

  if (path !== path.trim()) {
    throw new Error("Vault path must not begin or end with whitespace.");
  }

  // Obsidian vault paths use forward slashes. Reject backslashes entirely so
  // platform-specific separator interpretation cannot change path meaning.
  if (path.includes("\\")) {
    throw new Error("Vault path must use forward slashes, not backslashes.");
  }

  // Reject Unix-style absolute paths, Windows drive paths, and UNC-like forms.
  // Workbench paths must always be relative to the current Obsidian vault.
  if (
    path.startsWith("/") ||
    /^[A-Za-z]:\//.test(path) ||
    path.startsWith("//")
  ) {
    throw new Error("Vault path must be relative to the current vault.");
  }

  const parts = path.split("/");

  if (parts.some((part) => part.length === 0)) {
    throw new Error(
      "Vault path must not contain repeated, leading, or trailing separators.",
    );
  }

  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error('Vault path must not contain "." or ".." components.');
  }

  return path;
}

/**
 * Join a validated vault folder with one child filename.
 *
 * The child is deliberately limited to a single path component. Generated
 * words, imported filenames, or other future callers therefore cannot smuggle
 * another folder path into a destination that was already authorized.
 */
export function joinVaultPath(folder: string, child: string): string {
  const safeFolder = validateVaultRelativePath(folder);

  if (!child) {
    throw new Error("Vault child name must not be empty.");
  }

  if (
    child === "." ||
    child === ".." ||
    child.includes("/") ||
    child.includes("\\")
  ) {
    throw new Error("Vault child name must be a single path component.");
  }

  return `${safeFolder}/${child}`;
}

/**
 * Test whether a path is the folder itself or a real descendant of it.
 *
 * Raw startsWith() is insufficient because "Languages/Mermaid" also starts
 * with "Languages/Mer". Requiring either exact equality or a slash boundary
 * preserves actual folder membership semantics.
 *
 * Invalid configured folders fail closed and simply do not match.
 */
export function isPathWithinFolder(path: string, folder: string): boolean {
  try {
    const safePath = validateVaultRelativePath(path);
    const safeFolder = validateVaultRelativePath(folder);

    return safePath === safeFolder || safePath.startsWith(`${safeFolder}/`);
  } catch {
    return false;
  }
}
