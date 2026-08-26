# Conlang Workbench — Data Model

**Version:** 0.2
**Status:** Draft

## Purpose

This document defines the initial data-model principles for Conlang Workbench.

Conlang Workbench is intended to support the creation, development, analysis, documentation, and eventual publication of constructed languages within Obsidian.

The data model must remain language-neutral. No individual language, language family, grammatical typology, modality, writing system, or linguistic tradition is assumed to be the default.

Individual languages define their own requirements through language profiles and related documentation.

---

## 1. Core Principles

### 1.1 Markdown Is Canonical

The user's Markdown files are the authoritative language documentation.

Conlang Workbench may index, interpret, validate, display, and edit those files, but the language data must not depend upon an opaque internal database.

A vault must remain meaningfully usable if Conlang Workbench is removed or unavailable.

### 1.2 Human-Readable Storage

Plugin-managed information should remain understandable and reasonably editable as ordinary Markdown.

### 1.3 Flat Frontmatter

Conlang Workbench should prefer flat YAML frontmatter.

Frontmatter is intended primarily for document identity, language identity, classification, indexing, filtering, concise status information, simple linguistic properties, and simple relationships.

Nested YAML must not be required for normal operation.

Complex linguistic structures belong primarily in standardized Markdown body sections.

### 1.4 Language Neutrality

Conlang Workbench must not assume that languages:

- use a particular word order
- distinguish particular parts of speech
- mark number, gender, case, tense, aspect, mood, person, or agreement
- use spoken-auditory modality
- use an alphabet or even a phonographic writing system
- have predictable stress
- use concatenative morphology
- distinguish words in the same manner as English
- possess any other particular grammatical, phonological, orthographic, semantic, pragmatic, or sociolinguistic feature

Language-specific behavior belongs in the language profile or associated documentation.

### 1.5 Describe Rather Than Prescribe

Conlang Workbench should not dictate how a constructed language works. It should provide structures capable of documenting how that language works.

Questions, presets, terminology, and validation may assist the creator, but they must not become hidden requirements.

### 1.6 Configurability Without Field Overload

Different languages require different kinds of information.

A simple language must be allowed to remain simple. A complex language must not be constrained by the requirements of a simpler one.

### 1.7 Existing Notes Remain Valid

Adopting Conlang Workbench should not require immediate migration of an existing conlang vault.

Existing Markdown notes should remain usable wherever their information can be recognized reliably.

### 1.8 Irregularity Is Data

Naturalistic irregularity, historical residue, suppletion, exceptions, unusual forms, and deliberate violations of productive patterns are legitimate language data.

Validation must distinguish among invalid data, incomplete documentation, unusual forms, and intentional exceptions.

### 1.9 Human Judgment Is Authoritative

Conlang Workbench may assist with analysis, generation, validation, and organization.

It must not silently make linguistic or creative decisions on behalf of the creator.

### 1.10 Facts and Analysis May Differ

The data model should permit a distinction between observed or established facts about how a language behaves and linguistic analysis or interpretation of those facts.

### 1.11 Linguist-Readable Documentation

The data model should be capable of supporting documentation precise enough that another person, including a linguist, can correctly understand, pronounce or otherwise realize, analyze, and reproduce the documented language without depending upon undocumented knowledge held by its creator.

### 1.12 References Are Descriptive Resources

Conlanging and linguistic references are used to discover relevant questions, terminology, possibilities, and documentation needs.

They are not conformity tests. A language is not invalid because it answers a reference work's question in an unusual way or because a feature is absent.

---

## 2. Storage Model

Conlang Workbench divides information broadly between frontmatter and Markdown body content.

### 2.1 Frontmatter

Frontmatter should contain concise properties useful for identification, indexing, searching, filtering, and validation.

Example:

```yaml
---
type: lexeme
language: Example
lemma: talu
gloss: river
pos: noun
ipa: /ˈta.lu/
stress: initial
status: established
root: ""
family: []
semantics:
  - water
  - geography
tags:
  - lexicon
---
```

This example illustrates storage structure only. It does not define required fields for all languages.

### 2.2 Markdown Body

Complex or variable linguistic information should normally be stored in standardized Markdown sections.

