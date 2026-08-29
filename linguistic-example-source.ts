import {
  parseNonBlankYamlString,
} from "./frontmatter-values";
import { createObsidianWorkbenchIdentity } from "./workbench-id";
import type {
  WorkbenchDiagnostic,
  WorkbenchSourceRecord,
} from "./workbench-source";
import type { LinguisticExample } from "./linguistic-examples";

/**
 * Raw source information needed to interpret one standalone linguistic-example
 * Markdown note.
 *
 * The adapter deliberately knows nothing about Obsidian TFile/TFolder objects.
 * That keeps source interpretation testable and leaves vault traversal to the
 * inventory/coordinator layer.
 */
export interface LinguisticExampleSourceInput {
  path: string;
  frontmatter: Record<string, unknown>;
}

/**
 * Record one optional field that was present but structurally incompatible
 * with this feature's strict-string frontmatter policy.
 *
 * Blank strings are intentionally treated as absent rather than malformed.
 * Empty optional fields are common in templates and do not represent damage.
 */
function readOptionalString(
  frontmatter: Record<string, unknown>,
  key: string,
  diagnostics: WorkbenchDiagnostic[],
): string | undefined {
  const raw = frontmatter[key];

  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed || undefined;
  }

  diagnostics.push({
    code: "frontmatter.unusable-value",
    severity: "warning",
    field: key,
    message:
      `Frontmatter field "${key}" is present but is not a supported string. ` +
      "The field was left uninterpreted and the source was not modified.",
  });

  return undefined;
}

/**
 * Interpret one Markdown/frontmatter source as a standalone linguistic example.
 *
 * Source authority is intentionally narrow:
 *
 * - only `type: linguistic-example` belongs to this adapter
 * - foreign or unrecognized documents return null
 * - once a source is recognized, malformed required data does NOT make the
 *   source disappear; it is retained as a source record with `value: null`
 *
 * Linguistic-example fields remain deliberately strict-string. Workbench does
 * not convert numbers, booleans, arrays, or objects into creator-authored text.
 */
export function parseLinguisticExampleSource(
  input: LinguisticExampleSourceInput,
): WorkbenchSourceRecord<LinguisticExample> | null {
  const fm = input.frontmatter;

  // A usable explicit type establishes source authority. If Workbench cannot
  // establish that this is a linguistic-example note, this adapter has no
  // authority to diagnose or reinterpret the document.
  const declaredType = parseNonBlankYamlString(fm.type);

  if (declaredType !== "linguistic-example") {
    return null;
  }

  const diagnostics: WorkbenchDiagnostic[] = [];

  // example_id is optional. If it cannot be interpreted, Workbench still has
  // independent source/workbench identity and never invents a linguistic ID.
  const id = readOptionalString(fm, "example_id", diagnostics);

  const identity = createObsidianWorkbenchIdentity(input.path, id);

  // text is the one required linguistic tier. Unlike optional blank template
  // fields, a missing, blank, or non-string text value makes the recognized
  // example incomplete.
  const text = parseNonBlankYamlString(fm.text);

  // Parse optional fields even when text is invalid so the retained source
  // record can report all currently visible structural problems in one pass.
  const realization = readOptionalString(
    fm,
    "realization",
    diagnostics,
  );
  const segmentation = readOptionalString(
    fm,
    "segmentation",
    diagnostics,
  );
  const gloss = readOptionalString(fm, "gloss", diagnostics);
  const translation = readOptionalString(
    fm,
    "translation",
    diagnostics,
  );
  const language = readOptionalString(fm, "language", diagnostics);
  const languageId = readOptionalString(
    fm,
    "language_id",
    diagnostics,
  );
  const source = readOptionalString(fm, "source", diagnostics);
  const context = readOptionalString(fm, "context", diagnostics);
  const notes = readOptionalString(fm, "notes", diagnostics);

  if (!text) {
    diagnostics.push({
      code: "linguistic-example.unusable-text",
      severity: "error",
      field: "text",
      message:
        'This note is recognized as a linguistic example, but its required ' +
        '"text" field is missing, blank, or not a supported string. ' +
        "The source was preserved and was not modified.",
    });

    return {
      identity,
      path: input.path,
      value: null,
      diagnostics,
    };
  }

  return {
    identity,
    path: input.path,
    value: {
      id,
      text,
      realization,
      segmentation,
      gloss,
      translation,
      language,
      languageId,
      source,
      context,
      notes,
      path: input.path,
    },
    diagnostics,
  };
}
