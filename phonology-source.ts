import {
  firstParsedFrontmatterValue,
  parseNonBlankYamlString,
  parseYamlString,
} from "./frontmatter-values";
import type { ParsedFrontmatterValue } from "./frontmatter-values";
import type {
  PhonologicalRealization,
  PhonologicalRealizationStatus,
  PhonologicalUnit,
  PhonologicalUnitStatus,
} from "./phonology";
import { createObsidianWorkbenchIdentity } from "./workbench-id";
import type {
  WorkbenchDiagnostic,
  WorkbenchSourceRecord,
} from "./workbench-source";

/**
 * Raw information supplied by an Obsidian Markdown source.
 *
 * The adapter owns interpretation of frontmatter representation. Feature
 * modules should receive clean phonology objects rather than needing to know
 * which YAML aliases or recovery path produced them.
 */
export interface PhonologySourceInput {
  path: string;
  frontmatter: Record<string, unknown>;
}

/**
 * A phonology source can currently describe either a canonical unit or one
 * documented realization.
 *
 * `kind` lets callers narrow the clean object type without guessing from its
 * fields. More source encodings can later map into these same clean kinds.
 */
export type PhonologySourceRecord =
  | {
      kind: "unit";
      record: WorkbenchSourceRecord<PhonologicalUnit>;
    }
  | {
      kind: "realization";
      record: WorkbenchSourceRecord<PhonologicalRealization>;
    };

