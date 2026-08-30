import { App, Modal } from "obsidian";

/**
 * Everything shown to the creator before a translation replacement is allowed.
 *
 * `replacement` is especially important: it is the exact string that the
 * caller intends to pass to editor.replaceRange() if the creator confirms.
 * The modal only displays these values; it never regenerates or transforms
 * them.
 */
export interface TranslationCommitPreview {
  original: string;
  translated: string;
  replacement: string;
}

/**
 * Ask the creator to approve one exact editor replacement.
 *
 * Returning Promise<boolean> keeps modal lifecycle details out of main.ts.
 * `true` means the user explicitly pressed Replace. Every other way of closing
 * the modal is cancellation.
 */
export function confirmTranslationCommit(
  app: App,
  preview: TranslationCommitPreview,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const modal = new TranslationCommitModal(app, preview, resolve);
    modal.open();
  });
}

/**
 * Preview one proposed translation mutation before creator-authored text is
 * changed.
 *
 * All creator/generated strings are rendered through Obsidian's text APIs.
 * Even when `replacement` contains HTML-like markup, it is displayed literally
 * rather than interpreted as DOM content.
 */
class TranslationCommitModal extends Modal {
  private readonly preview: TranslationCommitPreview;
  private readonly resolve: (confirmed: boolean) => void;

  /**
   * A modal can close in several ways: buttons, Escape, clicking outside, or
   * Obsidian closing it for another reason. This flag ensures the Promise is
   * resolved exactly once and that an undecided close always fails safely.
   */
  private decided = false;

  constructor(
    app: App,
    preview: TranslationCommitPreview,
    resolve: (confirmed: boolean) => void,
  ) {
    super(app);
    this.preview = preview;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", {
      text: "Replace text with translation?",
    });

    contentEl.createEl("p", {
      text:
        "Review the exact change below. Nothing will be replaced unless " +
        "you choose Replace.",
    });

    this.addPreviewSection("Original", this.preview.original);
    this.addPreviewSection("Translation", this.preview.translated);
    this.addPreviewSection("Will insert", this.preview.replacement);

    const buttonRow = contentEl.createDiv({
      cls: "conlang-modal-buttons",
    });

    const cancelButton = buttonRow.createEl("button", {
      text: "Cancel",
    });

    cancelButton.addEventListener("click", () => {
      this.finish(false);
    });

    const replaceButton = buttonRow.createEl("button", {
      text: "Replace",
    });

    replaceButton.addEventListener("click", () => {
      this.finish(true);
    });
  }

  /**
   * Use <pre> so whitespace and line breaks remain visible in the preview.
   * The `text` option creates text content rather than parsing the value as
   * HTML, which is the safe behavior for creator-authored/generated strings.
   */
  private addPreviewSection(label: string, value: string) {
    this.contentEl.createEl("h4", { text: label });
    this.contentEl.createEl("pre", { text: value });
  }

  /**
   * Resolve the decision once, then close the modal.
   *
   * `decided` is set before close() because close() leads to onClose().
   * Without this ordering, onClose() could interpret an explicit Replace as an
   * undecided cancellation and resolve the Promise a second time.
   */
  private finish(confirmed: boolean) {
    if (this.decided) return;

    this.decided = true;
    this.resolve(confirmed);
    this.close();
  }

  onClose() {
    // Escape, clicking outside, the X button, or any other undecided close is
    // cancellation. Mutation requires the explicit Replace button.
    if (!this.decided) {
      this.decided = true;
      this.resolve(false);
    }

    this.contentEl.empty();
  }
}
