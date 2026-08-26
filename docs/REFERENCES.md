# Conlang Workbench — References

**Status:** Working reference list

## Purpose

This document records sources used to inform Conlang Workbench's architecture, terminology, validation philosophy, and documentation goals.

References are used as **descriptive resources**, not conformity tests.

A source may reveal a useful question or representational need without implying that every constructed language must answer that question in the same way.

---

## Core Conlanging References

### Mark Rosenfelder — *The Language Construction Kit*

**Edition used:** Edition 1.2, 2015; original publication 2010.

**Role in Conlang Workbench:** Core conlang design and documentation reference.

Particularly relevant areas include:

- sounds and phonology
- phonotactics
- orthography and writing systems
- lexicon construction
- derivational morphology
- inflection
- syntax
- semantics
- pragmatics
- register
- language families
- proto-languages
- sound change
- dialects
- sample texts and glossing
- reference-grammar organization

Rosenfelder repeatedly emphasizes documenting the choices a language actually makes rather than reproducing English structure by default. He also treats translation and text creation as useful ways to expose missing grammar and lexicon.

### Language Creation Society — Resources

**Role:** Curated entry point to conlanging resources and community standards.

Use for discovering established conlang references, terminology, and specialist resources.

### Conlanger's Library

**Role:** Curated bibliography and web-resource collection for conlangers.

Use for broadening research beyond any one construction method or theoretical tradition.

---

## Linguistic Documentation References

### MIT OpenCourseWare — *ConLangs: How to Construct a Language*

**Role:** Academic cross-check for language-construction and descriptive-grammar coverage.

Useful areas include:

- phonetics and phonology
- morphology
- syntax
- grammatical categories
- writing systems
- historical linguistics
- examples and final grammatical description

### Leipzig Glossing Rules

**Role:** Primary reference for interlinear morpheme-by-morpheme glossing conventions.

Conlang Workbench may support Leipzig-style abbreviations and formatting as defaults while permitting language-specific conventions.

---

## Obsidian and Implementation References

### Interlinear Glossing (Ling Gloss)

Conlang Workbench should support interoperability with established
Obsidian interlinear-gloss formats where practical.

The Interlinear Glossing plugin (`ling-gloss`) is an important reference
implementation.

Conlang Workbench should aim to:

- preserve existing `gloss` and `ngloss` blocks unchanged when not editing them
- recognize their major linguistic tiers
- import them into the Workbench's internal example representation
- export compatible examples back to Ling Gloss syntax
- preserve unsupported directives during round-trip editing where practical
- avoid requiring users to migrate existing glosses merely to use Workbench features

Ling Gloss syntax is an interchange and authoring format, not the canonical
linguistic data model itself.

Representative Ling Gloss directives include:

```text
\ex   original/source text
\gla  aligned level A
\glb  aligned level B
\glc  optional third aligned level
\ft   free translation
\num  numbering
\src  source attribution
```

The aligned levels should not be assigned fixed linguistic meanings by
Conlang Workbench. Their interpretation may vary according to the language,
example, or author's documentation practice.

---

## Further References Identified Through the LCK

These are not yet necessarily direct design authorities for the plugin, but they are useful candidates for deeper research.

### Thomas E. Payne — *Describing Morphosyntax: A Guide for Field Linguists*

Relevant to morphology and syntax documentation, especially for avoiding an English-only perspective.

### Stephen C. Levinson — *Pragmatics*

Relevant to deixis, presupposition, implicature, speech acts, and conversation analysis.

### R. A. Hudson — *Sociolinguistics*

Relevant to language variation, social context, and the language/culture interface.

### Roger Lass — *Phonology: An Introduction to Basic Concepts*

Relevant to phonological analysis beyond simple inventory listing.

### Sarah Grey Thomason & Terrence Kaufman — *Language Contact, Creolization, and Genetic Linguistics*

Relevant to borrowing, contact, inheritance, and language-family modeling.

---

## Project Use

When a major feature area is designed, references should be used to perform a coverage audit.

Classify the result as:

- Supported
- Partial
- Planned
- Not needed
- Intentionally open

The purpose is to reveal representational gaps.

The audit must not turn a reference work's table of contents into a mandatory universal grammar template.
