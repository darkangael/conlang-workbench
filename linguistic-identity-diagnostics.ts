import {
  createObsidianWorkbenchIdentity,
  type WorkbenchIdentity,
} from "./workbench-id";
import type {
  WorkbenchDiagnostic,
  WorkbenchSourceRecord,
} from "./workbench-source";

/**
 * Minimal language scope shared by the linguistic objects whose IDs are
 * checked here.
 *
 * This module deliberately depends only on identity-bearing fields. It does
 * not need complete dictionary, morpheme, example, or phonology models, and it
 * receives no vault or writer API. Collision detection is observational only.
 */
export interface DiagnosticScopedValue {
  language?: string;
  languageId?: string;
}

/**
 * A structured lexical sense has identity only inside its owning lexeme.
 *
 * The remaining semantic fields are irrelevant to collision detection, so the
 * diagnostic boundary asks only for the optional nested ID.
 */
export interface DiagnosticLexicalSense {
  id?: string;
}

/**
 * Dictionary values add nested senses to the common language scope.
 */
export interface DiagnosticDictionaryValue extends DiagnosticScopedValue {
  senses?: readonly DiagnosticLexicalSense[];
}

/**
 * Minimal canonical-unit shape needed for relationship validation.
 */
export interface DiagnosticPhonologicalUnitValue
  extends DiagnosticScopedValue {
  id: string;
}

/**
 * Minimal realization shape needed to resolve its declared canonical unit.
 */
export interface DiagnosticPhonologicalRealizationValue
  extends DiagnosticScopedValue {
  unitId: string;
}

/**
 * A loaded Language Profile is a creator source as well as the provider of a
 * stable language identity.
 *
 * Path is retained so every distinct colliding profile can receive its own
 * diagnostic card and existing Open note action.
 */
export interface DiagnosticLanguageProfile {
  id: string;
  path: string;
}

/**
 * One derived diagnostic destined for an existing source diagnostic group.
 *
 * Returning data instead of mutating WorkbenchSourceRecord keeps this module
 * from altering parser results or acquiring creator-data mutation authority.
 */
export interface DerivedIdentityDiagnostic {
  identity: WorkbenchIdentity;
  path: string;
  diagnostic: WorkbenchDiagnostic;
}

/**
 * Identity-bearing source collections remain separate by document type.
 *
 * This separation is essential: the same object ID may legitimately appear on
 * a lexeme, morpheme, example, unit, and realization. Combining those arrays
 * before collision detection would manufacture false cross-type collisions.
 */
export interface LinguisticIdentityDiagnosticInput {
  languageProfiles?: readonly DiagnosticLanguageProfile[];
  dictionaryRecords?: readonly WorkbenchSourceRecord<DiagnosticDictionaryValue>[];
  morphemeRecords?: readonly WorkbenchSourceRecord<DiagnosticScopedValue>[];
  exampleRecords?: readonly WorkbenchSourceRecord<DiagnosticScopedValue>[];
  phonologyUnitRecords?: readonly WorkbenchSourceRecord<DiagnosticPhonologicalUnitValue>[];
  phonologyRealizationRecords?: readonly WorkbenchSourceRecord<DiagnosticPhonologicalRealizationValue>[];
}

/**
 * Normalize top-level object IDs exactly as current morpheme and phonology
 * indexes do: surrounding whitespace is ignored and comparison is
 * case-insensitive.
 *
 * This produces only a derived comparison key. Creator-authored IDs remain
 * untouched on their runtime objects and Markdown sources.
 */
