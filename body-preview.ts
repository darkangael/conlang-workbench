// Pure body-preview extraction. No Obsidian dependencies so it's easy
// to unit-test outside the plugin context.

/**
 * Extract the first meaningful paragraph from a markdown note's body.
 * Skips frontmatter, H1 headings, and blank lines. Returns at most ~200 chars.
 *
 * Used to build a body preview for proper-noun entries so their hover
 * tooltip can show the worldbuilding context, not just the bare definition.
 */
export function extractBodyPreview(content: string): string {
  let body = content;

  // Strip YAML frontmatter only when Markdown starts with an exact `---`
  // fence and later contains another exact `---` fence on its own line.
  //
  // Prefix matching is unsafe here: strings such as `----` or
  // `---not-a-fence` are ordinary Markdown content and must not be mistaken
  // for YAML boundaries.
  const sourceLines = body.split(/\r?\n/);
  if (sourceLines[0] === "---") {
    const closingFenceIndex = sourceLines.findIndex(
      (line, index) => index > 0 && line === "---",
    );

    // If a note begins an apparent frontmatter block but never closes it,
    // there is no reliable boundary between metadata-looking text and body
    // prose. Returning no preview is safer than inventing one from that
    // ambiguous content.
    if (closingFenceIndex === -1) {
      return "";
    }

    body = sourceLines.slice(closingFenceIndex + 1).join("\n");
  }

  // Walk lines, skipping headings, blanks, and the auto-generated
  // "Translates *foo*" line our entry template creates.
  const lines = body.split(/\r?\n/);
  const paragraph: string[] = [];
  let inParagraph = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inParagraph) break; // end of first paragraph
      continue;
    }
    // ATX heading (`# Foo`)
    if (line.startsWith("#")) continue;
    // Setext heading underline (`===` or `---` on its own line): the text
    // line we just collected was actually a heading, so drop it and keep
    // scanning for real body text. (Frontmatter is already stripped above, so
    // a `---` here is an underline or thematic break, not a YAML fence.)
    if (/^(=+|-+)$/.test(line)) {
      if (paragraph.length > 0) {
        paragraph.pop();
        if (paragraph.length === 0) inParagraph = false;
      }
      continue;
    }
    if (/^Translates \*[^*]+\*\.?$/.test(line)) continue;
    paragraph.push(line);
    inParagraph = true;
  }
  let text = paragraph.join(" ").trim();

  // Preserve punctuation from the creator's source text.
  //
  // Characters such as `*`, `_`, and backticks can be Markdown delimiters,
  // but they can also carry literal or linguistic meaning. Body-preview
  // extraction should normalize layout, not guess which punctuation was
  // intended only as presentation markup. If Workbench later wants rendered
  // Markdown in previews, that belongs in the presentation layer rather than
  // destructive source-text cleanup here.
  const MAX = 200;
  if (text.length > MAX) {
    text = text.slice(0, MAX).replace(/\s+\S*$/, "") + "…";
  }
  return text;
}
