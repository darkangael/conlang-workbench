/**
 * Return a parsing view of Markdown with fenced code blocks masked out.
 *
 * Fenced code is literal/example content. Parsers that search raw Markdown for
 * structured headings or fields should not allow text inside those examples to
 * acquire semantic authority.
 *
 * This helper recognizes only fenced code blocks opened with backticks or
 * tildes. It deliberately does not interpret `---`: at the beginning of a
 * document that may delimit YAML frontmatter, while elsewhere it may be an
 * ordinary Markdown thematic break. Those are separate parsing concerns.
 *
 * The creator's source text is never modified. This function returns a new
 * in-memory string in which fence lines and fenced contents are replaced with
 * blank lines while ordinary Markdown remains unchanged.
 */
export function maskMarkdownFencedCodeBlocks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);

  // `null` means we are currently in ordinary Markdown. Otherwise these two
  // variables remember which kind of code fence opened the block and how long
  // that opening delimiter was.
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;

  const maskedLines = lines.map((line) => {
    if (fenceCharacter === null) {
      // Markdown fenced code may begin with up to three spaces followed by at
      // least three backticks or at least three tildes. Everything after the
      // opening delimiter is an optional info string and remains inert.
      //
      // Hyphens are intentionally absent from this expression. A `---` line
      // is not a fenced-code delimiter.
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);

      if (!opening) {
        return line;
      }

      const marker = opening[1];
      const infoString = opening[2];

      // CommonMark does not allow a backtick inside the info string of a
      // backtick-fenced code block. Treat such a line as ordinary Markdown
      // rather than letting an invalid-looking opener hide later semantic data.
      if (marker[0] === "`" && infoString.includes("`")) {
        return line;
      }

      fenceCharacter = marker[0] as "`" | "~";
      fenceLength = marker.length;

      return "";
    }

    // A closing code fence must use the same delimiter character as the
    // opener, contain at least as many delimiter characters, and otherwise
    // contain only optional indentation/trailing whitespace.
    const escapedCharacter = fenceCharacter === "`" ? "`" : "~";
    const closing = new RegExp(
      `^ {0,3}${escapedCharacter}{${fenceLength},}[\\t ]*$`,
    );

    if (closing.test(line)) {
      fenceCharacter = null;
      fenceLength = 0;
    }

    // Both code content and the closing fence are inert to downstream parsers.
    return "";
  });

  return maskedLines.join("\n");
}
