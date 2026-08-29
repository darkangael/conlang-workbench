import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-lexical-senses-"));
const bundlePath = join(tempDir, "lexical-senses.cjs");

try {
  // Bundle the real TypeScript parser so these tests exercise production code
  // rather than duplicating the parsing implementation in the test itself.
  await build({
    entryPoints: ["lexical-senses.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundlePath,
    logLevel: "silent",
  });

  const require = createRequire(import.meta.url);
  const { parseLexicalSenses } = require(bundlePath);

  assert.deepEqual(
    parseLexicalSenses(`# varu

## Senses

### Sense 1

**ID:** current
**Gloss:** current
**Definition:** movement in a continuing direction
**Lookup:** current, flow, course
`),
    [
      {
        id: "current",
        gloss: "current",
        definition: "movement in a continuing direction",
        lookupTerms: ["current", "flow", "course"],
      },
    ],
    "ordinary structured lexical senses must continue to parse",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

Here is documentation:

\`\`\`markdown
## Senses

### Sense 1

**Gloss:** should-not-be-semantic
**Lookup:** accidental
\`\`\`
`),
    [],
    "a complete Senses example inside a backtick fence must remain inert",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

## Senses

Documentation follows:

\`\`\`markdown
### Sense 1

**Gloss:** should-not-be-semantic
\`\`\`
`),
    [],
    "a Sense heading inside fenced code must not create a lexical sense",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

## Senses

### Sense 1

Here is syntax documentation:

\`\`\`markdown
**Gloss:** should-not-be-semantic
**Lookup:** accidental, example
\`\`\`
`),
    [],
    "semantic-looking fields inside fenced code must remain inert",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

~~~markdown
## Senses

### Sense 1

**Gloss:** tilde-example
**Lookup:** accidental
~~~
`),
    [],
    "tilde-fenced Markdown examples must remain inert too",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

## Senses

### Sense 1

~~~~markdown
**Gloss:** should-not-be-semantic
~~~
**Lookup:** still-inside-the-four-tilde-fence
~~~~
`),
    [],
    "a shorter matching delimiter must not close a longer code fence",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

## Senses

### Sense 1

\`\`\`\`markdown
**Gloss:** should-not-be-semantic
\`\`\`
**Lookup:** also-still-inside
\`\`\`\`

### Sense 2

**Gloss:** real-after-fence
**Lookup:** active
`),
    [
      {
        id: undefined,
        gloss: "real-after-fence",
        definition: undefined,
        lookupTerms: ["active"],
      },
    ],
    "content after the actual closing code fence must become active again",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

## Senses

### Sense 1

\`\`\`
**Gloss:** should-not-be-semantic
~~~
**Lookup:** still-in-backtick-fence
\`\`\`
`),
    [],
    "a tilde delimiter must not close a backtick code fence",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

\`\`\`invalid\`info

## Senses

### Sense 1

**Gloss:** remains-active
`),
    [
      {
        id: undefined,
        gloss: "remains-active",
        definition: undefined,
        lookupTerms: undefined,
      },
    ],
    "a backtick in a backtick-fence info string must not create a code fence",
  );

  assert.deepEqual(
    parseLexicalSenses(`# Example

\`\`\`markdown
## Senses

### Sense 1

**Gloss:** should-not-be-semantic
\`\`\`	
## Senses

### Sense 2

**Gloss:** active-after-tabbed-close
`),
    [
      {
        id: undefined,
        gloss: "active-after-tabbed-close",
        definition: undefined,
        lookupTerms: undefined,
      },
    ],
    "a valid closing code fence may have trailing tab whitespace",
  );

  // `---` is deliberately NOT a code-fence delimiter. In an ordinary body it
  // may be a Markdown thematic break and must not disable structured senses.
  assert.deepEqual(
    parseLexicalSenses(`# Example

## Senses

### Sense 1

**Gloss:** first

---

### Sense 2

**Gloss:** second
`),
    [
      {
        id: undefined,
        gloss: "first",
        definition: undefined,
        lookupTerms: undefined,
      },
      {
        id: undefined,
        gloss: "second",
        definition: undefined,
        lookupTerms: undefined,
      },
    ],
    "a Markdown thematic break must not behave like a fenced-code boundary",
  );

  console.log("lexical-senses regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
