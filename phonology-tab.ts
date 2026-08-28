import { TFile } from "obsidian";
import type ConlangPlugin from "./main";
import type { PhonologicalUnit, PhonologicalUnitStatus } from "./phonology";

/**
 * UI controller for the Phonology Inventory tab.
 *
 * Phonological data and indexing belong to PhonologyInventory in phonology.ts.
 * This class is responsible only for presenting that data and handling
 * interactions inside the Phonology tab.
 *
 * Keeping this UI in its own module follows the same boundary as the Morpheme
 * and Linguistic Example tabs: panel.ts hosts the feature, but does not own it.
 */
export class PhonologyTab {
  private rootEl: HTMLElement | null = null;
  private searchQuery = "";
  private categoryFilter = "";
  private statusFilter = "";
  private summaryEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;

  constructor(private plugin: ConlangPlugin) {}

  /**
   * Attach the tab to a container owned by the main panel.
   */
  mount(container: HTMLElement): void {
    this.rootEl = container;
    this.render();
  }

  /**
   * Rebuild the complete Phonology tab.
   *
   * Search and filter controls are persistent between ordinary result updates.
   * Routine filtering therefore uses renderResults() instead of recreating the
   * entire tab, which prevents the search field from losing keyboard focus.
   */
  render(): void {
    if (!this.rootEl) return;

    this.rootEl.empty();

    this.renderSearch();

    this.summaryEl = this.rootEl.createDiv({
      cls: "conlang-phonology-summary-container",
    });

    this.listEl = this.rootEl.createDiv({
      cls: "conlang-phonology-list",
    });

    this.renderResults();
  }

  /**
   * Refresh the displayed units from the current PhonologyInventory.
   *
   * The inventory remains the source of truth. This UI only filters and sorts
   * the units for presentation and does not modify the underlying analysis.
   */
  private renderResults(): void {
    if (!this.summaryEl || !this.listEl) return;

    const units = this.plugin.phonology.allUnits();
    const filtered = this.filterUnits(units);

    this.summaryEl.empty();
    this.listEl.empty();

    if (units.length === 0) {
      this.summaryEl.createDiv({
        cls: "conlang-phonology-empty",
        text: "No phonological units are documented for the active language(s).",
      });
      return;
    }

    this.renderSummary(filtered, units.length);

    if (filtered.length === 0) {
      this.listEl.createDiv({
        cls: "conlang-phonology-empty",
        text: "No matching phonological units.",
      });
      return;
    }

    this.renderList(filtered);
  }

  /**
   * Render units in a stable display order.
   *
   * Category is used as the broadest grouping signal available in Milestone 1,
   * followed by the creator's visible symbol. We sort a copy so presentation
   * never changes the inventory's underlying load order.
   */
  private renderList(units: PhonologicalUnit[]): void {
    if (!this.listEl) return;

    const sorted = units.slice().sort((a, b) => {
      const categoryCompare = (a.category ?? "").localeCompare(
        b.category ?? "",
      );

      if (categoryCompare !== 0) return categoryCompare;

      return a.symbol.localeCompare(b.symbol);
    });

    for (const unit of sorted) {
      this.renderRow(this.listEl, unit);
    }
  }

  /**
   * Render one contrastive unit as a compact clickable row.
   *
   * The symbol is intentionally the strongest visual element. Category and
   * analytical status are supporting information; the stable ID remains an
   * internal relationship key rather than becoming normal display clutter.
   */
  private renderRow(parent: HTMLElement, unit: PhonologicalUnit): void {
    const row = parent.createDiv({
      cls: "conlang-phonology-row",
    });

    // Category-specific classes give CSS room to distinguish common categories
    // later without restricting creators to a closed category vocabulary.
    if (unit.category) {
      const categoryClass = unit.category
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-");

      if (categoryClass) {
        row.addClass(`category-${categoryClass}`);
      }
    }

    const head = row.createDiv({
      cls: "conlang-phonology-row-head",
    });

    head.createSpan({
      cls: "conlang-phonology-symbol",
      text: unit.symbol,
    });

    const metadata = [unit.category, unit.status].filter(
      (value): value is string => Boolean(value),
    );

    if (metadata.length > 0) {
      head.createSpan({
        cls: "conlang-phonology-meta",
        text: metadata.join(" · "),
      });
    }

    if (unit.notes) {
      row.createDiv({
        cls: "conlang-phonology-notes",
        text: unit.notes,
      });
    }

    if (this.plugin.getActiveLanguages().length > 1 && unit.language) {
      row.createDiv({
        cls: "conlang-phonology-language",
        text: unit.language,
      });
    }

    // Realizations belong visually beneath their canonical unit rather than
    // appearing as peers in the contrastive inventory. This preserves the
    // distinction between a phonological unit such as /p/ and one of its
    // documented realized forms such as [pʰ].
    const realizations = this.plugin.phonology.lookupRealizationsForUnit(
      unit.id,
      unit.languageId,
      unit.language,
    );

    if (realizations.length > 0) {
      const realizationSection = row.createDiv({
        cls: "conlang-phonology-realizations",
      });

      realizationSection.createDiv({
        cls: "conlang-phonology-realizations-label",
        text: "Realizations",
      });

      const sortedRealizations = realizations
        .slice()
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

      for (const realization of sortedRealizations) {
        const realizationRow = realizationSection.createDiv({
          cls: "conlang-phonology-realization",
        });

        const realizationHead = realizationRow.createDiv({
          cls: "conlang-phonology-realization-head",
        });

        realizationHead.createSpan({
          cls: "conlang-phonology-realization-symbol",
          text: realization.symbol,
        });

        if (realization.status) {
          realizationHead.createSpan({
            cls: "conlang-phonology-realization-status",
            text: realization.status,
          });
        }

        if (realization.environment) {
          realizationRow.createDiv({
            cls: "conlang-phonology-realization-environment",
            text: realization.environment,
          });
        }
      }
    }

    // A path is optional in the base model because a PhonologicalUnit can
    // theoretically exist before being associated with a Markdown source.
    // Loaded inventory units normally have one, so only make those rows
    // navigable.
    if (unit.path) {
      row.addClass("conlang-clickable");
      row.title = "Open phonological unit note";

      row.addEventListener("click", () => {
        void this.openUnit(unit);
      });
    }
  }

