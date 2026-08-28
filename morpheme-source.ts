import {
  firstParsedFrontmatterValue,
  parseNonBlankYamlScalarText,
  parseYamlScalarText,
  ParsedFrontmatterValue,
} from "./frontmatter-values";
import { Morpheme } from "./types";
import { parseStringList } from "./word-tokens";
import { createObsidianWorkbenchIdentity } from "./workbench-id";
import {
  WorkbenchDiagnostic,
  WorkbenchSourceRecord,
} from "./workbench-source";

export interface MorphemeSourceInput {
  path: string;
  basename: string;
  mtime: number;
  frontmatter: Record<string, unknown>;
}

/**
 * Record rejected compatibility aliases as diagnostics without changing the
 * source. A valid fallback may still make the resulting morpheme usable.
 */
function addRejectedAliasDiagnostics<T>(
  diagnostics: WorkbenchDiagnostic[],
  result: ParsedFrontmatterValue<T>,
) {
  for (const field of result.rejectedKeys) {
    diagnostics.push({
      code: "frontmatter.unusable-alias",
      severity: "warning",
      field,
      message:
        `Frontmatter field "${field}" could not be interpreted; ` +
        "Workbench continued checking supported fallback fields.",
    });
  }
}

/**
 * Interpret one Obsidian Markdown source as a morpheme record.
 *
 * Returning null means the source is not identified as a morpheme at all.
 * This distinction matters because configured morpheme folders may also contain
 * supporting Markdown notes that Workbench must not misclassify.
 *
 * Once `type: morpheme` is recognized, however, the source receives a
 * Workbench record even when required linguistic fields are malformed.
 */
export function parseMorphemeSource(
  input: MorphemeSourceInput,
): WorkbenchSourceRecord<Morpheme> | null {
  const fm = input.frontmatter;
  const documentType = parseYamlScalarText(fm.type)?.trim();

  if (documentType !== "morpheme") {
    return null;
  }

  const diagnostics: WorkbenchDiagnostic[] = [];

  const idResult = firstParsedFrontmatterValue(
    [
      { key: "morpheme_id", value: fm.morpheme_id },
      { key: "id", value: fm.id },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(diagnostics, idResult);

  const glossResult = firstParsedFrontmatterValue(
    [
      { key: "gloss", value: fm.gloss },
      { key: "meaning", value: fm.meaning },
      { key: "function", value: fm.function },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(diagnostics, glossResult);

  const typeResult = firstParsedFrontmatterValue(
    [
      { key: "morpheme_type", value: fm.morpheme_type },
      { key: "morphemeType", value: fm.morphemeType },
      { key: "category", value: fm.category },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(diagnostics, typeResult);

  const realizationsResult = firstParsedFrontmatterValue(
    [
      { key: "realizations", value: fm.realizations },
      { key: "allomorphs", value: fm.allomorphs },
    ],
    parseStringList,
  );
  addRejectedAliasDiagnostics(diagnostics, realizationsResult);

  const languageIdResult = firstParsedFrontmatterValue(
    [
      { key: "language_id", value: fm.language_id },
      { key: "languageId", value: fm.languageId },
    ],
    parseNonBlankYamlScalarText,
  );
  addRejectedAliasDiagnostics(diagnostics, languageIdResult);

  const id = idResult.value;
  const gloss = glossResult.value;

  // Workbench identity is deliberately independent of linguistic identity.
  // The source remains addressable even when no usable morpheme ID exists.
  const identity = createObsidianWorkbenchIdentity(input.path, id);

  if (!id) {
    diagnostics.push({
      code: "morpheme.missing-id",
      severity: "error",
      field: "morpheme_id",
      message:
        "This source is identified as a morpheme, but no usable morpheme ID " +
        "could be interpreted.",
    });
  }

  if (!gloss) {
    diagnostics.push({
      code: "morpheme.missing-gloss",
      severity: "error",
      field: "gloss",
      message:
        "This source is identified as a morpheme, but no usable gloss, " +
        "meaning, or function could be interpreted.",
    });
  }

  const formRaw = parseYamlScalarText(fm.form);
  const formOverride = formRaw?.trim();
  const form = formOverride || input.basename;

  if (
    fm.form !== undefined &&
    fm.form !== null &&
    formRaw === undefined
  ) {
    diagnostics.push({
      code: "frontmatter.unusable-value",
      severity: "warning",
      field: "form",
      message:
        'Frontmatter field "form" could not be interpreted; Workbench used ' +
        "the source filename as the display form instead.",
    });
  }

  if (!form.trim()) {
    diagnostics.push({
      code: "morpheme.missing-form",
      severity: "error",
      field: "form",
      message:
        "No usable morpheme form could be derived from frontmatter or the " +
        "source filename.",
    });
  }

  const distributionRaw = parseYamlScalarText(fm.distribution)
    ?.trim()
    .toLowerCase();

  const distribution =
    distributionRaw === "free" ||
    distributionRaw === "bound" ||
    distributionRaw === "both" ||
    distributionRaw === "unknown"
      ? distributionRaw
      : undefined;

  if (
    distributionRaw &&
    distribution === undefined
  ) {
    diagnostics.push({
      code: "morpheme.unrecognized-distribution",
      severity: "warning",
      field: "distribution",
      message:
        `Distribution "${distributionRaw}" is not one of the supported ` +
        "values: free, bound, both, or unknown.",
    });
  }

  // Required fields must exist before a clean feature-facing object can be
  // produced. The source record itself is still returned below.
  if (!id || !gloss || !form.trim()) {
    return {
      identity,
      path: input.path,
      value: null,
      diagnostics,
    };
  }

  const morpheme: Morpheme = {
    id,
    form,
    gloss,
    type: typeResult.value,
    distribution,
    realizations: realizationsResult.value,
    language: parseYamlScalarText(fm.language)?.trim(),
    languageId: languageIdResult.value,
    path: input.path,
    notes: parseYamlScalarText(fm.notes)?.trim(),
    mtime: input.mtime,
  };

  return {
    identity,
    path: input.path,
    value: morpheme,
    diagnostics,
  };
}
