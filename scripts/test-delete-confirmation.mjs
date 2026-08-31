import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

/**
 * Minimal DOM element used by the Obsidian Modal stub.
 *
 * The production modal only needs empty(), createEl(), createDiv(), and
 * addEventListener(). Recording the text passed to createEl() also lets this
 * regression test verify that creator-controlled strings stay literal text.
 */
class FakeElement {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.options = options;
    this.children = [];
    this.listeners = new Map();
  }

  empty() {
    this.children = [];
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag, options);
    this.children.push(child);
    return child;
  }

  createDiv(options = {}) {
    return this.createEl("div", options);
  }

  addEventListener(type, callback) {
    this.listeners.set(type, callback);
  }

  click() {
    const callback = this.listeners.get("click");
    if (callback) callback();
  }
}

/**
 * Keep track of the most recently opened modal so a test can simulate Cancel,
 * confirmation, or an implicit close exactly as Obsidian would.
 */
let lastOpenedModal = null;

class FakeModal {
  constructor(app) {
    this.app = app;
    this.contentEl = new FakeElement();
  }

  open() {
    lastOpenedModal = this;
    this.onOpen?.();
  }

  close() {
    this.onClose?.();
  }
}

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "conlang-delete-confirmation-"),
);

try {
  const obsidianStub = path.join(tempDir, "obsidian-stub.mjs");
  const output = path.join(tempDir, "delete-confirm-modal.mjs");

  await fs.writeFile(
    obsidianStub,
    `
export class App {}
export const Modal = globalThis.__ConlangFakeModal;
`,
  );

  /*
   * Bundle the real production module. The plugin below redirects its
   * "obsidian" import to our deliberately tiny test double.
   */
  globalThis.__ConlangFakeModal = FakeModal;

  await esbuild.build({
    entryPoints: ["delete-confirm-modal.ts"],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    plugins: [
      {
        name: "fake-obsidian",
        setup(build) {
          build.onResolve({ filter: /^obsidian$/ }, () => ({
            path: obsidianStub,
          }));
        },
      },
    ],
  });

  const { confirmDeletion } = await import(
    `${pathToFileURL(output).href}?test=${Date.now()}`
  );

  const options = {
    title: "<b>Delete?</b>",
    message: 'Delete "creator <script> text" literally?',
    confirmText: "Delete exact target",
  };

  // -----------------------------------------------------------------------
  // Cancel must fail closed.
  // -----------------------------------------------------------------------

  const cancelled = confirmDeletion({}, options);
  assert.ok(lastOpenedModal, "confirmation modal should open");

  const cancelButton = lastOpenedModal.contentEl.children
    .find((child) => child.tag === "div")
    ?.children.find((child) => child.options.text === "Cancel");

  assert.ok(cancelButton, "Cancel button should exist");
  cancelButton.click();

  assert.equal(await cancelled, false, "Cancel must resolve false");

  // -----------------------------------------------------------------------
  // Explicit destructive approval is the only path that returns true.
  // -----------------------------------------------------------------------

  const approved = confirmDeletion({}, options);
  const approvedModal = lastOpenedModal;

  const buttonRow = approvedModal.contentEl.children.find(
    (child) => child.tag === "div",
  );
  const confirmButton = buttonRow?.children.find(
    (child) => child.options.text === options.confirmText,
  );

  assert.ok(confirmButton, "destructive confirmation button should exist");
  confirmButton.click();

  assert.equal(
    await approved,
    true,
    "explicit destructive confirmation must resolve true",
  );

  // -----------------------------------------------------------------------
  // Escape/outside/other implicit closure reaches onClose() without a button
  // decision and therefore must fail closed.
  // -----------------------------------------------------------------------

  const implicitlyClosed = confirmDeletion({}, options);
  const implicitModal = lastOpenedModal;
  implicitModal.close();

  assert.equal(
    await implicitlyClosed,
    false,
    "implicit modal close must resolve false",
  );

  // -----------------------------------------------------------------------
  // The decision guard must prevent a second resolution when close() invokes
  // onClose() after an explicit button has already decided the operation.
  // -----------------------------------------------------------------------

  let resolutionCount = 0;
  const singleResolutionPromise = confirmDeletion({}, options).then((value) => {
    resolutionCount += 1;
    return value;
  });

  const singleResolutionModal = lastOpenedModal;
  const singleButtonRow = singleResolutionModal.contentEl.children.find(
    (child) => child.tag === "div",
  );
  const singleConfirmButton = singleButtonRow?.children.find(
    (child) => child.options.text === options.confirmText,
  );

  assert.ok(singleConfirmButton);
  singleConfirmButton.click();

  assert.equal(await singleResolutionPromise, true);

  // Give any accidentally queued second resolution a chance to occur.
  await Promise.resolve();
  assert.equal(resolutionCount, 1, "confirmation must resolve exactly once");

  // -----------------------------------------------------------------------
  // Creator-controlled strings must be passed through the text option rather
  // than interpreted as markup.
  // -----------------------------------------------------------------------

  const textCheck = confirmDeletion({}, options);
  const textModal = lastOpenedModal;

  const heading = textModal.contentEl.children.find(
    (child) => child.tag === "h2",
  );
  const paragraph = textModal.contentEl.children.find(
    (child) => child.tag === "p",
  );

  assert.equal(heading?.options.text, options.title);
  assert.equal(paragraph?.options.text, options.message);

  textModal.close();
  assert.equal(await textCheck, false);

  console.log("deletion confirmation regression tests passed");
} finally {
  delete globalThis.__ConlangFakeModal;
  await fs.rm(tempDir, { recursive: true, force: true });
}
