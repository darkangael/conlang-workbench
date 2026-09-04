import { App, Modal, Setting } from "obsidian";

/**
 * Require explicit creator authorization before recreating a missing configured
 * language root.
 *
 * Recreate is not destructive and must not be presented as deletion. It creates
 * new standard structure only at the root Workbench already has configured; it
 * does not search for, move, replace, or adopt an existing creator-owned folder.
 */
class LanguageRootRecreationConfirmModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly languageName: string,
    private readonly root: string,
    private readonly resolveResult: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Recreate language root?");

    this.contentEl.createEl("p", {
      text:
        `Recreate the missing configured root "${this.root}" for ` +
        `"${this.languageName}"?`,
    });

    this.contentEl.createEl("p", {
      text:
        "Workbench will create a new language root at this configured location " +
        "and establish its standard child folders. It will not search for, " +
        "move, or adopt a root that may have been renamed or moved elsewhere, " +
        "and it will not delete creator-authored files.",
    });

    this.contentEl.createEl("p", {
      text:
        'The shared "Languages" folder must already exist. If the original ' +
        "language root was moved or renamed, cancel and reconcile that location " +
        "instead of recreating a second root.",
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => {
          this.finish(false);
          this.close();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText("Recreate root")
          .setCta()
          .onClick(() => {
            this.finish(true);
            this.close();
          }),
      );
  }

  onClose(): void {
    // Escape, outside-click, and every other implicit close path fail closed.
    this.finish(false);
    this.contentEl.empty();
  }

  private finish(confirmed: boolean): void {
    if (this.resolved) return;

    this.resolved = true;
    this.resolveResult(confirmed);
  }
}

/**
 * Ask the creator to approve recreation of one exact language/root pair.
 *
 * The caller must still revalidate current settings and vault authority after
 * this Promise resolves. Confirmation alone never authorizes a stale target.
 */
export function confirmLanguageRootRecreation(
  app: App,
  languageName: string,
  root: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    new LanguageRootRecreationConfirmModal(
      app,
      languageName,
      root,
      resolve,
    ).open();
  });
}
