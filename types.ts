// Shared types for the Conlang plugin

export type HashType = "word" | "prefix" | "suffix" | "default";

export interface CypherRule {
  input: string;
  output: string;
  type: HashType;
  enabled: boolean;
}

export interface CypherSheet {
  name: string;
  enabled: boolean;
  rules: CypherRule[];
}

/**
 * A hardcoded inflected form declared on an entry via the `forms:` frontmatter
 * property, e.g. `plural: kalath`. Declared forms take priority over anything
 * the inflection rules would derive, which is the point — they exist for
 * irregulars the rules get wrong.
 */
export interface InflectedForm {
  // The grammatical category, e.g. "plural", "genitive", "past". Free-form;
  // reused as the tooltip label and as the key that suppresses a same-named
  // rule in forward generation.
  label: string;
  // The surface form itself. May contain spaces (it's then also registered
  // with the phrase matcher).
  form: string;
}

/**
 * A richer semantic sense attached to a lexical entry.
 *
 * Structured senses are optional enrichment. They do not replace the simple
 * `definition` field, and an entry does not need senses in order to be valid
 * or complete.
 *
 * A sense may begin life with only a fuller definition and gain a concise
 * gloss or extra lookup terms later as the language is developed.
 */
export interface LexicalSense {
  // Optional stable identifier for this sense. Not required for simple use,
  // but available when later features need to reference one specific sense.
  id?: string;

  // Short documentation-language label used for compact display and lookup.
  // Optional because a creator may know the concept before choosing a concise
  // gloss for it.
  gloss?: string;

  // Fuller semantic explanation of what this sense actually means.
  definition?: string;

  // Additional documentation-language search terms that should find this
  // sense without being treated as the definition itself.
  lookupTerms?: string[];
}

/**
 * A documented morpheme belonging to a language.
 *
 * Morphemes are deliberately distinct from DictionaryEntry. Some morphemes
 * may also occur as independent lexemes, but bound roots, affixes, clitics,
 * grammatical markers, and similar material must not automatically become
 * dictionary words or English-to-conlang lookup candidates.
 *
 * This is intentionally a small first model. Later morphology work can enrich
 * it with relationships, evidence, processes, examples, and more elaborate
 * realization models without requiring simple morphemes to use those features.
 */
export interface Morpheme {
  // Stable identity for references to this morpheme. Unlike the visible form,
  // this should not need to change merely because spelling or analysis changes.
  id: string;

  // Convenient citation/display form for the morpheme. This is not necessarily
  // its only possible surface realization.
  form: string;

  // Short documentation-language meaning or grammatical function.
  // This is descriptive metadata, NOT an automatic dictionary lookup key.
  gloss: string;

  // Creator-defined morpheme category such as root, prefix, suffix, clitic,
  // stem, etc. Free-form deliberately: these examples are not a closed
  // universal taxonomy.
  type?: string;

  // Whether this morpheme can occur independently as a word, must occur bound,
  // can do either, or has not yet been analyzed in those terms.
  distribution?: "free" | "bound" | "both" | "unknown";

  // Optional alternate or context-specific surface realizations. These are
  // documented forms of the same morpheme, not separate lexical entries.
  realizations?: string[];

  // Human-readable language name retained for compatibility with the current
  // dictionary/configuration architecture.
  language?: string;

  // Stable canonical Language Profile identity when one is available.
  // Keeping this separate from `language` lets us migrate toward stable IDs
  // without forcing that migration across the whole plugin at once.
  languageId?: string;

  // Canonical source Markdown file inside the vault.
  path: string;

  // Optional prose documentation and modification time for later browsing/UI.
  notes?: string;
  mtime?: number;
}

export interface DictionaryEntry {
  // The conlang form (the key in the dictionary). For phrase entries this
  // can contain spaces — set via frontmatter `word:` to override the filename.
  word: string;
  // The simple documentation-language meaning for this entry. This remains a
  // first-class entry format: an entry does not need structured senses to be
  // complete. When `senses` are present, they enrich this basic meaning with
  // more detailed semantic information rather than replacing it.
  definition: string;

  // Optional structured senses for entries that need richer semantic detail.
  // Senses progressively enrich a simple entry rather than replacing its
  // `definition`. A word may remain a simple entry permanently.
  senses?: LexicalSense[];

