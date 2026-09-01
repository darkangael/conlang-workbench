import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-settings-authority-queue-"));

try {
  await build({
    entryPoints: ["settings-authority-queue.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "settings-authority-queue.mjs");
  await readFile(modulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(modulePath).href}?v=${Date.now()}`
  );

  {
    /*
     * The second transaction must not begin while the first transaction still
     * owns the settings-authority boundary.
     */
    const queue = new SettingsAuthorityQueue();
    const events = [];

    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
      return "first-result";
    });

    const second = queue.run(async () => {
      events.push("second:start");
      events.push("second:end");
      return "second-result";
    });

    /*
     * Promise callbacks run on the microtask queue. Yield once so the first
     * queued transaction can begin while verifying the second remains blocked.
     */
    await Promise.resolve();

    assert.deepEqual(
      events,
      ["first:start"],
      "the second authority transaction must not begin before the first settles",
    );

    releaseFirst();

    assert.equal(await first, "first-result");
    assert.equal(await second, "second-result");

    assert.deepEqual(
      events,
      ["first:start", "first:end", "second:start", "second:end"],
      "authority transactions must execute completely in submission order",
    );
  }

  {
    /*
     * An unexpected rejection is returned to that caller, but must not poison
     * the internal queue tail or prevent later authority transactions.
     */
    const queue = new SettingsAuthorityQueue();
    const events = [];

    const failed = queue.run(async () => {
      events.push("failed:start");
      throw new Error("unexpected transaction failure");
    });

    const later = queue.run(async () => {
      events.push("later:start");
      return "later-result";
    });

    await assert.rejects(
      failed,
      /unexpected transaction failure/,
      "the original transaction rejection must remain visible to its caller",
    );

    assert.equal(
      await later,
      "later-result",
      "a rejected transaction must not permanently block the queue",
    );

    assert.deepEqual(events, ["failed:start", "later:start"]);
  }

  console.log("settings authority queue regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
