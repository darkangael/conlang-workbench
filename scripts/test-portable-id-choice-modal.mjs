import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

/**
 * Minimal DOM element used by the fake Obsidian Modal.
 *
 * The production portable-ID modal creates headings and paragraphs through
 * createEl(). Recording those calls lets this regression find the modal text
 * without requiring a browser DOM.
 */
class FakeElement {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.options = options;
    this.children = [];
  }

  empty() {
    this.children = [];
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag, options);
    this.children.push(child);
    return child;
  }
}

/**
 * Minimal button component implementing only the fluent methods used by the
 * production modal.
 */
class FakeButton {
  constructor() {
    this.text = "";
    this.cta = false;
    this.callback = null;
  }

  setButtonText(text) {
    this.text = text;
    return this;
  }

  setCta() {
    this.cta = true;
    return this;
  }

  onClick(callback) {
    this.callback = callback;
    return this;
  }

  click() {
    this.callback?.();
  }
}

/**
 * Minimal Setting implementation. Each production addButton() call receives a
 * fresh fake button, and the test can later inspect/click those exact controls.
 */
class FakeSetting {
  static instances = [];

  constructor(containerEl) {
    this.containerEl = containerEl;
    this.buttons = [];
    FakeSetting.instances.push(this);
  }

  addButton(configure) {
    const button = new FakeButton();
    this.buttons.push(button);
    configure(button);
    return this;
  }
}

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
  path.join(os.tmpdir(), "conlang-portable-id-choice-"),
);

try {
  const obsidianStub = path.join(tempDir, "obsidian-stub.mjs");
  const output = path.join(tempDir, "portable-id-choice-modal.mjs");

  globalThis.__ConlangFakeModal = FakeModal;
  globalThis.__ConlangFakeSetting = FakeSetting;

  await fs.writeFile(
    obsidianStub,
    `
export class App {}
export const Modal = globalThis.__ConlangFakeModal;
export const Setting = globalThis.__ConlangFakeSetting;
`,
  );

  await esbuild.build({
    entryPoints: ["portable-id-choice-modal.ts"],
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

  const { choosePortableIdsForNewLanguage } = await import(
    `${pathToFileURL(output).href}?test=${Date.now()}`
  );

  function currentButtons() {
    const setting = FakeSetting.instances.at(-1);
    assert.ok(setting, "portable-ID choice Setting should exist");
    return setting.buttons;
  }

  // -----------------------------------------------------------------------
  // Recommended choice explicitly enables portable IDs.
  // -----------------------------------------------------------------------

  const enabled = choosePortableIdsForNewLanguage({});
  assert.ok(lastOpenedModal, "portable-ID choice modal should open");

  const enabledButton = currentButtons().find(
    (button) => button.text === "Use portable IDs (recommended)",
  );

  assert.ok(enabledButton, "recommended portable-ID button should exist");
  assert.equal(enabledButton.cta, true, "recommended choice should be the CTA");

  enabledButton.click();

  assert.equal(
    await enabled,
    true,
    "recommended choice must explicitly resolve true",
  );

  // -----------------------------------------------------------------------
  // Creating without portable IDs is a real affirmative choice, not cancel.
  // -----------------------------------------------------------------------

  const disabled = choosePortableIdsForNewLanguage({});

  const disabledButton = currentButtons().find(
    (button) => button.text === "Create without portable IDs",
  );

  assert.ok(disabledButton, "without-portable-IDs button should exist");
  disabledButton.click();

  assert.equal(
    await disabled,
    false,
    "explicit creation without portable IDs must resolve false",
  );

  // -----------------------------------------------------------------------
  // Escape/outside/other implicit dismissal cancels Add Language.
  // -----------------------------------------------------------------------

  const cancelled = choosePortableIdsForNewLanguage({});
  const cancelledModal = lastOpenedModal;
  cancelledModal.close();

  assert.equal(
    await cancelled,
    null,
    "implicit modal close must cancel with null",
  );

  // -----------------------------------------------------------------------
  // Explicit false must remain false even though finish(false) closes the
  // modal and therefore immediately invokes onClose().
  // -----------------------------------------------------------------------

  let resolutionCount = 0;
  const explicitFalse = choosePortableIdsForNewLanguage({}).then((value) => {
    resolutionCount += 1;
    return value;
  });

  const explicitFalseButton = currentButtons().find(
    (button) => button.text === "Create without portable IDs",
  );

  assert.ok(explicitFalseButton);
  explicitFalseButton.click();

  assert.equal(await explicitFalse, false);

  // Give any accidental second resolution from onClose() a chance to run.
  await Promise.resolve();
  assert.equal(
    resolutionCount,
    1,
    "portable-ID choice promise must resolve exactly once",
  );

  // -----------------------------------------------------------------------
  // The explanatory copy must preserve the intended policy distinction:
  // recommended and portable, but optional and never automatic backfill.
  // -----------------------------------------------------------------------

  const textCheck = choosePortableIdsForNewLanguage({});
  const textModal = lastOpenedModal;

  const paragraphs = textModal.contentEl.children.filter(
    (child) => child.tag === "p",
  );
  const text = paragraphs.map((paragraph) => paragraph.options.text).join(" ");

  assert.match(text, /recommended/i);
  assert.match(text, /optional/i);
  assert.match(text, /Existing notes are never changed automatically/i);

  textModal.close();
  assert.equal(await textCheck, null);

  console.log("portable-ID choice modal regression tests passed");
} finally {
  delete globalThis.__ConlangFakeModal;
  delete globalThis.__ConlangFakeSetting;
  await fs.rm(tempDir, { recursive: true, force: true });
}
