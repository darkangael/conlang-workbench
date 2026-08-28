import { App, CachedMetadata, TFile, TFolder } from "obsidian";

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
 * Convert a Markdown note's frontmatter into one canonical phonological
 * realization.
 *
 * This parser mirrors the intentionally small scope of parsePhonologicalUnit:
 * it recognizes only fields that belong to the first realization layer.
 * Environments remain descriptive text for now rather than executable rules.
 */
export function parsePhonologicalRealization(
  frontmatter: Record<string, unknown>,
  path?: string,
): PhonologicalRealization | null {
  const type =
    typeof frontmatter.type === "string" ? frontmatter.type.trim() : "";

  // Realizations are separate canonical documents from phonological units.
  // Keeping the document types distinct prevents a unit note from being
  // accidentally interpreted as one of its realizations.
  if (type !== "phonological-realization") {
    return null;
  }

  const rawId =
    frontmatter.realization_id ??
    frontmatter.realizationId ??
    frontmatter["realization-id"];

  const id = typeof rawId === "string" ? rawId.trim() : "";

  const rawUnitId =
    frontmatter.unit_id ?? frontmatter.unitId ?? frontmatter["unit-id"];

  const unitId = typeof rawUnitId === "string" ? rawUnitId.trim() : "";

  const symbol =
    typeof frontmatter.symbol === "string" ? frontmatter.symbol.trim() : "";

  // A realization is only useful when it has its own stable identity, a
  // canonical unit relationship, and a representation of the realized form.
  if (!id || !unitId || !symbol) {
    return null;
  }

  const environment =
    typeof frontmatter.environment === "string"
      ? frontmatter.environment.trim()
      : undefined;

  const language =
    typeof frontmatter.language === "string"
      ? frontmatter.language.trim()
      : undefined;

  const rawLanguageId =
    frontmatter.language_id ??
    frontmatter.languageId ??
    frontmatter["language-id"];

  const languageId =
    typeof rawLanguageId === "string" ? rawLanguageId.trim() : undefined;

  const notes =
    typeof frontmatter.notes === "string"
      ? frontmatter.notes.trim()
      : undefined;

  const rawStatus =
    typeof frontmatter.status === "string"
      ? frontmatter.status.trim()
      : undefined;

  const status: PhonologicalRealizationStatus | undefined =
    rawStatus === "established" ||
    rawStatus === "proposed" ||
    rawStatus === "unresolved"
      ? rawStatus
      : undefined;

  return {
    id,
    unitId,
    symbol,
    environment: environment || undefined,
    status,
    language: language || undefined,
    languageId: languageId || undefined,
    notes: notes || undefined,
    path,
  };
}

/**
 * Convert a Markdown note's frontmatter into one canonical phonological unit.
 *
 * This parser is intentionally small for the first milestone. It only accepts
 * the fields we have actually decided are part of the stable base model.
 * Later phonology features can add their own structures without forcing this
 * object to become a catch-all for every possible analysis.
 */
export function parsePhonologicalUnit(
  frontmatter: Record<string, unknown>,
  path?: string,
): PhonologicalUnit | null {
  const type =
    typeof frontmatter.type === "string" ? frontmatter.type.trim() : "";

  // Only notes explicitly marked as phonological units belong in this
  // inventory. Other notes may live in the same folder later.
  if (type !== "phonological-unit") {
    return null;
  }

  const rawId =
    frontmatter.unit_id ?? frontmatter.unitId ?? frontmatter["unit-id"];

  const id = typeof rawId === "string" ? rawId.trim() : "";

  const symbol =
    typeof frontmatter.symbol === "string" ? frontmatter.symbol.trim() : "";

  // Identity and representation are the minimum information required for a
  // useful canonical unit. If either is missing, the note is not loadable.
  if (!id || !symbol) {
    return null;
  }

  const category =
    typeof frontmatter.category === "string"
      ? frontmatter.category.trim()
      : undefined;

  const language =
    typeof frontmatter.language === "string"
      ? frontmatter.language.trim()
      : undefined;

  const rawLanguageId =
    frontmatter.language_id ??
    frontmatter.languageId ??
    frontmatter["language-id"];

  const languageId =
    typeof rawLanguageId === "string" ? rawLanguageId.trim() : undefined;

  const notes =
    typeof frontmatter.notes === "string"
      ? frontmatter.notes.trim()
      : undefined;

  const rawStatus =
    typeof frontmatter.status === "string"
      ? frontmatter.status.trim()
      : undefined;

  const status: PhonologicalUnitStatus | undefined =
    rawStatus === "established" ||
    rawStatus === "proposed" ||
    rawStatus === "unresolved"
      ? rawStatus
      : undefined;

  return {
    id,
    symbol,
    category: category || undefined,
    status,
    language: language || undefined,
    languageId: languageId || undefined,
    notes: notes || undefined,
    path,
  };
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
  async loadFromFolders(sources: PhonologySource[]): Promise<number> {
    this.clear();

    let count = 0;

    for (const source of sources) {
      const folderPath = source.folder.trim();
      if (!folderPath) continue;

      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) continue;

      const files = this.collectMarkdownFiles(folder);

      for (const file of files) {
        // A phonology folder may contain both canonical units and realization
        // notes. Try the canonical-unit parser first; its explicit type marker
        // prevents a realization note from being mistaken for a unit.
        const unit = this.readUnit(file);

        if (unit) {
          // If both the source and the note explicitly name a language, they
          // must agree. This prevents a misplaced note from silently entering
          // the wrong active language's inventory.
          if (
            source.language &&
            unit.language &&
            unit.language !== source.language
          ) {
            continue;
          }

          if (
            source.languageId &&
            unit.languageId &&
            unit.languageId !== source.languageId
          ) {
            continue;
          }

          // A configured language provides context for simpler notes that do
          // not need to repeat the same language metadata individually.
          if (!unit.language && source.language) {
            unit.language = source.language;
          }

          if (!unit.languageId && source.languageId) {
            unit.languageId = source.languageId;
          }

          this.addUnit(unit);
          count++;
          continue;
        }

        // If the file was not a canonical unit, give the realization parser a
        // chance to recognize it. Other Markdown files remain ignored.
        const realization = this.readRealization(file);
        if (!realization) continue;

        // Realizations use the same language-boundary protection as units.
        if (
          source.language &&
          realization.language &&
          realization.language !== source.language
        ) {
          continue;
        }

        if (
          source.languageId &&
          realization.languageId &&
          realization.languageId !== source.languageId
        ) {
          continue;
        }

        if (!realization.language && source.language) {
          realization.language = source.language;
        }

        if (!realization.languageId && source.languageId) {
          realization.languageId = source.languageId;
        }

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
   * Parse one Markdown file using Obsidian's cached frontmatter.
   */
  private readUnit(file: TFile): PhonologicalUnit | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const frontmatter = cache.frontmatter ?? {};

    return parsePhonologicalUnit(frontmatter, file.path);
  }

  /**
   * Parse one Markdown file as a phonological realization.
   *
   * Reading remains separate from indexing so parsing can later support other
   * storage representations without changing how the inventory is queried.
   */
  private readRealization(file: TFile): PhonologicalRealization | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const frontmatter = cache.frontmatter ?? {};

    return parsePhonologicalRealization(frontmatter, file.path);
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
