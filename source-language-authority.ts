import {
  LanguageMembershipMode,
  resolveLanguageMembership,
} from "./language-membership";
import { WorkbenchDiagnostic } from "./workbench-source";

/**
 * Context supplied by one configured canonical language source and one
 * already-recognized linguistic object.
 *
 * This layer deliberately receives only language-scope facts. It does not
 * receive a DictionaryEntry, Morpheme, phonological object, example, vault
 * file, or source record, so resolving contextual authority cannot mutate
 * creator data or silently acquire feature-specific indexing authority.
 */
export interface SourceLanguageAuthorityInput {
  configuredLanguage?: string;
  configuredLanguageId?: string;
  explicitLanguage?: string;
  explicitLanguageId?: string;
  membershipMode: LanguageMembershipMode;
}

/**
 * A recognized object is eligible for the configured language inventory.
 *
 * The returned values describe runtime scope only. A specialized inventory may
 * apply them to its in-memory object, but this result never authorizes writing
 * inherited values back to creator-authored Markdown.
 */
export interface AcceptedSourceLanguageAuthority {
  accepted: true;
  runtimeLanguage?: string;
  runtimeLanguageId?: string;
}

/**
 * A recognized object parsed successfully but is not eligible for this
 * configured language inventory.
 *
 * The warning belongs to source-facing diagnostics. Rejection does not make
 * the linguistic source malformed and does not authorize Workbench to repair
 * or rewrite it.
 */
export interface RejectedSourceLanguageAuthority {
  accepted: false;
  diagnostic: WorkbenchDiagnostic;
}

export type SourceLanguageAuthorityResult =
  | AcceptedSourceLanguageAuthority
  | RejectedSourceLanguageAuthority;

/**
 * Normalize optional stable language identity for comparison and runtime use.
 *
 * This mirrors the existing treatment of optional language names: surrounding
 * whitespace is not meaningful contextual scope, and a blank value establishes
 * no usable identity. Source parsers remain responsible for diagnosing malformed
 * or otherwise unusable creator-authored fields before this contextual layer.
 */
function normalizeOptionalScope(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

/**
 * Resolve whether an already-recognized linguistic object belongs to one
 * configured canonical language source.
 *
 * There are two independent authority checks:
 *
 * 1. Human-readable `language:` membership follows the existing shared policy.
 *    In `folder` mode the configured folder may override a readable-name
 *    mismatch at runtime. In `respect-explicit` mode such a mismatch rejects.
 *
 * 2. Stable `language_id` identity fails closed whenever both sides provide
 *    different IDs. Folder authority never silently overrides an explicit
 *    conflicting stable language identity.
 *
 * Accepted missing scope may inherit from the configured language in memory.
 * No branch in this function mutates a source record or creator-authored file.
 */
export function resolveSourceLanguageAuthority(
  input: SourceLanguageAuthorityInput,
): SourceLanguageAuthorityResult {
  const membership = resolveLanguageMembership(
    input.configuredLanguage,
    input.explicitLanguage,
    input.membershipMode,
  );

  if (!membership.accepted) {
    return {
      accepted: false,
      diagnostic: {
        code: "language.membership-mismatch",
        severity: "warning",
        field: "language",
        message:
          "The source declares a language name that does not match this " +
          "configured language source. The source file was not modified.",
      },
    };
  }

  const configuredLanguageId = normalizeOptionalScope(
    input.configuredLanguageId,
  );
  const explicitLanguageId = normalizeOptionalScope(input.explicitLanguageId);

  if (
    configuredLanguageId &&
    explicitLanguageId &&
    configuredLanguageId !== explicitLanguageId
  ) {
    return {
      accepted: false,
      diagnostic: {
        code: "language.id-mismatch",
        severity: "warning",
        field: "language_id",
        message:
          "The source declares a stable language ID that does not match this " +
          "configured language source. The source file was not modified.",
      },
    };
  }

  return {
    accepted: true,
    runtimeLanguage: membership.runtimeLanguage,
    runtimeLanguageId: configuredLanguageId ?? explicitLanguageId,
  };
}
