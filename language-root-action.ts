import { validateLanguageRoot } from "./language-root-authority";

/**
 * Minimal filesystem vocabulary needed to choose which structural action the
 * Settings UI should present.
 *
 * These values describe only one rendered snapshot. They are not durable
 * filesystem authority and must never be reused as permission to mutate the
 * vault.
 */
export type LanguageRootPresentationPathState = "folder" | "missing" | "other";

/**
 * Presentation decision for one configured language root.
 *
 * `repair` means the configured ownership boundary currently appears to exist.
 * `recreate` means that valid configured boundary currently appears absent.
 * `blocked` means another vault object occupies the exact configured root.
 * `unavailable` means the configuration itself does not identify a valid modern
 * language ownership boundary.
 *
 * None of these results grants filesystem authority. Repair and Recreate must
 * independently revalidate current settings and vault state when invoked.
 */
export type LanguageRootAction =
  | {
      status: "repair";
      root: string;
    }
  | {
      status: "recreate";
      root: string;
    }
  | {
      status: "blocked";
      root: string;
      detail: string;
    }
  | {
      status: "unavailable";
      detail: string;
    };

/**
 * Choose the structural action that should be shown for one language card.
 *
 * Root validation deliberately happens before `pathState` is called. A missing
 * arbitrary or malformed path must never be interpreted as recreation
 * authority merely because nothing currently exists there.
 *
 * The callback keeps this module independent of Obsidian filesystem classes.
 * Settings, diagnostics, or another presentation layer may translate their own
 * read-only snapshot into the three abstract path states above.
 */
export function chooseLanguageRootAction(
  configuredRoot: string | undefined,
  pathState: (root: string) => LanguageRootPresentationPathState,
): LanguageRootAction {
  if (!configuredRoot) {
    return {
      status: "unavailable",
      detail:
        "This language has no configured root ownership boundary, so Repair and Recreate are unavailable.",
    };
  }

  const validation = validateLanguageRoot(configuredRoot);

  if (validation.status === "invalid") {
    return {
      status: "unavailable",
      detail: validation.detail,
    };
  }

  const state = pathState(validation.root);

  switch (state) {
    case "folder":
      return {
        status: "repair",
        root: validation.root,
      };

    case "missing":
      return {
        status: "recreate",
        root: validation.root,
      };

    case "other":
      return {
        status: "blocked",
        root: validation.root,
        detail:
          `The configured root "${validation.root}" is occupied by a ` +
          "non-folder object. Move or rename that object before repairing " +
          "this language.",
      };
  }
}
