import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-body-preview-"));
const bundlePath = join(tempDir, "body-preview.cjs");

try {
  // Bundle the real TypeScript module so this regression test exercises the
  // production implementation rather than copying its logic into the test.
  await build({
    entryPoints: ["body-preview.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundlePath,
    logLevel: "silent",
  });

  const require = createRequire(import.meta.url);
  const { extractBodyPreview } = require(bundlePath);

  assert.equal(
    extractBodyPreview(`---
title: Example
type: lexeme
---
# Example

This is the real body paragraph.`),
    "This is the real body paragraph.",
    "normal frontmatter should be stripped",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
----
This should not be treated as after a valid closing fence.`),
    "",
    "four hyphens must not count as an exact closing frontmatter fence",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
---not-a-fence
This should not be treated as after a valid closing fence.`),
    "",
    "a line beginning with three hyphens must not count as a closing fence",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
type: lexeme
This frontmatter never closes.

This looks like body text.`),
    "",
    "unclosed apparent frontmatter should not leak metadata-looking text into the preview",
  );

  assert.equal(
    extractBodyPreview(`----
This is ordinary Markdown body text.

---
Later thematic break.`),
    "This is ordinary Markdown body text.",
    "four leading hyphens must not be mistaken for a frontmatter opener",
  );

  // Preview extraction must preserve punctuation from creator-authored text.
  // These characters may resemble Markdown delimiters, but they can also be
  // meaningful linguistic notation or literal source content.
  assert.equal(
    extractBodyPreview(`---
title: Example
---
The form foo_bar is significant.`),
    "The form foo_bar is significant.",
    "underscores inside source text must be preserved",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
---
The form foo*bar is significant.`),
    "The form foo*bar is significant.",
    "asterisks inside source text must be preserved",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
---
The form foo\`bar is significant.`),
    "The form foo`bar is significant.",
    "literal backticks must be preserved",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
---
Use \`foo_bar\` as the identifier.`),
    "Use `foo_bar` as the identifier.",
    "inline-code punctuation must remain part of the extracted source text",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
---
Compare *foo_bar* with \`baz_qux\`.`),
    "Compare *foo_bar* with `baz_qux`.",
    "mixed Markdown-like punctuation must be preserved",
  );

  assert.equal(
    extractBodyPreview(`---
title: Example
---
Compare *wódr̥ with later forms.`),
    "Compare *wódr̥ with later forms.",
    "linguistic reconstruction markers must not be stripped",
  );

  console.log("body-preview regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