Examples include multiple lexical senses, paradigms, usage examples, interlinear glossed text, allophonic distributions, phonological rules, morphophonology, sound changes, etymological explanations, semantic development, grammatical rules and exceptions, discourse behavior, historical reconstruction, sociolinguistic information, cultural usage, and unresolved analysis.

---

## 3. Language Profiles

Each language may have a Language Profile.

The Language Profile describes the language-specific configuration and documentation map used by Conlang Workbench.

A profile may eventually define or reference information such as:

- language name and autonym
- alternate names
- modality or modalities
- language family and historical relationships
- historical stage
- dialect or variety
- documentation language
- lexicon and grammar locations
- document categories
- lexical categories
- phonetic and phonological documentation
- phonotactic constraints
- orthographic conventions and writing systems
- pronunciation or realization conventions
- stress, tone, prosody, or analogous systems
- morphological behavior
- grammatical categories
- syntax
- semantics
- pragmatics and discourse
- sociolinguistic variation
- semantic and cultural domains
- glossing conventions
- validation rules
- enabled Workbench features

No particular feature is assumed to exist merely because Conlang Workbench supports documenting it.

---

## 4. Document Categories

Conlang Workbench should recognize multiple categories of language documentation.

### 4.1 Lexeme

A lexical entry representing a word, lexicalized expression, sign, or other dictionary headword.

### 4.2 Morpheme

A bound or free morpheme documented independently of a lexical entry.

The model must not assume that morphology consists only of prefixes and suffixes.

### 4.3 Grammar

A document describing grammatical behavior, including morphology, syntax, semantics, pragmatics, information structure, or discourse.

### 4.4 Phonetics and Phonology

A document describing sound systems, phonetic realization, phonemes, allophones, inventories, phonotactics, syllable structure, stress, tone, pitch accent, rhythm, intonation, or connected-speech processes.

For non-spoken modalities, the analogous structural documentation should be possible without forcing spoken-language terminology.

### 4.5 Orthography or Writing System

A document describing how a language is represented visually or otherwise encoded.

The model must not assume writing is alphabetic.

### 4.6 Sentence or Example

A linguistic example showing language in use.

An example may include original text, realization or transcription, segmentation, morpheme-by-morpheme gloss, free translation, context, source, and commentary.

### 4.7 Text

A larger connected piece of language data such as a conversation, narrative, ritual, inscription, letter, song, or other discourse sample.

A text may contain or link to multiple individually glossed examples.

Texts are a first-class source of evidence for grammar, lexicon, pragmatics, discourse, and documentation completeness.

### 4.8 Paradigm

A structured collection of related forms.

The model must permit both productive regular paradigms and explicitly stored irregular forms.

### 4.9 Historical Language Material

Documentation may represent reconstructed forms, ancestral languages, daughter languages, historical stages, cognates, borrowings, sound changes, semantic changes, grammaticalization, and dialect development.

### 4.10 Sociolinguistic and Usage Documentation

Languages may document register, formality, social status, region, dialect, ritual usage, taboo language, occupational vocabulary, poetic usage, historical usage, or other socially conditioned variation.

### 4.11 Semantic and Cultural Domains

A language may organize culturally important semantic fields in ways not mirrored by the documentation language.

Relevant domains may include kinship, time, space, color, social categories, naming, ritual terminology, material culture, ecology, or any other domain important to the speakers.

---

## 5. Lexical Senses

A lexeme may possess any number of senses.

A simple `gloss` property may provide a concise summary suitable for search results and dictionary indexes.

Detailed senses should be capable of being represented separately in the Markdown body.

Conlang Workbench should not require every lexeme to use detailed sense records.

---

## 6. Relationships

Conlang Workbench should eventually support typed relationships such as:

- derived from
- compound of
- cognate with
- borrowed from
- descended from
- variant of
- allomorph of
- related to

Relationships should use ordinary Obsidian links wherever practical.

---

## 7. Linguistic Examples and Glossing

Interlinear glossed examples are an important part of descriptive language documentation.

Conlang Workbench should eventually support distinct tiers for:

1. original language text
2. pronunciation, realization, or transcription where appropriate
3. morphological segmentation
4. morpheme-by-morpheme gloss
5. natural translation
6. notes or context where needed

Literal or morphological glosses must remain distinct from natural translations.

Established conventions such as the Leipzig Glossing Rules may be supported as defaults while permitting language-specific conventions.

---

