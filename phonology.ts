import { App, CachedMetadata, TFile, TFolder } from "obsidian";
import {
  resolveLanguageMembership,
  type LanguageMembershipMode,
} from "./language-membership";
import { parsePhonologySource } from "./phonology-source";
import type {
  PhonologySourceInput,
  PhonologySourceRecord,
} from "./phonology-source";
import type { WorkbenchSourceRecord } from "./workbench-source";

export type PhonologicalUnitStatus = "established" | "proposed" | "unresolved";

export interface PhonologicalUnit {
  // Stable identity for relationships from later phonotactics,
  // realizations, lexical evidence, and other phonology features.
  id: string;

  // The creator's notation for this contrastive unit.
  // Spoken languages will commonly use IPA here, but the base model
  // deliberately does not require IPA or a spoken modality.
  symbol: string;

  // Optional broad organizational category such as "consonant" or "vowel".
  // This remains open text because those categories are not universal across
  // every modality that Workbench may eventually document.
  category?: string;

  // Analytical status is separate from identity so a documented unit can
  // remain usable while its interpretation is still being worked out.
  status?: PhonologicalUnitStatus;

  // Human-readable language name and stable Language Profile identity are
  // kept separate so later relationships do not have to depend on names.
  language?: string;
  languageId?: string;

  notes?: string;

  // Canonical Markdown source for navigation and future evidence links.
  path?: string;
}

/**
 * Analytical status for a documented realization.
 *
 * A realization can be known even when the creator has not fully settled how
 * it should be analyzed. Keeping status on the realization itself lets, for
 * example, an established canonical unit have a proposed or unresolved
 * realization without changing the status of the unit as a whole.
 */
export type PhonologicalRealizationStatus =
  "established" | "proposed" | "unresolved";

/**
 * One documented realization of a canonical phonological unit.
 *
 * A realization is deliberately broader than "phone" or "allophone". Spoken
 * languages will commonly store phonetic IPA here, but other modalities may
 * use whatever notation describes the realized form of their contrastive unit.
 *
 * This first model records the relationship and descriptive evidence only.
 * It does not yet attempt to interpret environments as executable rules.
 */
export interface PhonologicalRealization {
  // Stable identity lets later evidence, diagnostics, lexical forms, or rules
  // refer to this particular realization without depending on its notation.
  id: string;

  // Stable ID of the canonical PhonologicalUnit that this realizes.
  // The relationship uses identity rather than symbol because symbols may
  // change or may not be unique across active languages.
  unitId: string;

  // The creator's notation for the realized form. For spoken languages this
  // will commonly be phonetic IPA such as [p] or [pʰ], but IPA is not required
  // by the underlying model.
  symbol: string;

  // Human-readable description of where this realization occurs.
  //
  // This intentionally remains text in the first layer. We should learn what
  // creators actually need to describe before designing a structured
  // phonological-environment or rule language.
  environment?: string;

  // A realization may remain usable documentation even while its analysis is
  // proposed or unresolved.
  status?: PhonologicalRealizationStatus;

  // Language identity is retained because unit IDs may legitimately be local
  // to a language rather than globally unique across the whole Workbench.
  language?: string;
  languageId?: string;

  notes?: string;

  // Canonical Markdown source when the realization comes from a note.
  // Keeping this optional leaves room for realizations later embedded in a
  // phonological-unit note without requiring a separate source file.
  path?: string;
}

/**
 * A configured source of canonical phonological-unit notes.
 *
 * The folder determines where units are discovered. Language information can
 * be supplied by the active Language Profile when an individual unit note does
 * not repeat it in frontmatter.
 */
export interface PhonologySource {
  folder: string;
  language?: string;
  languageId?: string;
}

/**
 * In-memory collection of documented contrastive phonological units.
 *
 * This first inventory deliberately does only a few things:
 * - discover explicitly marked phonological-unit notes;
 * - preserve their language identity;
 * - index them by stable unit ID.
 *
 * Realizations, allophones, phonotactics, feature systems, and diagnostics
 * belong to later layers rather than being folded into this basic loader.
 */
export class PhonologyInventory {
  private all: PhonologicalUnit[] = [];
  private byId = new Map<string, PhonologicalUnit[]>();

  // Realizations are kept in their own collection because they are evidence
  // about how canonical units are expressed, not canonical units themselves.
  private realizations: PhonologicalRealization[] = [];

  // Stable realization IDs support direct lookup, while the unit index lets
  // callers ask which realizations belong to a particular canonical unit.
  private realizationsById = new Map<string, PhonologicalRealization[]>();
  private realizationsByUnitId = new Map<string, PhonologicalRealization[]>();

  // Source records preserve recognized documents independently of whether
  // their linguistic data is complete enough to enter the clean inventory.
  // Keeping units and realizations separate gives callers strongly typed
  // diagnostic collections rather than a mixed union they must reinterpret.
  private unitSourceRecords: WorkbenchSourceRecord<PhonologicalUnit>[] = [];
  private realizationSourceRecords: WorkbenchSourceRecord<PhonologicalRealization>[] =
    [];