  // Source file path inside the vault
  path: string;
  // Optional metadata read from frontmatter
  partOfSpeech?: string;
  ipa?: string;
  etymology?: string;
  notes?: string;
  language?: string;
  // File modification time, used for "recently added" sorting in the browser
  mtime?: number;
  // For proper-noun entries: what category of named thing (character, place,
  // faction, etc.). Free-form string; we suggest common values in the UI.
  nameCategory?: string;
  // The first paragraph of the note body, used for richer hover tooltips on
  // proper nouns. Captured at dictionary-load time from the markdown body
  // (skipping frontmatter and the H1 heading).
  bodyPreview?: string;
  // True if this entry's word contains a space (i.e. it's a multi-word
  // phrase). Computed at load time, not stored separately in frontmatter.
  isPhrase?: boolean;
  // The number of words in this entry's surface form (1 for single words,
  // 2+ for phrases). Used by the phrase matcher to scan longest-first.
  wordCount?: number;
  // Optional: conlang words this entry decomposes into. For transparent
  // compounds like "kala-vren" (eye-water = tear), `parts: ["kala", "vren"]`
  // lets the plugin show what each piece means on hover. Free-form list.
  parts?: string[];
  // Optional: alternate surface forms that resolve to this same entry. Setting
  // `aliases: ["Feb"]` on a "February" entry makes hover tooltips and
  // highlighting treat "Feb" exactly like "February". Multi-word aliases are
  // supported too (they're matched like phrases).
  aliases?: string[];
  // Optional: hardcoded inflected forms declared on the entry itself, for
  // irregulars the rules can't derive. Recognised in preference to
  // rule-derived forms, and a declared label suppresses same-labelled rules
  // when predicting forms for this entry.
  forms?: InflectedForm[];
  // Optional: additional part(s) of speech to use when matching POS-filtered
  // inflection rules. Additive — the entry's real partOfSpeech still matches.
  // Lets a `pronoun` inflect by the `noun` rules without duplicating them.
  inflectAs?: string;
  // Set on the synthetic entries pushed into the phrase index for a multi-word
  // declared form: the label of the form ("plural") and the lemma's headword.
  // Absent on real entries.
  viaFormLabel?: string;
  viaFormLemma?: string;
}

export interface InflectionRule {
  // A descriptive label shown on hover, e.g. "plural", "past tense", "genitive"
  label: string;
  // The suffix or prefix pattern this rule matches (just letters, no slashes)
  pattern: string;
  // Where the pattern is found
  position: "suffix" | "prefix";
  // What to strip from the word to get back to the lemma. Usually equal to
  // `pattern`, but can be different for cases like English -ies → -y.
  strip: string;
  // What to add back after stripping, to reconstruct the lemma.
  // Empty string for simple chop-off cases.
  add: string;
  // Toggle without deleting
  enabled: boolean;
  // Optional: restrict this rule to entries with a specific part of speech.
  // Empty/undefined means "applies to any POS". Comma-separated values let
  // a single rule cover multiple POS (e.g. "noun,proper-noun").
  pos?: string;
  // Optional: user-written explanation shown as a hover tooltip in the
  // panel. Overrides the built-in explanation for common labels. Useful
  // when you invent a custom inflection category your conlang needs.
  description?: string;
}

export interface LanguageProfile {
  id: string;
  name: string;
  path: string;

  autonym?: string;
  aliases?: string[];
  status?: string;
  modality?: string | string[];
  documentationLanguage?: string;
}

export interface LanguageConfig {
  // Display name of the language
  name: string;
  // Folder containing dictionary entries (one .md file per word)
  dictionaryFolder: string;

  // Optional folder containing canonical morpheme notes. Morphemes remain
  // separate from dictionary entries and are not automatically indexed as
  // standalone words or translation candidates.
  morphemeFolder?: string;

  // Optional folder containing standalone linguistic examples.
  exampleFolder?: string;

  // Optional vault path to the canonical Language Profile note.
  // Omitted for backwards compatibility with existing configurations.
  profilePath?: string;
  // Cypher sheets used for translation when a word isn't in the dictionary
  sheets: CypherSheet[];
  // If true, hovering a recognised conlang word shows its English definition
  hoverEnabled: boolean;
  // Optional morphological rules used when a direct dictionary lookup misses.
  // Tried in order; first match wins.
  inflections?: InflectionRule[];
}

