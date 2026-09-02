import type {
  WorkbenchDiagnostic,
  WorkbenchDiagnosticSeverity,
  WorkbenchSourceRecord,
} from "./workbench-source";
import type { WorkbenchIdentity } from "./workbench-id";

/**
 * One creator-facing diagnostic group for one recognized Markdown source.
 *
 * Workbench groups by its own source identity rather than by linguistic ID.
 * That matters because malformed linguistic data may have no usable lemma,
 * morpheme ID, phonological-unit ID, or other creator-authored identity at all.
 *
 * The source path remains available for display and navigation. The Workbench
 * identity is structural bookkeeping and should not become the creator-facing
 * title merely because a source is malformed.
 */
export interface SourceDiagnosticGroup {
  identity: WorkbenchIdentity;
  path: string;
  severity: WorkbenchDiagnosticSeverity;
  diagnostics: WorkbenchDiagnostic[];
}

/**
 * Minimal shape required to validate a canonical phonological-unit reference.
 *
 * This module deliberately depends on the relationship data it needs rather
 * than importing the complete PhonologyInventory. That keeps aggregation pure:
 * it does not know how inventories scan the vault, index values, or mutate
 * runtime state.
 */
export interface DiagnosticPhonologicalUnit {
  id: string;
  language?: string;
  languageId?: string;
}

/**
 * Minimal realization shape required for relationship validation.
 */
export interface DiagnosticPhonologicalRealization {
  unitId: string;
  language?: string;
  languageId?: string;
}

/**
 * Input for rebuilding the current creator-facing diagnostic state.
 *
 * `records` contains every recognized source whose parser/inventory diagnostics
 * should be surfaced. Phonology records are supplied separately as well because
 * relationship diagnostics require comparing clean realization values against
 * the currently loaded canonical units.
 *
 * Readonly arrays make an important authority promise explicit: aggregation may
 * inspect the current runtime records, but it cannot replace array elements or
 * use this API as a mutation path back into the inventories.
 */
export interface BuildSourceDiagnosticGroupsInput {
  records: readonly WorkbenchSourceRecord<unknown>[];
  phonologyUnitRecords?: readonly WorkbenchSourceRecord<DiagnosticPhonologicalUnit>[];
  phonologyRealizationRecords?: readonly WorkbenchSourceRecord<DiagnosticPhonologicalRealization>[];
}

/**
 * Return the more serious of two diagnostic severities.
 *
 * Existing Workbench parser semantics use "error" for a source that could not
 * become a complete feature object and "warning" when interpretation recovered.
 * The grouped card therefore becomes error-level if any contained diagnostic is
 * an error; otherwise it remains warning-level.
 */
function highestSeverity(
  left: WorkbenchDiagnosticSeverity,
  right: WorkbenchDiagnosticSeverity,
): WorkbenchDiagnosticSeverity {
  return left === "error" || right === "error" ? "error" : "warning";
}

/**
 * Produce a stable key for diagnostic de-duplication.
 *
 * The code is not sufficient by itself because the same diagnostic family can
 * legitimately apply to several fields. Including severity, field, and message
 * prevents repeated collection passes from duplicating one issue while keeping
 * genuinely distinct issues separate.
 */
function diagnosticKey(diagnostic: WorkbenchDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.field ?? "",
    diagnostic.message,
  ].join("\u0000");
}

/**
 * Determine whether one canonical unit occupies the same language scope as a
 * realization that refers to it.
 *
 * This mirrors PhonologyInventory.lookupId(id, languageId, language):
 *
 * - when the realization has a stable language ID, the unit must have that ID;
 * - when the realization has a language name, the unit must have that name;
 * - when neither scope is supplied, any loaded unit with the ID may resolve it.
 *
 * Both supplied filters must match. A same-named unit in another active
 * language must never make a broken local relationship appear valid.
 */
function unitResolvesRealization(
  unit: DiagnosticPhonologicalUnit,
  realization: DiagnosticPhonologicalRealization,
): boolean {
  if (unit.id.trim().toLowerCase() !== realization.unitId.trim().toLowerCase()) {
    return false;
  }

  if (
    realization.languageId &&
    unit.languageId !== realization.languageId
  ) {
    return false;
  }

  if (
    realization.language &&
    unit.language !== realization.language
  ) {
    return false;
  }

  return true;
}

