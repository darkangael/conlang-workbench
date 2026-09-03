import type {
  WorkbenchDiagnostic,
  WorkbenchDiagnosticSeverity,
  WorkbenchSourceRecord,
} from "./workbench-source";
import type { WorkbenchIdentity } from "./workbench-id";
import {
  buildLinguisticIdentityDiagnostics,
  type DiagnosticDictionaryValue,
  type DiagnosticLanguageProfile,
  type DiagnosticPhonologicalRealizationValue,
  type DiagnosticPhonologicalUnitValue,
  type DiagnosticScopedValue,
} from "./linguistic-identity-diagnostics";

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
 * Input for rebuilding the current creator-facing diagnostic state.
 *
 * `records` contains every recognized source whose existing parser or
 * inventory diagnostics should be surfaced. Identity-bearing collections are
 * also supplied separately because collision rules depend on document type,
 * language scope, nested lexical ownership, and relationship cardinality.
 *
 * The same records may therefore appear in `records` and one specialized
 * collection. This is deliberate: the first role preserves existing source
 * diagnostics, while the second derives cross-record identity diagnostics.
 *
 * Readonly arrays make an important authority promise explicit: aggregation may
 * inspect current runtime records, but it cannot replace array elements or use
 * this API as a mutation path back into the inventories.
 */
export interface BuildSourceDiagnosticGroupsInput {
  records: readonly WorkbenchSourceRecord<unknown>[];
  languageProfiles?: readonly DiagnosticLanguageProfile[];
  dictionaryRecords?: readonly WorkbenchSourceRecord<DiagnosticDictionaryValue>[];
  morphemeRecords?: readonly WorkbenchSourceRecord<DiagnosticScopedValue>[];
  exampleRecords?: readonly WorkbenchSourceRecord<DiagnosticScopedValue>[];
  phonologyUnitRecords?: readonly WorkbenchSourceRecord<DiagnosticPhonologicalUnitValue>[];
  phonologyRealizationRecords?: readonly WorkbenchSourceRecord<DiagnosticPhonologicalRealizationValue>[];

  // Relationship diagnostics must use the same settled lexical comparison
  // policy as the live Dictionary indexes.
  caseSensitiveMatching?: boolean;
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

  /*
   * Cross-record identity checks remain separate from parser diagnostics.
   * They compare only the complete, already-loaded runtime snapshot and return
   * fresh observational warnings. Feeding them through addDiagnostic() gives
   * every affected source its own navigable card without modifying the source
   * record or creator-authored note.
   */
  for (const derived of buildLinguisticIdentityDiagnostics(input)) {
    addDiagnostic(
      derived.identity,
      derived.path,
      derived.diagnostic,
    );
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