  /**
   * Build persistent search, category, and analytical-status controls.
   */
  private renderSearch(): void {
    if (!this.rootEl) return;

    const toolbar = this.rootEl.createDiv({
      cls: "conlang-browser-toolbar",
    });

    const searchInput = toolbar.createEl("input", {
      type: "search",
      cls: "conlang-browser-search",
      placeholder: "Search symbols, categories, or notes…",
    });

    searchInput.value = this.searchQuery;

    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderResults();
    });

    const controlsRow = this.rootEl.createDiv({
      cls: "conlang-browser-controls",
    });

    const categoryLabel = controlsRow.createSpan({
      cls: "conlang-browser-control-label",
    });
    categoryLabel.setText("Category");

    const categorySelect = controlsRow.createEl("select", {
      cls: "conlang-browser-select",
    });

    categorySelect.createEl("option", {
      text: "All",
      value: "",
    });

    const units = this.plugin.phonology.allUnits();

    for (const category of this.getAvailableCategories(units)) {
      categorySelect.createEl("option", {
        text: category,
        value: category,
      });
    }

    categorySelect.value = this.categoryFilter;

    categorySelect.addEventListener("change", () => {
      this.categoryFilter = categorySelect.value;
      this.renderResults();
    });

    const statusLabel = controlsRow.createSpan({
      cls: "conlang-browser-control-label",
    });
    statusLabel.setText("Status");

    const statusSelect = controlsRow.createEl("select", {
      cls: "conlang-browser-select",
    });

    statusSelect.createEl("option", {
      text: "All",
      value: "",
    });

    const statuses: PhonologicalUnitStatus[] = [
      "established",
      "proposed",
      "unresolved",
    ];

    for (const status of statuses) {
      statusSelect.createEl("option", {
        text: status,
        value: status,
      });
    }

    statusSelect.value = this.statusFilter;

    statusSelect.addEventListener("change", () => {
      this.statusFilter = statusSelect.value;
      this.renderResults();
    });
  }

  /**
   * Apply category, status, and text-search filters with AND semantics.
   *
   * Search deliberately includes the stable ID even though the ID is not
   * normally displayed. This makes structural identifiers useful to creators
   * and future debugging tools without requiring them to clutter every row.
   */
  private filterUnits(units: PhonologicalUnit[]): PhonologicalUnit[] {
    const query = this.searchQuery.trim().toLowerCase();

    return units.filter((unit) => {
      if (
        this.categoryFilter &&
        unit.category?.trim().toLowerCase() !==
          this.categoryFilter.toLowerCase()
      ) {
        return false;
      }

      if (this.statusFilter && unit.status !== this.statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      if (unit.symbol.toLowerCase().includes(query)) return true;
      if (unit.id.toLowerCase().includes(query)) return true;
      if (unit.category?.toLowerCase().includes(query)) return true;
      if (unit.status?.toLowerCase().includes(query)) return true;
      if (unit.notes?.toLowerCase().includes(query)) return true;
      if (unit.language?.toLowerCase().includes(query)) return true;

      // Realizations are displayed as part of their canonical unit's card, so
      // visible realization data should also be searchable. A match still
      // returns the canonical unit rather than treating the realization as an
      // independent inventory result.
      const realizations = this.plugin.phonology.lookupRealizationsForUnit(
        unit.id,
        unit.languageId,
        unit.language,
      );

      const realizationMatches = realizations.some((realization) => {
        if (realization.symbol.toLowerCase().includes(query)) return true;
        if (realization.id.toLowerCase().includes(query)) return true;
        if (realization.environment?.toLowerCase().includes(query)) return true;
        if (realization.status?.toLowerCase().includes(query)) return true;
        if (realization.notes?.toLowerCase().includes(query)) return true;
        if (realization.language?.toLowerCase().includes(query)) return true;

        return false;
      });

      if (realizationMatches) return true;

      return false;
    });
  }

  /**
   * Build the Category filter from both common spoken-language categories and
   * categories actually present in the loaded inventory.
   *
   * "consonant" and "vowel" are conveniences rather than a universal taxonomy.
   * Creator-defined and modality-specific categories remain fully valid.
   */
  private getAvailableCategories(units: PhonologicalUnit[]): string[] {
    const categories = new Set<string>(["consonant", "vowel"]);

    for (const unit of units) {
      const category = unit.category?.trim().toLowerCase();
      if (category) {
        categories.add(category);
      }
    }

    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Display either the complete inventory size or the size of the filtered
   * result set.
   */
  private renderSummary(units: PhonologicalUnit[], total: number): void {
    if (!this.summaryEl) return;

    const shown = units.length;

    this.summaryEl.createDiv({
      cls: "conlang-phonology-summary",
      text:
        shown === total
          ? `${total} ${total === 1 ? "unit" : "units"}`
          : `${shown} of ${total} shown`,
    });
  }

  /**
   * Open the canonical Markdown source for a loaded phonological unit.
   */
  private async openUnit(unit: PhonologicalUnit): Promise<void> {
    if (!unit.path) return;

    const file = this.plugin.app.vault.getAbstractFileByPath(unit.path);

    if (file instanceof TFile) {
      await this.plugin.app.workspace.getLeaf(false).openFile(file);
    }
  }
}