### 7.1 Interlinear Gloss Interoperability

Conlang Workbench should maintain its own language-neutral representation of
linguistic examples while supporting interoperability with established
human-readable glossing formats.

The Interlinear Glossing (`ling-gloss`) Obsidian plugin is an important
interoperability target.

Where practical, Conlang Workbench should be able to:

- recognize existing `gloss` and `ngloss` blocks
- preserve those blocks unchanged when Conlang Workbench is not editing them
- interpret supported directives and aligned levels
- import supported Ling Gloss content into the Workbench's internal example representation
- export compatible examples to Ling Gloss syntax
- preserve unsupported directives during round-trip editing
- avoid requiring migration merely to use other Conlang Workbench features

Ling Gloss syntax should be treated as an authoring and interchange format,
not as Conlang Workbench's canonical linguistic data model.

The Workbench's internal representation should distinguish the linguistic
role of a tier from its position in an external format. For example, an
aligned level might contain phonetic transcription, morphological
segmentation, morpheme glosses, or another language-specific representation.

Conlang Workbench therefore must not assume that a particular Ling Gloss
aligned level always has a particular linguistic meaning.

### 7.2 Round-Trip Preservation

Interoperability should favor lossless or minimally destructive round trips.

When Conlang Workbench reads an external human-readable format and later
writes it again, information that the Workbench does not understand should
be preserved wherever practical rather than silently discarded.

If lossless round-trip editing cannot be guaranteed, the user should be
warned before an operation rewrites the source.

This principle applies beyond Ling Gloss and should guide future support for
other linguistic Markdown formats.

---

## 8. Validation

Validation should help identify problems without dictating language design.

Potential areas include malformed frontmatter, missing required metadata, unknown categories, undocumented segments or symbols, structural violations defined by the language itself, broken relationships, incomplete paradigms, undocumented gloss abbreviations, and incomplete documentation.

At minimum, validation should permit:

- error
- warning
- incomplete
- intentional exception

---

## 9. Documentation Status

Possible status concepts include:

- established
- provisional
- unresolved
- reconstructed
- hypothetical
- deprecated

Language profiles may define additional statuses when necessary.

---

## 10. Documentation Completeness

Completeness analysis should be based on the features the language claims to use rather than a universal checklist.

Absence of a feature is not incomplete documentation if the language does not use that feature.

Completeness tools should be capable of asking whether relevant areas are adequately documented, including phonetics/phonology or analogous modality structure, morphology, syntax, semantics, pragmatics, discourse, orthography, examples, texts, glossing conventions, and historical relationships where applicable.

The purpose is to expose gaps in documentation, not to declare a language "finished."

---

## 11. Publication and Export

Potential outputs include:

- working dictionary
- learner dictionary
- learner grammar
- descriptive reference grammar
- linguist-facing documentation
- web reference
- print or PDF dictionary
- language-family reference
- annotated corpus or text collection

Publication formatting must remain separate from canonical storage.

---

## 12. Backward Compatibility

Where practical:

- existing simple dictionary entries should continue to work
- additional metadata should be optional unless required by a language profile
- migration should be incremental
- automated migration should never silently discard information
- users should be able to inspect proposed migrations before committing them

---

## 13. Reference-Guided Coverage Audit

Before a major data-model area is considered stable, compare it against relevant conlanging and linguistic references.

Classify coverage as:

- Supported
- Partial
- Planned
- Not needed
- Intentionally open

The purpose is to find representational gaps, not to require every language to exhibit every feature found in reference works.

---

## 14. Initial Implementation Scope

The first implementation stage should focus on:

1. recognizing Conlang Workbench document categories
2. recognizing Language Profiles
3. associating documents with languages
4. preserving existing dictionary behavior
5. establishing extensible internal types for later language-specific schemas
6. validating basic metadata without requiring nested YAML

Advanced morphology, automatic paradigms, sound-change engines, full phonotactic validation, interlinear editors, historical visualization, completeness auditing, and publication systems remain deferred until the foundation is stable.

---

## 15. Design Test

When considering a new data-model requirement, Conlang Workbench should ask:

> Can this represent the language as the creator intends it, preserve the information in human-readable form, and communicate it accurately to another person without forcing assumptions from an unrelated language?

If the answer is no, the model should be extended rather than forcing the language to conform to the tool.