export interface ConlangSettings {
  languages: LanguageConfig[];
  // List of languages currently "active" — hover, lookup, and dictionary
  // queries check all of them. Multiple languages let GM-style users see
  // every translation of a concept at once. (New in v0.13.)
  activeLanguages: string[];
  // Which language new entries default to, and the target for English→conlang
  // translation. Must be one of the active languages.
  primaryLanguage: string;
  // Legacy single-language field. Kept for backwards compat on migration;
  // not used directly anymore. Migration code reads this and populates
  // activeLanguages/primaryLanguage if they're empty.
  activeLanguage?: string;
  // When committing a translation, wrap it with this syntax so we can find it again
  commitWrapper: "footnote-style" | "html-tooltip" | "wikilink";
  // Modifier key required for hover tooltip to appear. "none" = always-on
  // (the old behaviour), "shift"/"alt"/"ctrl" require holding that key.
  // Default "shift" because always-on is too intrusive — multiple testers said so.
  hoverModifier: "none" | "shift" | "alt" | "ctrl";
  // === Hover direction (v0.21) ===
  // Hovering resolves in two directions. These mirror highlightConlang /
  // highlightEnglish so the two feature areas are configured the same way.
  //
  // Conlang direction: the hovered word IS one of your made-up words (a
  // headword, a declared form, an inflected form, or a known phrase), and the
  // tooltip shows its meaning.
  hoverConlang: boolean;
  // English direction: the hovered word is English that some entry translates,
  // so the tooltip shows the conlang word(s) for it. This ALSO governs the
  // cypher preview fallback, which is an English-to-conlang transformation of
  // the hovered text — leaving that on while this is off would keep producing
  // the very output the user switched off. Turn off when your made-up words
  // are being mistaken for English.
  hoverEnglish: boolean;
  // What to show in the hover tooltip when a word has no dictionary entry.
  // "cypher" = the cyphered form (default — the existing behaviour),
  // "nothing" = no tooltip at all (less noise for users who only care about dictionary).
  hoverFallback: "cypher" | "nothing";
  // Set to true after the user has seen the first-run welcome notice.
  // Persisted in settings so the message only appears once per install.
  hasSeenWelcome?: boolean;
  // === Known-word highlighting (v0.16) ===
  // Master switch: visually mark words in notes that the plugin recognises,
  // both in the editor (Live Preview / Source) and in Reading view.
  highlightKnownWords: boolean;
  // Visual treatment for highlighted words. "underline" = subtle dotted
  // underline + accent colour (default, least intrusive), "italic" = render
  // in italics, "background" = faint highlighter background.
  highlightStyle: "underline" | "italic" | "background";
  // Highlight conlang headwords — words that exist as dictionary entries in
  // any active language (including inflected forms and known phrases).
  highlightConlang: boolean;
  // Highlight English terms the dictionary can translate (e.g. "cat" when a
  // word meaning cat exists). Useful for spotting "I have a word for this",
  // but noisier in English-heavy notes.
  highlightEnglish: boolean;
  // === Case-sensitive matching (v0.18) ===
  // When true, conlang-word lookups (dictionary headwords, aliases, and
  // phrase matching) distinguish case, so a capitalized form and its
  // lowercase counterpart are treated as different words. Lets proper nouns
  // like "Sol" coexist with a common noun "sol". English-direction lookups
  // stay case-insensitive. Default false (the long-standing behaviour).
  caseSensitiveMatching: boolean;
  // === Declared forms (v0.20) ===
  // Show an entry's hardcoded `forms:` (declension/conjugation table) in the
  // hover tooltip. The side panel always shows them; this only controls the
  // tooltip, which some users keep deliberately minimal.
  showFormsInTooltip: boolean;
}

export const DEFAULT_SETTINGS: ConlangSettings = {
  languages: [
    {
      name: "Example",
      dictionaryFolder: "Made Up Words/Example",
      hoverEnabled: true,
      inflections: [
        // Default rules use POS conditioning so they only fire on appropriate words.
        // Edit these in Settings → Made Up Words → Inflection rules, or apply a preset.
        { label: "plural", pattern: "th", position: "suffix", strip: "th", add: "", enabled: true, pos: "noun" },
        { label: "genitive", pattern: "en", position: "suffix", strip: "en", add: "", enabled: true, pos: "noun" },
      ],
      // Sheets run top-to-bottom. Put whole-word substitutions FIRST,
      // before sound changes mangle the input beyond recognition.
      sheets: [
        {
          name: "Common Words",
          enabled: true,
          rules: [
            { input: "the", output: "ka", type: "word", enabled: true },
            { input: "and", output: "vel", type: "word", enabled: true },
            { input: "of", output: "no", type: "word", enabled: true },
          ],
        },
        {
          name: "Sounds",
          enabled: true,
          rules: [
            { input: "th", output: "dh", type: "default", enabled: true },
            { input: "sh", output: "sk", type: "default", enabled: true },
            { input: "ch", output: "kh", type: "default", enabled: true },
            { input: "ph", output: "f", type: "default", enabled: true },
          ],
        },
        {
          name: "Vowels",
          enabled: true,
          rules: [
            { input: "a", output: "ae", type: "default", enabled: true },
            { input: "e", output: "i", type: "default", enabled: true },
            { input: "o", output: "u", type: "default", enabled: true },
          ],
        },
      ],
    },
  ],
  activeLanguages: ["Example"],
  primaryLanguage: "Example",
  commitWrapper: "html-tooltip",
  hoverModifier: "shift",
  hoverConlang: true,
  hoverEnglish: true,
  hoverFallback: "cypher",
  highlightKnownWords: true,
  highlightStyle: "underline",
  highlightConlang: true,
  highlightEnglish: true,
  caseSensitiveMatching: false,
  showFormsInTooltip: true,
};
