import assert from "node:assert/strict";
import { build } from "esbuild";

const serializerCalls = [];

const obsidianMockPlugin = {
  name: "obsidian-test",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^obsidian$/ }, () => ({
      path: "obsidian",
      namespace: "obsidian-test",
    }));

    buildApi.onLoad(
      { filter: /.*/, namespace: "obsidian-test" },
      () => ({
        contents: `
          export function stringifyYaml(value) {
            globalThis.__rendererSerializerCalls.push(value);

            const serialized =
              Object.entries(value)
                .map(([key, item]) => key + ": SERIALIZED(" + typeof item + ")")
                .join("\\n") + "\\n";

            return globalThis.__rendererExtraTrailingNewline
              ? serialized + "\\n"
              : serialized;
          }
        `,
        loader: "js",
      }),
    );
  },
};

globalThis.__rendererSerializerCalls = serializerCalls;

const result = await build({
  stdin: {
    contents: `
      export { renderMarkdownNote } from "./markdown-note-renderer";
    `,
    resolveDir: process.cwd(),
    loader: "js",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [obsidianMockPlugin],
});

const source = result.outputFiles[0].text;
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");

const { renderMarkdownNote } = await import(moduleUrl);

// These strings deliberately resemble YAML syntax. This Node test does NOT
// claim to test Obsidian's YAML implementation; the audit characterized the
// real stringifyYaml()/parseYaml() round trip inside Obsidian separately.
//
// Here we prove the Workbench boundary: every creator string reaches
// stringifyYaml() unchanged as a string instead of being interpolated into
// YAML source by our renderer.
const frontmatter = {
  colon: "river: flowing water",
  hash: "river # old name",
  booleanLooking: "true",
  nullLooking: "null",
  numberLooking: "123",
  listLooking: "[river, lake]",
  aliasLooking: "*river",
  quoted: '"river"',
  legacyMeanings: "river, stream; watercourse",
  ipa: "/sɪˈteɪ/",
  actualBoolean: true,
  actualNumber: 123,
  actualList: ["river", "lake"],
};

const rendered = renderMarkdownNote({
  frontmatter,
  blankFrontmatter: ["etymology", "notes"],
  body: "# Tora\\n\\nCreator Markdown remains body text.",
});

assert.equal(serializerCalls.length, 1);
assert.deepEqual(
  serializerCalls[0],
  frontmatter,
  "renderer must pass semantic values to Obsidian unchanged",
);

assert.match(rendered, /^---\n/);
assert.match(rendered, /colon: SERIALIZED\(string\)/);
assert.match(rendered, /actualBoolean: SERIALIZED\(boolean\)/);
assert.match(rendered, /actualNumber: SERIALIZED\(number\)/);
assert.match(rendered, /actualList: SERIALIZED\(object\)/);
assert.match(rendered, /\netymology:\nnotes:\n---\n/);
assert.ok(
  rendered.endsWith("# Tora\\n\\nCreator Markdown remains body text."),
  "Markdown body should remain outside YAML serialization",
);

// The renderer removes only the serializer's outer framing newline. If a
// serializer result contains another trailing newline, do not broadly trim it:
// future structured YAML representations may make such content significant.
globalThis.__rendererExtraTrailingNewline = true;

const trailingNewlineRendered = renderMarkdownNote({
  frontmatter: { definition: "river" },
});

assert.equal(
  trailingNewlineRendered,
  "---\ndefinition: SERIALIZED(string)\n\n---",
  "renderer must remove exactly one serializer framing newline",
);

globalThis.__rendererExtraTrailingNewline = false;

// A field must have one representation. Accidentally supplying it both as a
// semantic value and as an empty template placeholder is a programming error.
assert.throws(
  () =>
    renderMarkdownNote({
      frontmatter: { ipa: "/t/" },
      blankFrontmatter: ["ipa"],
    }),
  /cannot be both serialized and blank/,
);

// Blank placeholder names become YAML syntax, so reject names outside the
// deliberately narrow plain-key convention.
assert.throws(
  () =>
    renderMarkdownNote({
      frontmatter: {},
      blankFrontmatter: ["unsafe: key"],
    }),
  /unsafe blank frontmatter key/,
);

console.log("markdown note renderer regression tests passed");