export function normalizeObjectIdentity(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Derive the language portion of a top-level object identity.
 *
 * Stable language identity takes precedence when available. The readable
 * language name supports legacy sources whose active configuration has no
 * Language Profile. Truly unscoped objects share an explicit unscoped domain
 * rather than borrowing an ID or filename as invented language authority.
 */
export function languageIdentityScope(
  value: DiagnosticScopedValue,
): string {
  const languageId = value.languageId?.trim();
  if (languageId) return `language-id:${languageId}`;

  const language = value.language?.trim();
  if (language) return `language-name:${language}`;

  return "language-unscoped";
}


interface ObjectIdentityDomain<T extends DiagnosticScopedValue> {
  records: readonly WorkbenchSourceRecord<T>[];
  field: string;
  objectLabel: string;
}

/**
 * Describe the other source paths participating in one collision.
 *
 * Every colliding source receives its own diagnostic card. Naming the remaining
 * paths tells the creator which notes to open and compare before deciding
 * whether to keep both objects, change an ID, merge notes, or delete a note.
 */
function describeOtherPaths(paths: string[]): string {
  return paths.map((path) => `"${path}"`).join(", ");
}

/**
 * Detect duplicate top-level object IDs inside one document-type domain.
 *
 * Only complete accepted runtime values participate. A malformed or
 * language-rejected record remains available through its existing diagnostics,
 * but it does not establish enough trusted scope to accuse a clean object of an
 * identity collision.
 *
 * The bucket contains arrays rather than one Map value so no source wins merely
 * because it was loaded first or last.
 */
function collectObjectDomainCollisions<T extends DiagnosticScopedValue>(
  domain: ObjectIdentityDomain<T>,
): DerivedIdentityDiagnostic[] {
  const buckets = new Map<string, WorkbenchSourceRecord<T>[]>();

  for (const record of domain.records) {
    const value = record.value;
    const linguisticId = record.identity.linguisticID;

    if (!value || !linguisticId) continue;

    const normalizedId = normalizeObjectIdentity(linguisticId);
    if (!normalizedId) continue;

    const key = `${languageIdentityScope(value)}\u0000${normalizedId}`;
    const bucket = buckets.get(key) ?? [];

    // Defensive de-duplication by Workbench source identity prevents repeated
    // collection of one physical source from manufacturing a collision.
    if (
      !bucket.some(
        (candidate) =>
          candidate.identity.workbenchID === record.identity.workbenchID,
      )
    ) {
      bucket.push(record);
      buckets.set(key, bucket);
    }
  }

  const diagnostics: DerivedIdentityDiagnostic[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    for (const record of bucket) {
      const otherPaths = bucket
        .filter(
          (candidate) =>
            candidate.identity.workbenchID !== record.identity.workbenchID,
        )
        .map((candidate) => candidate.path)
        .sort((left, right) => left.localeCompare(right));

      diagnostics.push({
        identity: record.identity,
        path: record.path,
        diagnostic: {
          code: `identity.duplicate-${domain.field.replace(/_/g, "-")}`,
          severity: "warning",
          field: domain.field,
          message:
            `${domain.objectLabel} ID ` +
            `"${record.identity.linguisticID}" is also used by ` +
            `${describeOtherPaths(otherPaths)} in the same language and ` +
            "document-type identity domain. Every source was preserved; " +
            "open the affected notes and decide whether they should remain " +
            "separate, receive distinct IDs, be merged, or be deleted.",
        },
      });
    }
  }

  return diagnostics;
}

/**
 * Diagnose repeated sense IDs only within their owning lexical entry.
 *
 * Sense IDs are nested identity, not language-wide object identity. Two
 * different lexemes may both use an ID such as "primary" without colliding.
 * Until a sense-ID lookup contract exists, comparison preserves the parser's
 * current exact-after-trimming semantics instead of inventing case folding.
 */
function collectLexicalSenseCollisions(
  records: readonly WorkbenchSourceRecord<DiagnosticDictionaryValue>[],
): DerivedIdentityDiagnostic[] {
  const diagnostics: DerivedIdentityDiagnostic[] = [];

  for (const record of records) {
    const senses = record.value?.senses;
    if (!senses || senses.length < 2) continue;

    const counts = new Map<string, number>();

    for (const sense of senses) {
      const id = sense.id?.trim();
      if (!id) continue;

      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    for (const [id, count] of counts) {
      if (count < 2) continue;

      diagnostics.push({
        identity: record.identity,
        path: record.path,
        diagnostic: {
          code: "identity.duplicate-lexical-sense-id",
          severity: "warning",
          field: "Senses / ID",
          message:
            `Lexical sense ID "${id}" appears ${count} times in this lexical ` +
            "entry. Every sense was preserved; open the note and decide " +
            "whether the senses should be merged, deleted, or assigned " +
            "distinct IDs.",
        },
      });
    }
  }

  return diagnostics;
}

/**
 * Test whether one canonical unit is a valid target in the realization's
 * current language scope.
 *
 * Both stable and readable language fields are checked when present. This
 * mirrors the established lookup behavior and prevents a same-ID unit from
 * another active language from satisfying the relationship accidentally.
 */
function unitMatchesRealization(
  unit: DiagnosticPhonologicalUnitValue,
  realization: DiagnosticPhonologicalRealizationValue,
): boolean {
  if (
    normalizeObjectIdentity(unit.id) !==
    normalizeObjectIdentity(realization.unitId)
  ) {
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
 * Diagnose phonological relationships by cardinality rather than by existence
 * alone.
 *
 * Zero matching units is unresolved, one is uniquely resolved, and more than
 * one is ambiguous. The realization remains preserved in every case; this
 * observational layer never chooses a target or edits any affected note.
 */
function collectPhonologyRelationshipDiagnostics(
  unitRecords: readonly WorkbenchSourceRecord<DiagnosticPhonologicalUnitValue>[],
  realizationRecords: readonly WorkbenchSourceRecord<DiagnosticPhonologicalRealizationValue>[],
): DerivedIdentityDiagnostic[] {
  const diagnostics: DerivedIdentityDiagnostic[] = [];
  const completeUnits = unitRecords.filter(
    (
      record,
    ): record is WorkbenchSourceRecord<DiagnosticPhonologicalUnitValue> & {
      value: DiagnosticPhonologicalUnitValue;
    } => record.value !== null,
  );

  for (const record of realizationRecords) {
    const realization = record.value;
    if (!realization) continue;

    const targets = completeUnits.filter((unitRecord) =>
      unitMatchesRealization(unitRecord.value, realization),
    );

    if (targets.length === 1) continue;

    if (targets.length === 0) {
      diagnostics.push({
        identity: record.identity,
        path: record.path,
        diagnostic: {
          code: "phonology.realization.unresolved-unit",
          severity: "warning",
          field: "unit_id",
          message:
            `Canonical unit "${realization.unitId}" does not resolve within ` +
            "this realization's current language scope. The realization " +
            "source was preserved and was not modified.",
        },
      });
      continue;
    }

    const targetPaths = targets
      .map((target) => target.path)
      .sort((left, right) => left.localeCompare(right));

    diagnostics.push({
      identity: record.identity,
      path: record.path,
      diagnostic: {
        code: "phonology.realization.ambiguous-unit",
        severity: "warning",
        field: "unit_id",
        message:
          `Canonical unit "${realization.unitId}" resolves to multiple ` +
          `same-language unit notes: ${describeOtherPaths(targetPaths)}. ` +
          "The realization and every candidate unit were preserved; open " +
          "the affected notes and resolve the duplicate unit identity before " +
          "relying on this relationship.",
      },
    });
  }

  return diagnostics;
}

/**
 * Diagnose distinct Language Profile notes that claim one stable language ID.
 *
 * Language IDs retain their current exact string semantics. Unlike morpheme and
 * phonology object indexes, existing language-authority comparison does not
 * lowercase these IDs.
 *
 * Repeated use of the same physical profile path is de-duplicated first. That
 * configuration may deserve separate review, but it is not two creator notes
 * colliding with one another.
 */
function collectLanguageProfileCollisions(
  profiles: readonly DiagnosticLanguageProfile[],
): DerivedIdentityDiagnostic[] {
  const profilesByPath = new Map<string, DiagnosticLanguageProfile>();

  for (const profile of profiles) {
    if (!profilesByPath.has(profile.path)) {
      profilesByPath.set(profile.path, profile);
    }
  }

  const buckets = new Map<string, DiagnosticLanguageProfile[]>();

  for (const profile of profilesByPath.values()) {
    const id = profile.id.trim();
    if (!id) continue;

    const bucket = buckets.get(id) ?? [];
    bucket.push(profile);
    buckets.set(id, bucket);
  }

  const diagnostics: DerivedIdentityDiagnostic[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    for (const profile of bucket) {
      const otherPaths = bucket
        .filter((candidate) => candidate.path !== profile.path)
        .map((candidate) => candidate.path)
        .sort((left, right) => left.localeCompare(right));

      diagnostics.push({
        identity: createObsidianWorkbenchIdentity(profile.path, profile.id),
        path: profile.path,
        diagnostic: {
          code: "identity.duplicate-language-id",
          severity: "warning",
          field: "language_id",
          message:
            `Language Profile ID "${profile.id}" is also used by ` +
            `${describeOtherPaths(otherPaths)}. Every profile source was ` +
            "preserved; open the affected notes and decide whether they " +
            "describe one language that should share a single profile or " +
            "distinct languages that require distinct IDs.",
        },
      });
    }
  }

  return diagnostics;
}

/**
 * Build every identity diagnostic that depends on comparing loaded sources.
 *
 * One public entry point keeps source-diagnostics.ts responsible for grouping
 * and presentation while this module owns domain-aware collisions, nested
 * lexical-sense identity, and phonological relationship cardinality.
 */
export function buildLinguisticIdentityDiagnostics(
  input: LinguisticIdentityDiagnosticInput,
): DerivedIdentityDiagnostic[] {
  const diagnostics: DerivedIdentityDiagnostic[] = [
    ...collectLanguageProfileCollisions(input.languageProfiles ?? []),
    ...collectLexicalSenseCollisions(input.dictionaryRecords ?? []),
    ...collectPhonologyRelationshipDiagnostics(
      input.phonologyUnitRecords ?? [],
      input.phonologyRealizationRecords ?? [],
    ),
  ];

  const domains: ObjectIdentityDomain<DiagnosticScopedValue>[] = [
    {
      records: input.dictionaryRecords ?? [],
      field: "lexeme_id",
      objectLabel: "Lexeme",
    },
    {
      records: input.morphemeRecords ?? [],
      field: "morpheme_id",
      objectLabel: "Morpheme",
    },
    {
      records: input.exampleRecords ?? [],
      field: "example_id",
      objectLabel: "Linguistic example",
    },
    {
      records: input.phonologyUnitRecords ?? [],
      field: "unit_id",
      objectLabel: "Phonological unit",
    },
    {
      records: input.phonologyRealizationRecords ?? [],
      field: "realization_id",
      objectLabel: "Phonological realization",
    },
  ];

  for (const domain of domains) {
    diagnostics.push(...collectObjectDomainCollisions(domain));
  }

  return diagnostics;
}
