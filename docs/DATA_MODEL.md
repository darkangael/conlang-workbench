# Conlang Workbench --- Data Model

**Version:** 0.1\
**Status:** Draft

## Purpose

This document defines the initial data-model principles for Conlang
Workbench.

Conlang Workbench is intended to support the creation, development,
analysis, documentation, and eventual publication of constructed
languages within Obsidian.

The data model must remain language-neutral. No individual language,
language family, grammatical typology, writing system, or linguistic
tradition is assumed to be the default.

Individual languages define their own requirements through language
profiles and related schemas.

------------------------------------------------------------------------

## 1. Core Principles

### 1.1 Markdown Is Canonical

The user's Markdown files are the authoritative language documentation.

Conlang Workbench may index, interpret, validate, display, and edit
those files, but the language data must not depend upon an opaque
internal database.

A vault must remain meaningfully usable if Conlang Workbench is removed
or unavailable.

### 1.2 Human-Readable Storage

Plugin-managed information should remain understandable and reasonably
editable as ordinary Markdown.

Conlang Workbench should enhance the vault rather than make the vault
dependent upon the plugin.

### 1.3 Flat Frontmatter

Conlang Workbench should prefer flat YAML frontmatter.

Frontmatter is intended primarily for document identity, language
identity, classification, indexing, filtering, simple linguistic
properties, status information, simple relationships, and other concise
metadata.

Nested YAML must not be required for normal Conlang Workbench operation.

Complex linguistic structures belong primarily in standardized Markdown
body sections.

### 1.4 Language Neutrality

Conlang Workbench must not assume that languages use a particular word
order, distinguish particular parts of speech, mark number or gender,
use grammatical case, inflect verbs, use tense or articles, use an
alphabet, have predictable stress, use concatenative morphology,
distinguish words in the same manner as English, or possess any other
particular grammatical or phonological feature.

Language-specific behavior belongs in the language profile or associated
language documentation.

### 1.5 Configurability Without Field Overload

Different languages require different kinds of information.

Conlang Workbench should expose fields and tools relevant to the
language and document category being edited rather than presenting every
possible linguistic field to every user.

A simple language must be allowed to remain simple. A complex language
must not be constrained by the requirements of a simpler one.

### 1.6 Existing Notes Remain Valid

Adopting Conlang Workbench should not require immediate migration of an
existing conlang vault.

Existing Markdown notes should remain usable wherever their information
can be recognized reliably. Richer Conlang Workbench structures may be
introduced progressively.

### 1.7 Irregularity Is Data

Naturalistic irregularity, historical residue, suppletion, exceptions,
unusual forms, and deliberate violations of productive patterns are
legitimate language data.

Validation must distinguish among invalid data, incomplete
documentation, unusual forms, and intentional exceptions.

A warning is not necessarily an error.

### 1.8 Human Judgment Is Authoritative

Conlang Workbench may assist with analysis, generation, validation, and
organization.

It must not silently make linguistic or creative decisions on behalf of
the language creator.

### 1.9 Facts and Analysis May Differ

The data model should permit a distinction between observed or
established facts about how a language behaves and linguistic analysis
or interpretation of those facts.

A language creator may know that a construction behaves in a particular
way before deciding how best to analyze or classify it.

### 1.10 Linguist-Readable Documentation

The data model should be capable of supporting documentation precise
enough that another person, including a linguist, can correctly
understand, pronounce, analyze, and reproduce the documented language
without depending upon undocumented knowledge held by its creator.

This is a long-term design requirement rather than a requirement that
every language be fully documented.

------------------------------------------------------------------------

## 2. Storage Model

Conlang Workbench divides information broadly between frontmatter and
Markdown body content.

### 2.1 Frontmatter

Frontmatter should contain concise properties useful for identification,
indexing, searching, filtering, and validation.

A conceptual lexeme might contain:

