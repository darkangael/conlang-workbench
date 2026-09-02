import { App, Modal, Setting } from "obsidian";

/**
 * Ask whether a NEW language should automatically receive portable linguistic
 * IDs on future Workbench-generated notes.
 *
 * This modal deliberately owns presentation only. It does not inspect or
 * mutate plugin settings, choose a language name, create folders, or write
 * creator-authored Markdown.
 *
 * Result meanings are intentionally three-way:
 *
 * - true:  create the language with automatic portable-ID generation enabled;
 * - false: create the language without automatic portable-ID generation;
 * - null:  dismiss/cancel this Add Language attempt.
 *
 * `false` therefore must never be treated as cancellation. Portable IDs are
 * recommended infrastructure for portability, not a prerequisite for using
 * Workbench.
 */
class PortableIdChoiceModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly resolveChoice: (choice: boolean | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h2", {
      text: "Portable linguistic IDs",
    });

    contentEl.createEl("p", {
      text:
        "Portable linguistic IDs give this language and its linguistic " +
        "objects stable identifiers that can survive copying, sharing, and " +
        "movement between compatible systems.",
    });

    contentEl.createEl("p", {
      text:
        "They are recommended for portability, but they are optional. " +
        "You can change this preference later for future notes. Existing " +
        "notes are never changed automatically.",
    });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Use portable IDs (recommended)")
          .setCta()
          .onClick(() => this.finish(true)),
      )
      .addButton((button) =>
        button
          .setButtonText("Create without portable IDs")
          .onClick(() => this.finish(false)),
      );
  }

  onClose(): void {
    this.contentEl.empty();

    /*
     * Escape, the window close control, or any other dismissal that did not
     * select a button cancels this Add Language attempt. `finish()` marks a
     * button choice as settled before calling close(), so onClose cannot
     * accidentally replace an explicit false choice with null.
     */
    if (!this.settled) {
      this.settled = true;
      this.resolveChoice(null);
    }
  }

  private finish(choice: boolean): void {
    if (this.settled) {
      return;
    }

    /*
     * Resolve before close(). Obsidian invokes onClose as part of closing the
     * modal, and the settled flag ensures the promise is resolved exactly once.
     */
    this.settled = true;
    this.resolveChoice(choice);
    this.close();
  }
}

/**
 * Promise wrapper used by Settings so the onboarding flow can read naturally:
 *
 *   const choice = await choosePortableIdsForNewLanguage(app);
 *
 * Waiting happens before the settings-authority queue is entered. The returned
 * value is only a UI decision; later creation code still owns every mutation
 * and authority check.
 */
export function choosePortableIdsForNewLanguage(
  app: App,
): Promise<boolean | null> {
  return new Promise((resolve) => {
    new PortableIdChoiceModal(app, resolve).open();
  });
}
