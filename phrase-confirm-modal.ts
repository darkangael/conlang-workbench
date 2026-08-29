import { App, Modal } from "obsidian";

/**
 * Ask whether an explicit multi-word selection should be translated together
 * as a phrase.
 *
 * Returning a Promise<boolean> keeps the modal mechanics out of main.ts.
 * Callers only need to await the user's decision.
 *
 * Closing the modal without choosing an action is treated as cancellation.
 */
export function confirmPhraseTranslation(
  app: App,
  selectedText: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const modal = new PhraseConfirmModal(app, selectedText, resolve);
    modal.open();
  });
}

/**
 * Small confirmation modal used before treating an explicit multi-word
 * selection as a phrase translation request.
 *
 * This modal does not translate, normalize, or modify the selected text. Its
 * only responsibility is obtaining explicit user approval for the phrase
 * operation.
 */
class PhraseConfirmModal extends Modal {
  private selectedText: string;
  private resolve: (confirmed: boolean) => void;
  private decided = false;

  constructor(
    app: App,
    selectedText: string,
    resolve: (confirmed: boolean) => void,
  ) {
    super(app);
    this.selectedText = selectedText;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", {
      text: "Translate selected phrase?",
    });

    contentEl.createEl("p", {
      text: `You selected multiple words: “${this.selectedText}”`,
    });

    contentEl.createEl("p", {
      text: "Translate them together as a phrase?",
    });

    const btnRow = contentEl.createDiv({
      cls: "conlang-modal-buttons",
    });

    const cancel = btnRow.createEl("button", {
      text: "Cancel",
    });

    cancel.addEventListener("click", () => {
      this.decided = true;
      this.resolve(false);
      this.close();
    });

    const translate = btnRow.createEl("button", {
      text: "Translate phrase",
    });

    translate.addEventListener("click", () => {
      this.decided = true;
      this.resolve(true);
      this.close();
    });
  }

  onClose() {
    // Escape, clicking outside the modal, or any other undecided close must
    // fail safely as a cancellation rather than implicitly authorizing work.
    if (!this.decided) this.resolve(false);

    this.contentEl.empty();
  }
}
