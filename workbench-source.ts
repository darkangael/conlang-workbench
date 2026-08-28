import { WorkbenchIdentity } from "./workbench-id";

/**
 * Severity of a source interpretation diagnostic.
 *
 * Warnings mean Workbench could still recover a usable value. Errors mean the
 * source remains known to Workbench but cannot currently become a complete
 * feature object.
 */
export type WorkbenchDiagnosticSeverity = "warning" | "error";

/**
 * A non-destructive explanation of something Workbench encountered while
 * interpreting a source.
 *
 * Diagnostics describe source data; they never authorize rewriting it.
 */
export interface WorkbenchDiagnostic {
  code: string;
  severity: WorkbenchDiagnosticSeverity;
  message: string;
  field?: string;
}

/**
 * Workbench's source-facing record for an interpreted object.
 *
 * `value` is null when the source is known but cannot safely be represented as
 * a complete feature object. Keeping the record lets Workbench surface the
 * problem and reparse the same source after the user repairs it.
 */
export interface WorkbenchSourceRecord<T> {
  identity: WorkbenchIdentity;
  path: string;
  value: T | null;
  diagnostics: WorkbenchDiagnostic[];
}