function addRejectedAliasDiagnostics<T>(
  diagnostics: WorkbenchDiagnostic[],
  result: ParsedFrontmatterValue<T>,
): void {
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
 * Parse one optional direct field using phonology's deliberately strict
 * string-only policy.
 */
function optionalString(value: unknown): string | undefined {
  const parsed = parseYamlString(value)?.trim();
  return parsed || undefined;
}

/**
 * Parse the optional analytical status shared by units and realizations.
 *
 * `status` is optional, so an absent/null value is not a problem. A present
 * value that Workbench cannot interpret should not invalidate the complete
 * phonology object either; instead we preserve that object and retain a warning
 * explaining which creator-authored field was ignored.
 *
 * Strict-string semantics remain unchanged. Numbers, booleans, arrays, and
 * objects are not coerced into status text.
 */
function parsePhonologyStatus<T extends
  | PhonologicalUnitStatus
  | PhonologicalRealizationStatus>(
  value: unknown,
  diagnostics: WorkbenchDiagnostic[],
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = optionalString(value);

  if (
    parsed === "established" ||
    parsed === "proposed" ||
    parsed === "unresolved"
  ) {
    return parsed as T;
  }

  if (typeof value === "string") {
    diagnostics.push({
      code: "phonology.unrecognized-status",
      severity: "warning",
      field: "status",
      message:
        `Phonology status "${value}" is not one of the supported values ` +
        '"established", "proposed", or "unresolved". The source file was ' +
        "not modified.",
    });
  } else {
    diagnostics.push({
      code: "frontmatter.unusable-value",
      severity: "warning",
      field: "status",
      message:
        'Frontmatter field "status" was present but could not be interpreted ' +
        "as a supported string status. The source file was not modified.",
    });
  }

  return undefined;
}

function parseUnitSource(
  input: PhonologySourceInput,
): WorkbenchSourceRecord<PhonologicalUnit> {
  const fm = input.frontmatter;
  const diagnostics: WorkbenchDiagnostic[] = [];

  const idResult = firstParsedFrontmatterValue(
    [
      { key: "unit_id", value: fm.unit_id },
      { key: "unitId", value: fm.unitId },
      { key: "unit-id", value: fm["unit-id"] },
    ],
    parseNonBlankYamlString,
  );
  addRejectedAliasDiagnostics(diagnostics, idResult);

  const languageIdResult = firstParsedFrontmatterValue(
    [
      { key: "language_id", value: fm.language_id },
      { key: "languageId", value: fm.languageId },
      { key: "language-id", value: fm["language-id"] },
    ],
    parseNonBlankYamlString,
  );
  addRejectedAliasDiagnostics(diagnostics, languageIdResult);

  const id = idResult.value;
  const symbol = parseNonBlankYamlString(fm.symbol);
  const identity = createObsidianWorkbenchIdentity(input.path, id);

  if (!id) {
    diagnostics.push({
      code: "phonology.unit.missing-id",
      severity: "error",
      field: "unit_id",
      message:
        "This source is identified as a phonological unit, but no usable " +
        "strict-string unit ID could be interpreted.",
    });
  }

  if (!symbol) {
    diagnostics.push({
      code: "phonology.unit.missing-symbol",
      severity: "error",
      field: "symbol",
      message:
        "This source is identified as a phonological unit, but no usable " +
        "strict-string symbol could be interpreted.",
    });
  }

  if (!id || !symbol) {
    return {
      identity,
      path: input.path,
      value: null,
      diagnostics,
    };
  }

  const unit: PhonologicalUnit = {
    id,
    symbol,
    category: optionalString(fm.category),
    status: parsePhonologyStatus<PhonologicalUnitStatus>(
      fm.status,
      diagnostics,
    ),
    language: optionalString(fm.language),
    languageId: languageIdResult.value,
    notes: optionalString(fm.notes),
    path: input.path,
  };

  return {
    identity,
    path: input.path,
    value: unit,
    diagnostics,
  };
}

function parseRealizationSource(
  input: PhonologySourceInput,
): WorkbenchSourceRecord<PhonologicalRealization> {
  const fm = input.frontmatter;
  const diagnostics: WorkbenchDiagnostic[] = [];

  const idResult = firstParsedFrontmatterValue(
    [
      { key: "realization_id", value: fm.realization_id },
      { key: "realizationId", value: fm.realizationId },
      { key: "realization-id", value: fm["realization-id"] },
    ],
    parseNonBlankYamlString,
  );
  addRejectedAliasDiagnostics(diagnostics, idResult);

  const unitIdResult = firstParsedFrontmatterValue(
    [
      { key: "unit_id", value: fm.unit_id },
      { key: "unitId", value: fm.unitId },
      { key: "unit-id", value: fm["unit-id"] },
    ],
    parseNonBlankYamlString,
  );
  addRejectedAliasDiagnostics(diagnostics, unitIdResult);

  const languageIdResult = firstParsedFrontmatterValue(
    [
      { key: "language_id", value: fm.language_id },
      { key: "languageId", value: fm.languageId },
      { key: "language-id", value: fm["language-id"] },
    ],
    parseNonBlankYamlString,
  );
  addRejectedAliasDiagnostics(diagnostics, languageIdResult);

  const id = idResult.value;
  const unitId = unitIdResult.value;
  const symbol = parseNonBlankYamlString(fm.symbol);
  const identity = createObsidianWorkbenchIdentity(input.path, id);

  if (!id) {
    diagnostics.push({
      code: "phonology.realization.missing-id",
      severity: "error",
      field: "realization_id",
      message:
        "This source is identified as a phonological realization, but no " +
        "usable strict-string realization ID could be interpreted.",
    });
  }

  if (!unitId) {
    diagnostics.push({
      code: "phonology.realization.missing-unit-id",
      severity: "error",
      field: "unit_id",
      message:
        "This source is identified as a phonological realization, but no " +
        "usable strict-string canonical unit ID could be interpreted.",
    });
  }

  if (!symbol) {
    diagnostics.push({
      code: "phonology.realization.missing-symbol",
      severity: "error",
      field: "symbol",
      message:
        "This source is identified as a phonological realization, but no " +
        "usable strict-string symbol could be interpreted.",
    });
  }

  if (!id || !unitId || !symbol) {
    return {
      identity,
      path: input.path,
      value: null,
      diagnostics,
    };
  }

  const realization: PhonologicalRealization = {
    id,
    unitId,
    symbol,
    environment: optionalString(fm.environment),
    status: parsePhonologyStatus<PhonologicalRealizationStatus>(
      fm.status,
      diagnostics,
    ),
    language: optionalString(fm.language),
    languageId: languageIdResult.value,
    notes: optionalString(fm.notes),
    path: input.path,
  };

  return {
    identity,
    path: input.path,
    value: realization,
    diagnostics,
  };
}

/**
 * Classify and interpret one Obsidian Markdown source as phonology data.
 *
 * Returning null means the source is not one of the currently recognized
 * phonology document types. A recognized-but-malformed source instead retains
 * a Workbench source record with `value: null` and diagnostics.
 */
export function parsePhonologySource(
  input: PhonologySourceInput,
): PhonologySourceRecord | null {
  const documentType = parseYamlString(input.frontmatter.type)?.trim();

  if (documentType === "phonological-unit") {
    return {
      kind: "unit",
      record: parseUnitSource(input),
    };
  }

  if (documentType === "phonological-realization") {
    return {
      kind: "realization",
      record: parseRealizationSource(input),
    };
  }

  return null;
}
