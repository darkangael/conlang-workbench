import { Notice, TFile } from "obsidian";
import type ConlangPlugin from "./main";

/**
 * UI controller for creator-facing source diagnostics.
 *
 * Diagnostic data itself is derived from retained Workbench source records by
 * source-diagnostics.ts. This class owns only presentation and navigation:
 * it renders the current diagnostic groups and can open an existing creator
 * note so the creator can inspect or repair that source manually.
 *
 * Deliberately, this controller receives no generic frontmatter or file writer.
 * Displaying a diagnostic must never become authority to rewrite the source
 * that produced it.
 */
export class DiagnosticsTab {
  private rootEl: HTMLElement | null = null;

  constructor(private plugin: ConlangPlugin) {}

  /**
   * Attach Diagnostics to the container owned by TranslationPanelView.
   *
   * The panel remains responsible for deciding whether the ordinary language
   * workspace or Diagnostics workspace is visible. DiagnosticsTab owns only
   * what is rendered inside its assigned container.
   */
  mount(container: HTMLElement): void {
    this.rootEl = container;
    this.render();
  }

  /**
   * Rebuild Diagnostics from the current settled inventory source records.
   *
   * No second diagnostic cache is kept here. Each render asks the plugin for a
   * newly derived snapshot, so repaired/reparsed sources disappear naturally
   * after the underlying inventories have been reloaded.
   */
  render(): void {
    if (!this.rootEl) return;

    const root = this.rootEl;
    root.empty();

    const groups = this.plugin.getSourceDiagnostics();

    const heading = root.createDiv({
      cls: "conlang-diagnostics-heading",
    });
    heading.createDiv({
      cls: "conlang-diagnostics-title",
      text: "Diagnostics",
    });
    heading.createDiv({
      cls: "conlang-diagnostics-summary",
      text:
        groups.length === 0
          ? "No source notes currently have diagnostics."
          : `${groups.length} source ${
              groups.length === 1 ? "note has" : "notes have"
            } diagnostics.`,
    });

    if (groups.length === 0) {
      root.createDiv({
        cls: "conlang-panel-empty",
        text: "No current source diagnostics.",
      });
      return;
    }

    for (const group of groups) {
      const details = root.createEl("details", {
        cls: `conlang-diagnostic-card is-${group.severity}`,
      });

      const summary = details.createEl("summary", {
        cls: "conlang-diagnostic-card-summary",
      });

      const name = group.path.split("/").pop() || group.path;
      summary.createSpan({
        cls: "conlang-diagnostic-card-name",
        text: name,
      });
      summary.createSpan({
        cls: "conlang-diagnostic-card-count",
        text: `${group.diagnostics.length} ${
          group.diagnostics.length === 1 ? "issue" : "issues"
        }`,
      });

      const body = details.createDiv({
        cls: "conlang-diagnostic-card-body",
      });

      body.createDiv({
        cls: "conlang-diagnostic-path",
        text: group.path,
      });

      for (const diagnostic of group.diagnostics) {
        const issue = body.createDiv({
          cls: `conlang-diagnostic-issue is-${diagnostic.severity}`,
        });

        if (diagnostic.field) {
          issue.createDiv({
            cls: "conlang-diagnostic-field",
            text: diagnostic.field,
          });
        }

        issue.createDiv({
          cls: "conlang-diagnostic-message",
          text: diagnostic.message,
        });
      }

      const actions = body.createDiv({
        cls: "conlang-diagnostic-actions",
      });

      const openButton = actions.createEl("button", {
        cls: "conlang-panel-btn",
        text: "Open note",
      });

      openButton.addEventListener("click", async () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(group.path);
        if (!(file instanceof TFile)) {
          new Notice(
            `Conlang Workbench: source note no longer exists at ${group.path}`,
            6000,
          );
          return;
        }

        await this.plugin.app.workspace.getLeaf(false).openFile(file);
      });
    }
  }
}