  // Workbench identity addresses the source record itself. This index is
  // deliberately separate from linguistic ID indexes: one must never silently
  // substitute for the other.
  private sourceByWorkbenchID = new Map<string, PhonologySourceRecord>();

  constructor(private app: App) {}

  /**
   * Remove every currently loaded unit.
   *
   * Reloading starts from an empty inventory so units from languages that are
   * no longer active cannot remain behind as stale data.
   */
  clear(): void {
    this.all = [];
    this.byId.clear();

    this.realizations = [];
    this.realizationsById.clear();
    this.realizationsByUnitId.clear();

    this.unitSourceRecords = [];
    this.realizationSourceRecords = [];
    this.sourceByWorkbenchID.clear();
  }

  /**
   * Return a copy of the loaded inventory rather than exposing the mutable
   * internal array directly.
   */
  allUnits(): PhonologicalUnit[] {
    return this.all.slice();
  }

  /**
   * Return a copy of every loaded realization.
   */
  allRealizations(): PhonologicalRealization[] {
    return this.realizations.slice();
  }

  /**
   * Return every recognized phonological-unit source record.
   *
   * This includes records whose value is null because the source was
   * recognized but could not safely become a complete canonical unit.
   */
  allUnitSourceRecords(): WorkbenchSourceRecord<PhonologicalUnit>[] {
    return this.unitSourceRecords.slice();
  }

  /**
   * Return every recognized phonological-realization source record.
   */
  allRealizationSourceRecords(): WorkbenchSourceRecord<PhonologicalRealization>[] {
    return this.realizationSourceRecords.slice();
  }

  /**
   * Look up one recognized phonology source by Workbench-owned identity.
   *
   * Workbench identity is a source handle only. Callers must not treat it as a
   * replacement for the creator-authored unit or realization ID.
   */
  lookupWorkbenchID(workbenchID: string): PhonologySourceRecord | undefined {
    return this.sourceByWorkbenchID.get(workbenchID);
  }

  /**
   * Find realizations by their own stable ID.
   *
   * Optional language filters mirror lookupId() so realization IDs can remain
   * local to a language when multiple active languages are loaded together.
   */
  lookupRealizationId(
    id: string,
    languageId?: string,
    language?: string,
  ): PhonologicalRealization[] {
    const normalized = id.trim().toLowerCase();
    if (!normalized) return [];

    const matches = this.realizationsById.get(normalized) ?? [];

    return matches.filter((realization) => {
      if (languageId && realization.languageId !== languageId) return false;
      if (language && realization.language !== language) return false;
      return true;
    });
  }

  /**
   * Find every realization associated with one canonical phonological unit.
   *
   * This is the important relationship lookup for the realization layer:
   * callers can begin with a canonical unit and discover its documented
   * realized forms without treating those forms as canonical units themselves.
   */
  lookupRealizationsForUnit(
    unitId: string,
    languageId?: string,
    language?: string,
  ): PhonologicalRealization[] {
    const normalized = unitId.trim().toLowerCase();
    if (!normalized) return [];

    const matches = this.realizationsByUnitId.get(normalized) ?? [];

    return matches.filter((realization) => {
      if (languageId && realization.languageId !== languageId) return false;
      if (language && realization.language !== language) return false;
      return true;
    });
  }

  /**
   * Find units by their stable ID.
   *
   * IDs are compared case-insensitively for lookup convenience. Optional
   * language filters let identical local IDs coexist across multiple active
   * languages without forcing language names into the IDs themselves.
   */
  lookupId(
    id: string,
    languageId?: string,
    language?: string,
  ): PhonologicalUnit[] {
    const normalized = id.trim().toLowerCase();
    if (!normalized) return [];

    const matches = this.byId.get(normalized) ?? [];

    return matches.filter((unit) => {
      if (languageId && unit.languageId !== languageId) return false;
      if (language && unit.language !== language) return false;
      return true;
    });
  }

  /**
   * Convenience wrapper for loading one configured phonology folder.
   */
  async loadFromFolder(
    folderPath: string,
    language?: string,
    languageId?: string,
  ): Promise<number> {
    return this.loadFromFolders([
      {
        folder: folderPath,
        language,
        languageId,
      },
    ]);
  }