``` yaml
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

This example illustrates storage structure only. It does not define
required fields for all languages.

### 2.2 Markdown Body

Complex or variable linguistic information should normally be stored in
standardized Markdown sections.

Examples include multiple lexical senses, detailed definitions,
paradigms, usage examples, interlinear glossed text, allophonic
distributions, phonological rules, sound changes, etymological
explanations, semantic development, grammatical rules and exceptions,
historical reconstruction, sociolinguistic information, cultural usage,
and unresolved analysis.

Conlang Workbench may provide specialized editors for these sections
while preserving their Markdown representation.

------------------------------------------------------------------------

## 3. Language Profiles

Each language may have a Language Profile.

The Language Profile describes the language-specific configuration used
by Conlang Workbench.

A profile may eventually define or reference information such as
language name, autonym, alternate names, language family, historical
stage, dialect or variety, lexicon and grammar locations, document
categories, lexical categories, phoneme inventory, phonotactic
constraints, orthographic conventions, pronunciation conventions, stress
and prosodic rules, morphological behavior, grammatical categories,
glossing conventions, writing systems, validation rules, and enabled
Workbench features.

No particular feature is assumed to exist merely because Conlang
Workbench supports documenting it.

A language profile describes the language; it does not force the
language into a universal template.

------------------------------------------------------------------------

## 4. Document Categories

Conlang Workbench should recognize multiple categories of language
documentation.

The initial model anticipates at least the following categories.

### 4.1 Lexeme

A lexical entry representing a word, lexicalized expression, or other
dictionary headword.

Possible information includes lemma, display form, pronunciation,
phonemic and phonetic representation, lexical category, gloss, senses,
semantic fields, register, etymology, derivation, related forms,
inflectional information, examples, and usage notes.

### 4.2 Morpheme

A bound or free morpheme documented independently of a lexical entry.

This may include prefixes, suffixes, infixes, circumfixes, clitics,
roots, stems, grammatical particles, reduplicative patterns, and
nonconcatenative morphological elements.

The model must not assume that morphology consists only of prefixes and
suffixes.

### 4.3 Grammar

A document describing grammatical behavior.

Grammar documentation may cover any structure relevant to the language,
including morphology, syntax, semantics, pragmatics, information
structure, or discourse.

### 4.4 Phonology

A document describing sounds or sound systems.

This may include phonemes, allophones, inventories, distribution,
phonotactics, syllable structure, stress, tone, pitch accent, rhythm,
intonation, and connected-speech processes.

### 4.5 Orthography or Writing System

A document describing how a language is represented visually.

This may include romanization, native scripts, transliteration,
grapheme-to-sound relationships, spelling conventions, punctuation,
historical orthographies, and non-alphabetic writing systems.

Conlang Workbench must not assume that writing is alphabetic.

### 4.6 Sentence or Example

A linguistic example showing language in use.

An example may include original text, pronunciation, phonemic or
phonetic transcription, morphological segmentation, morpheme-by-morpheme
gloss, free translation, context, source, and commentary.

### 4.7 Paradigm

A structured collection of related forms.

Paradigms may be represented through human-readable Markdown tables or
other standardized Markdown structures.

The model must permit both productive regular paradigms and explicitly
stored irregular forms.

### 4.8 Historical Language Material

Documentation may represent reconstructed forms, ancestral languages,
daughter languages, historical stages, cognates, borrowings, sound
changes, semantic changes, grammaticalization, and dialect development.

Historical relationships should eventually be representable as
meaningful typed relationships rather than prose alone.

### 4.9 Sociolinguistic and Usage Documentation

Languages may document distinctions involving register, formality,
social status, region, dialect, ritual usage, taboo language,
occupational vocabulary, poetic usage, historical usage, or other
socially conditioned variation.

No particular distinction is assumed to exist.

------------------------------------------------------------------------

## 5. Lexical Senses

A lexeme may possess any number of senses.

A simple `gloss` property may provide a concise summary suitable for
search results and dictionary indexes.

Detailed senses should be capable of being represented separately in the
Markdown body.

Each sense may eventually support information such as gloss, definition,
lexical category, semantic field, register, usage restrictions,
examples, historical notes, and relationships to other senses.

Conlang Workbench should not require every lexeme to use detailed sense
records. Simple entries must remain simple when additional structure
provides no benefit.

------------------------------------------------------------------------

## 6. Relationships

Language documentation frequently contains meaningful relationships
among entries.

Conlang Workbench should eventually support typed relationships such as:

-   derived from
-   compound of
-   cognate with
-   borrowed from
-   descended from
-   variant of
-   allomorph of
-   related to

Relationships should use ordinary Obsidian links wherever practical so
that they remain useful outside the plugin.

The relationship type supplies linguistic meaning to the link.

------------------------------------------------------------------------

## 7. Linguistic Examples and Glossing

Interlinear glossed examples are an important part of descriptive
language documentation.

Conlang Workbench should eventually support structured examples
containing distinct tiers for original language text, pronunciation or
transcription where appropriate, morphological segmentation,
morpheme-by-morpheme gloss, natural translation, and notes or context
where needed.

Literal or morphological glosses must remain distinct from natural
translations.

Conlang Workbench may support established linguistic glossing
conventions while allowing language-specific abbreviations and
analytical choices.

------------------------------------------------------------------------

## 8. Validation

Validation should help identify problems without dictating language
design.

Potential validation areas include malformed frontmatter, missing
required metadata, unknown document or lexical categories, invalid or
undocumented phonemes, phonotactic violations, unexpected stress, broken
relationships, missing linked entries, incomplete paradigms,
undocumented gloss abbreviations, and incomplete language documentation.

Validation results should distinguish severity and intent.

At minimum, the model should permit:

-   error
-   warning
-   incomplete
-   intentional exception

------------------------------------------------------------------------

## 9. Documentation Status

Conlang Workbench should permit language information to carry an
appropriate documentation or analysis status.

Possible concepts include:

-   established
-   provisional
-   unresolved
-   reconstructed
-   hypothetical
-   deprecated

Language profiles may define additional statuses when necessary.

The Workbench must not assume that every documented form has equal
certainty or canonical standing.

------------------------------------------------------------------------

## 10. Documentation Completeness

Conlang Workbench should eventually help creators identify undocumented
portions of a language.

Completeness analysis should be based on the features the language
claims to use rather than a universal checklist requiring every language
to possess every grammatical category.

Absence of a feature is not incomplete documentation if the language
does not use that feature.

Completeness tools should identify useful questions such as whether the
phoneme inventory is documented, relevant phonotactic constraints are
described, productive morphological processes and exceptions are
explained, major syntactic constructions are described, gloss
abbreviations are defined, representative examples are available, and
pronunciation rules are sufficient for another person to reproduce the
language.

The purpose is to expose gaps in documentation, not to declare a
language "finished."

------------------------------------------------------------------------

## 11. Publication and Export

The canonical vault is a development and reference environment.

Conlang Workbench should eventually be capable of transforming the same
underlying language documentation into different forms for different
audiences.

Potential outputs include:

-   working dictionary
-   learner dictionary
-   learner grammar
-   descriptive reference grammar
-   linguist-facing documentation
-   web reference
-   print or PDF dictionary
-   language-family reference

Publication formatting must remain separate from canonical storage.

The vault should not need to imitate the final printed document.

------------------------------------------------------------------------

## 12. Backward Compatibility

Conlang Workbench begins from an existing Obsidian dictionary foundation
and must account for existing conlang vaults.

Where practical:

-   existing simple dictionary entries should continue to work
-   additional metadata should be optional unless required by a language
    profile
-   migration should be incremental
-   automated migration should never silently discard information
-   users should be able to inspect proposed migrations before
    committing them

The Workbench should adapt to existing documentation where reasonable
rather than requiring creators to rebuild their languages around the
plugin.

------------------------------------------------------------------------

## 13. Initial Implementation Scope

Data Model v0.1 establishes architectural direction.

The first implementation stage should focus on:

1.  recognizing Conlang Workbench document categories
2.  recognizing Language Profiles
3.  associating documents with languages
4.  preserving existing dictionary behavior
5.  establishing extensible internal types for later language-specific
    schemas
6.  validating basic metadata without requiring nested YAML

The following are intentionally deferred until the foundation is stable:

-   advanced morphology engines
-   automatic paradigm generation
-   sound-change engines
-   full phonotactic validation
-   interlinear gloss editors
-   historical-language visualization
-   completeness auditing
-   dictionary publication
-   descriptive-grammar generation

These are planned capabilities, not requirements for the first
implementation.

------------------------------------------------------------------------

## 14. Design Test

When considering a new data-model requirement, Conlang Workbench should
ask:

> Can this represent the language as the creator intends it, preserve
> the information in human-readable form, and communicate it accurately
> to another person without forcing assumptions from an unrelated
> language?

If the answer is no, the model should be extended rather than forcing
the language to conform to the tool.
