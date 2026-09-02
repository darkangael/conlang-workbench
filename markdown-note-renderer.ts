import { stringifyYaml } from "obsidian";

/**
 * Values that Workbench has deliberately modeled as frontmatter data.
 *
 * `unknown` is intentional here. YAML supports more than strings, and future
 * note templates may legitimately contain arrays, booleans, numbers, or
 * structured values. The renderer's responsibility is to preserve the type
 * supplied by the feature layer rather than silently converting everything
 * into text.
 */
export type MarkdownFrontmatter = Record<string, unknown>;

export interface MarkdownNoteRenderRequest {
  /**
   * Semantic frontmatter values to serialize through Obsidian's YAML writer.
   *
   * Creator-supplied strings must enter through this object rather than being
   * interpolated into YAML source. Obsidian's serializer can then distinguish
   * the string "true" from the boolean true, for example.
   */
  frontmatter: MarkdownFrontmatter;

  /**
   * Optional properties that should exist as intentionally unfilled `key:`
   * placeholders.
   *
   * Existing Workbench entry templates use blank properties such as `ipa:` and
   * `etymology:` as visible prompts for later creator editing. They are kept
   * separate from semantic values so safe serialization does not accidentally
   * change those placeholders into explicit empty-string values.
   */
  blankFrontmatter?: string[];

  /**
   * Markdown following the closing frontmatter fence.
   *
   * This is document content, not YAML, so it must not be passed through the
   * frontmatter serializer.
   */
  body?: string;
}

/**
 * YAML plain keys are intentionally restricted for blank placeholders.
 *
 * Current callers use fixed Workbench field names. Validating them here keeps
 * this generic helper safe if a future template layer supplies placeholder
 * names dynamically instead of allowing arbitrary text to become YAML syntax.
 */
const SAFE_BLANK_FRONTMATTER_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Render a complete Markdown note with safely serialized YAML frontmatter.
 *
 * This helper has REPRESENTATION authority only. It must not decide which
 * linguistic fields belong in a note, infer values, select a source type, or
 * combine the separate creation policies of callers such as ordinary-word,
 * name, translation-repair, or multi-language entry creation. Those feature
 * flows deliberately retain authority over their own metadata and body layout.
 *
 * Keeping that boundary here prevents a future "deduplication" refactor from
 * accidentally turning this low-level serializer into a shared semantic entry
 * builder and broadening one creation flow's authority into another.
 *
 * Obsidian's public stringifyYaml() API is used for semantic values rather than
 * hand-building `key: ${value}` lines. This is important for linguistic text:
 * ordinary creator strings may contain colons, hashes, brackets, asterisks,
 * quotes, or text such as "true" and "null" that has special meaning in YAML.
 *
 * The persistence writer remains responsible for *where* and *whether* a file
 * may be created. This helper owns only the representation of a note after the
 * caller has decided what its frontmatter and Markdown body should mean.
 */
export function renderMarkdownNote(
  request: MarkdownNoteRenderRequest,
): string {
  const yaml = stringifyYaml(request.frontmatter);

  // Obsidian normally terminates serialized YAML with one newline. Remove only
  // that framing newline before composing the surrounding Markdown document.
  // Do not trim more broadly: future structured YAML values may legitimately
  // contain representation-significant trailing content.
  const serialized = yaml.endsWith("\n") ? yaml.slice(0, -1) : yaml;
  const lines = ["---"];

  if (serialized) {
    lines.push(serialized);
  }

  for (const key of request.blankFrontmatter ?? []) {
    if (!SAFE_BLANK_FRONTMATTER_KEY.test(key)) {
      throw new Error(`unsafe blank frontmatter key "${key}"`);
    }

    if (Object.prototype.hasOwnProperty.call(request.frontmatter, key)) {
      throw new Error(
        `frontmatter key "${key}" cannot be both serialized and blank`,
      );
    }

    lines.push(`${key}:`);
  }

  lines.push("---");

  if (request.body !== undefined) {
    lines.push(request.body);
  }

  return lines.join("\n");
}
