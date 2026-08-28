import { App, TFile } from "obsidian";
import {
  LinguisticExample,
  LinguisticExampleInventory,
} from "./linguistic-examples";

/**
 * Owns the user interface for browsing standalone linguistic examples.
 *
 * The inventory remains responsible for finding and parsing example notes.
 * This class is concerned only with presenting those examples and responding
 * to user interaction such as searching and opening the source note.
 */
export class LinguisticExampleTab {
  private searchQuery = "";

  constructor(
    private app: App,
    private inventory: LinguisticExampleInventory,
  ) {}

  /**
   * Render the complete Examples tab into the supplied container.
   *
   * We build the controls once and give the results their own container.
   * Later, search and other controls can refresh only the results instead of
   * rebuilding the entire tab and disrupting keyboard focus.
   */
  render(container: HTMLElement): void {
    container.empty();

    container.createEl("h3", { text: "Examples" });

    const controls = container.createDiv({
      cls: "conlang-example-controls",
    });

    const search = controls.createEl("input", {
      type: "search",
      placeholder: "Search examples...",
      cls: "conlang-example-search",
    });

    search.value = this.searchQuery;

    const results = container.createDiv({
      cls: "conlang-example-results",
    });

    search.addEventListener("input", () => {
      this.searchQuery = search.value;
      this.renderResults(results);
    });

    this.renderResults(results);
  }

  /**
   * Refresh only the result area.
   *
   * Keeping this separate from render() is important: typing in the search
   * box should not recreate the search box itself and steal keyboard focus.
   */
  private renderResults(container: HTMLElement): void {
    container.empty();

    const examples = this.filteredExamples();

    const summary = container.createDiv({
      cls: "conlang-example-summary",
    });

    summary.setText(
      `${examples.length} ${examples.length === 1 ? "example" : "examples"}`,
    );

    if (examples.length === 0) {
      container.createDiv({
        cls: "conlang-example-empty",
        text: this.searchQuery.trim()
          ? "No examples match this search."
          : "No standalone linguistic examples are loaded.",
      });
      return;
    }

    for (const example of examples) {
      this.renderExampleCard(container, example);
    }
  }

  /**
   * Search across the fields a user is most likely to remember.
   *
   * This deliberately includes the linguistic tiers separately rather than
   * flattening an example into a single meaning. A creator may remember the
   * original wording, a gloss, the natural translation, or contextual notes.
   */
  private filteredExamples(): LinguisticExample[] {
    const examples = this.inventory.allExamples();
    const query = this.searchQuery.trim().toLocaleLowerCase();

    if (!query) return examples;

    return examples.filter((example) => {
      const searchable = [
        example.text,
        example.realization,
        example.segmentation,
        example.gloss,
        example.translation,
        example.language,
        example.source,
        example.context,
        example.notes,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n")
        .toLocaleLowerCase();

      return searchable.includes(query);
    });
  }

/**
 * Render one example as a compact browsing card.
 *
 * Only tiers actually documented by the author are displayed. Workbench
 * must not manufacture a pronunciation, segmentation, gloss, or translation
 * merely to make every card have the same shape.
 */
private renderExampleCard(
  container: HTMLElement,
  example: LinguisticExample,
): void {
  const card = container.createDiv({
    cls: "conlang-example-card",
  });

  const header = card.createDiv({
    cls: "conlang-example-card-header",
  });

  header.createDiv({
    cls: "conlang-example-text",
    text: example.text,
  });

  if (example.language) {
    header.createDiv({
      cls: "conlang-example-language",
      text: example.language,
    });
  }

  if (example.translation) {
    card.createDiv({
      cls: "conlang-example-translation",
      text: `“${example.translation}”`,
    });
  }

  /*
   * Analysis is optional. A simple example containing only original text and
   * a natural translation should not look incomplete or offer an empty
   * Show analysis control.
   */
  const hasAnalysis = Boolean(
    example.realization ||
      example.segmentation ||
      example.gloss ||
      example.context ||
      example.source ||
      example.notes
  );

  /*
   * Keep analytical tiers in their own container. This lets us reveal and
   * hide the analysis without rebuilding the whole example card.
   */
  let analysis: HTMLElement | null = null;

  if (hasAnalysis) {
    analysis = card.createDiv({
      cls: "conlang-example-analysis conlang-hidden",
    });

    if (example.realization) {
      this.renderTier(analysis, "Realization", example.realization);
    }

    if (example.segmentation) {
      this.renderTier(analysis, "Segmentation", example.segmentation);
    }

    if (example.gloss) {
      this.renderTier(analysis, "Gloss", example.gloss);
    }

    if (example.context) {
      this.renderTier(analysis, "Context", example.context);
    }

    if (example.source) {
      this.renderTier(analysis, "Source", example.source);
    }

    if (example.notes) {
      this.renderTier(analysis, "Notes", example.notes);
    }
  }

  /*
   * Analysis and source navigation share the same action row.
   *
   * CSS places Show analysis on the left and Open note on the right. If the
   * example has no analysis, Open note remains right-aligned by itself.
   */
  if (hasAnalysis || example.path) {
    const actions = card.createDiv({
      cls: "conlang-example-actions",
    });

    if (hasAnalysis && analysis) {
      const analysisButton = actions.createEl("button", {
        text: "Show analysis ▾",
      });

      /*
       * This state belongs to this individual card.
       *
       * false = analysis is hidden
       * true  = analysis is visible
       */
      let expanded = false;

      analysisButton.addEventListener("click", () => {
        // `!` means "not", so each click reverses the current state.
        expanded = !expanded;

        if (expanded) {
          analysis.removeClass("conlang-hidden");
          analysisButton.setText("Hide analysis ▴");
        } else {
          analysis.addClass("conlang-hidden");
          analysisButton.setText("Show analysis ▾");
        }
      });
    }

    if (example.path) {
      const openButton = actions.createEl("button", {
        text: "Open note",
      });

      openButton.addEventListener("click", () => {
        void this.openSourceNote(example.path!);
      });
    }
  }
}

  /**
   * Give optional analytical tiers a consistent presentation without making
   * the card renderer repeat the same label/value markup for every field.
   */
  private renderTier(
    container: HTMLElement,
    label: string,
    value: string,
  ): void {
    const tier = container.createDiv({
      cls: "conlang-example-tier",
    });

    tier.createDiv({
      cls: "conlang-example-tier-label",
      text: label,
    });

    tier.createDiv({
      cls: "conlang-example-tier-value",
      text: value,
    });
  }

  /**
   * Open the Markdown note from which an example was loaded.
   *
   * The stored path comes from the inventory rather than being reconstructed
   * here, so the UI does not need to know anything about vault organization.
   */
  private async openSourceNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);

    if (!(file instanceof TFile)) return;

    await this.app.workspace.getLeaf(false).openFile(file);
  }
}