  /**
   * Load canonical phonological-unit notes from every configured source.
   *
   * Explicit language metadata on the note wins. Source-level language data is
   * inherited only when the note omits it, matching the pattern used by the
   * other language-specific inventories.
   */
  async loadFromFolders(
    sources: PhonologySource[],
    membershipMode: LanguageMembershipMode = "respect-explicit",
  ): Promise<number> {
    this.clear();

    let count = 0;

    for (const source of sources) {
      const folderPath = source.folder.trim();
      if (!folderPath) continue;

      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) continue;

      const files = this.collectMarkdownFiles(folder);

      for (const file of files) {
        // Classify the source exactly once. A recognized-but-malformed unit or
        // realization remains a source record rather than falling through and
        // being mistaken for some other document type.
        const parsedSource = this.readSource(file);
        if (!parsedSource) continue;

        if (parsedSource.kind === "unit") {
          const record = parsedSource.record;
          const unit = record.value;

          // If the source is recognized but malformed, retain it for
          // diagnostics without pretending it is a complete linguistic unit.
          if (!unit) {
            this.addUnitSourceRecord(record);
            continue;
          }

          const membership = resolveLanguageMembership(
            source.language,
            unit.language,
            membershipMode,
          );
          if (!membership.accepted) continue;

          if (
            source.languageId &&
            unit.languageId &&
            unit.languageId !== source.languageId
          ) {
            continue;
          }

          // Assign runtime membership without modifying creator-authored YAML.
          unit.language = membership.runtimeLanguage;

          if (!unit.languageId && source.languageId) {
            unit.languageId = source.languageId;
          }

          this.addUnitSourceRecord(record);
          this.addUnit(unit);
          count++;
          continue;
        }

        const record = parsedSource.record;
        const realization = record.value;

        // Malformed recognized realizations remain available to diagnostics
        // but do not enter clean relationship indexes.
        if (!realization) {
          this.addRealizationSourceRecord(record);
          continue;
        }

        const membership = resolveLanguageMembership(
          source.language,
          realization.language,
          membershipMode,
        );
        if (!membership.accepted) continue;

        if (
          source.languageId &&
          realization.languageId &&
          realization.languageId !== source.languageId
        ) {
          continue;
        }

        // Assign runtime membership without modifying creator-authored YAML.
        realization.language = membership.runtimeLanguage;

        if (!realization.languageId && source.languageId) {
          realization.languageId = source.languageId;
        }

        this.addRealizationSourceRecord(record);

        // We deliberately load a realization even if its unit_id does not
        // currently resolve. Loading preserves the creator's documented data;
        // a later diagnostic layer can report broken relationships explicitly.
        this.addRealization(realization);
        count++;
      }
    }

    return count;
  }

  /**
   * Recursively gather Markdown files beneath a configured phonology folder.
   *
   * Folder organization is left to the creator; the `type:` marker, not a
   * particular subfolder layout, decides whether a note is a phonological unit.
   */
  private collectMarkdownFiles(folder: TFolder): TFile[] {
    const out: TFile[] = [];

    const walk = (current: TFolder) => {
      for (const child of current.children) {
        if (child instanceof TFile && child.extension === "md") {
          out.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };

    walk(folder);
    return out;
  }

  /**
   * Read one Markdown file through the phonology source adapter.
   *
   * This method knows how to obtain Obsidian metadata, but it deliberately does
   * not interpret YAML fields itself. That boundary lets future source forms
   * change without teaching the inventory about their representation details.
   */
  private readSource(file: TFile): PhonologySourceRecord | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const input: PhonologySourceInput = {
      path: file.path,
      frontmatter: cache.frontmatter ?? {},
    };

    return parsePhonologySource(input);
  }

  /**
   * Retain one recognized unit source and index its Workbench identity.
   */
  private addUnitSourceRecord(
    record: WorkbenchSourceRecord<PhonologicalUnit>,
  ): void {
    this.unitSourceRecords.push(record);
    this.sourceByWorkbenchID.set(record.identity.workbenchID, {
      kind: "unit",
      record,
    });
  }

  /**
   * Retain one recognized realization source and index its Workbench identity.
   */
  private addRealizationSourceRecord(
    record: WorkbenchSourceRecord<PhonologicalRealization>,
  ): void {
    this.realizationSourceRecords.push(record);
    this.sourceByWorkbenchID.set(record.identity.workbenchID, {
      kind: "realization",
      record,
    });
  }

  /**
   * Add one validated unit to both the complete inventory and the stable-ID
   * lookup index.
   */
  private addUnit(unit: PhonologicalUnit): void {
    this.all.push(unit);

    const key = unit.id.trim().toLowerCase();
    const existing = this.byId.get(key) ?? [];

    existing.push(unit);
    this.byId.set(key, existing);
  }

  /**
   * Add one validated realization to its complete collection and both lookup
   * indexes.
   *
   * One index answers "which realization has this ID?" while the other answers
   * the more linguistically useful "how can this canonical unit be realized?"
   */
  private addRealization(realization: PhonologicalRealization): void {
    this.realizations.push(realization);

    const idKey = realization.id.trim().toLowerCase();
    const byId = this.realizationsById.get(idKey) ?? [];

    byId.push(realization);
    this.realizationsById.set(idKey, byId);

    const unitKey = realization.unitId.trim().toLowerCase();
    const byUnit = this.realizationsByUnitId.get(unitKey) ?? [];

    byUnit.push(realization);
    this.realizationsByUnitId.set(unitKey, byUnit);
  }
}