/**
 * Build the current persistent diagnostic model from recognized source records.
 *
 * This function is intentionally observational:
 *
 * - it never edits a WorkbenchSourceRecord;
 * - it never rewrites a creator-authored note;
 * - it never decides that a rejected source may enter a clean feature index;
 * - it derives a fresh result each time so repaired/reparsed sources naturally
 *   disappear from the diagnostic view when their diagnostics disappear.
 *
 * The result contains only sources that currently have at least one issue.
 */
export function buildSourceDiagnosticGroups(
  input: BuildSourceDiagnosticGroupsInput,
): SourceDiagnosticGroup[] {
  const groups = new Map<
    string,
    {
      identity: WorkbenchIdentity;
      path: string;
      severity: WorkbenchDiagnosticSeverity;
      diagnostics: WorkbenchDiagnostic[];
      diagnosticKeys: Set<string>;
    }
  >();

  /**
   * Add one diagnostic without mutating the source record that produced it.
   *
   * Workbench identity is the primary grouping key. Path remains display and
   * navigation data; it is not asked to substitute for missing linguistic ID.
   */
  const addDiagnostic = (
    identity: WorkbenchIdentity,
    path: string,
    diagnostic: WorkbenchDiagnostic,
  ): void => {
    const key = identity.workbenchID;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        identity,
        path,
        severity: diagnostic.severity,
        diagnostics: [diagnostic],
        diagnosticKeys: new Set([diagnosticKey(diagnostic)]),
      });
      return;
    }

    const keyForDiagnostic = diagnosticKey(diagnostic);

    if (existing.diagnosticKeys.has(keyForDiagnostic)) {
      return;
    }

    existing.diagnosticKeys.add(keyForDiagnostic);
    existing.diagnostics.push(diagnostic);
    existing.severity = highestSeverity(
      existing.severity,
      diagnostic.severity,
    );
  };

  // First preserve every parser/inventory diagnostic already attached to a
  // recognized source. Clean records with no diagnostics intentionally produce
  // no creator-facing card.
  for (const record of input.records) {
    for (const diagnostic of record.diagnostics) {
      addDiagnostic(record.identity, record.path, diagnostic);
    }
  }

  const unitRecords = input.phonologyUnitRecords ?? [];
  const realizationRecords = input.phonologyRealizationRecords ?? [];

  // Relationship validation belongs here rather than inside the single-source
  // parser: a parser can establish that unit_id is structurally usable, but it
  // cannot know whether that ID resolves until the full current unit inventory
  // has been loaded.
  const units = unitRecords
    .map((record) => record.value)
    .filter(
      (unit): unit is DiagnosticPhonologicalUnit => unit !== null,
    );

  for (const record of realizationRecords) {
    const realization = record.value;

    // A malformed realization already has parser diagnostics explaining why it
    // could not become a complete value. Without a usable value there is no
    // trustworthy relationship to validate a second time.
    if (!realization) continue;

    const resolved = units.some((unit) =>
      unitResolvesRealization(unit, realization),
    );

    if (resolved) continue;

    addDiagnostic(record.identity, record.path, {
      code: "phonology.realization.unresolved-unit",
      severity: "warning",
      field: "unit_id",
      message:
        `Canonical unit "${realization.unitId}" does not resolve within ` +
        "this realization's current language scope. The realization source " +
        "is preserved and was not modified.",
    });
  }

  const result: SourceDiagnosticGroup[] = Array.from(groups.values()).map(
    ({ identity, path, severity, diagnostics }) => ({
      identity,
      path,
      severity,
      diagnostics: diagnostics.slice(),
    }),
  );

  // Error-containing notes come first so the most serious problems are visible
  // at the top of the panel. Within each severity class, path sorting gives a
  // deterministic order across reloads.
  result.sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === "error" ? -1 : 1;
    }

    return left.path.localeCompare(right.path);
  });

  return result;
}
