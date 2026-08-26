# Conlang Workbench — Language Profile

**Version:** 0.1  
**Status:** Draft

## Purpose

A Language Profile is the canonical entry point for one documented language, dialect, historical stage, or other language variety.

It describes the language and points to its documentation.

It does **not** define a universal grammar that every language must fill out.

The profile should remain understandable as ordinary Markdown even without Conlang Workbench installed.

## Core Rule

**The Language Profile describes the language; it does not prescribe the language.**

A section may be absent, marked not applicable, or replaced by a language-specific equivalent when the concept does not apply.

References and Workbench prompts should be treated as questions to answer, not as features the language is required to possess.

## Minimal Frontmatter

The normal profile should use flat frontmatter.

A minimal profile may be as small as:

```yaml
---
type: language-profile
language: Example
status: developing
---
```

Additional concise metadata may be added when useful:

```yaml
---
type: language-profile
language: Example
autonym: Example
aliases: []
status: developing
modality: spoken
documentation_language: English
family: ""
parent_language: ""
historical_stage: ""
dialect: ""
tags:
  - conlang
  - language-profile
---
```

These fields are illustrative, not universally required.

`modality` must remain extensible. A language may be spoken, signed, tactile, multimodal, or use another channel.

## Profile Body

The profile body acts as a navigation and orientation document.

A simple language may keep substantial documentation directly in the profile.

A complex language may use the profile mostly as an index linking to specialized notes.

Recommended conceptual areas follow.

## Identity and Context

Document what language or variety this profile represents.

Possible information:

- primary name
- autonym
- alternate names
- historical stage
- dialect or variety
- speakers or users
- modality or modalities
- geographic or fictional context
- purpose of the conlang
- relationship to other languages

## Overview

Provide a concise orientation for readers.

Where useful, this may include a typological summary such as:

- broad morphological tendencies
- common constituent-order tendencies
- alignment
- head/dependent marking tendencies
- major grammatical characteristics

These descriptions are optional analytical aids, not required classifications.

## Phonetics and Phonology

For spoken languages, this area may document or link to:

- phonetic inventory
- phonemic inventory
- allophones
- distribution
- syllable structure
- phonotactics
- stress
- tone
- pitch accent
- rhythm
- intonation
- connected-speech processes
- morphophonology

For non-spoken languages, use an analogous structural description appropriate to the modality rather than forcing phonological terminology where it does not fit.

## Orthography and Writing Systems

Document any system used to represent the language.

Possible information:

- romanization
- transliteration
- native script
- grapheme-to-sound or grapheme-to-unit relationships
- spelling conventions
- punctuation
- capitalization
- historical orthographies
- alternate writing systems

A language may have no writing system.

## Morphology

Document how meaningful forms are built and altered.

Possible areas:

- roots and stems
- inflection
- derivation
- compounding
- clitics
- affixation
- infixation
- reduplication
- stem alternation
- nonconcatenative morphology
- suppletion
- irregularity
- productivity
- morphophonology

No particular morphological process is assumed.

## Syntax

Document how larger structures are formed.

Possible areas include:

- clause structure
- constituent order
- noun phrases
- adpositional structures
- argument structure
- alignment
- negation
- questions
- coordination
- subordination
- relative clauses
- complement clauses
- information-structure effects on word order
- other language-specific constructions

## Semantics

Document how the language divides conceptual space.

Possible areas:

- lexical senses
- semantic fields
- polysemy
- lexical hierarchies
- metaphor systems
- culturally important distinctions
- semantic change
- lexicalization patterns

## Pragmatics and Discourse

Document how meaning depends on context and interaction.

Possible areas:

- deixis
- presupposition
- implicature
- speech acts
- politeness
- evidential use in discourse
- topic and focus
- information structure
- turn-taking
- discourse particles
- genre conventions
- conversation structure

## Sociolinguistics and Register

Possible areas:

- formality
- social status
- honorifics
- regional variation
- dialects
- age-related variation
- occupational registers
- ritual speech
- taboo speech
- slang
- literary forms
- historical registers

## Semantic and Cultural Domains

Some lexical systems are best documented as domains rather than isolated entries.

Possible examples:

- kinship
- time and calendars
- numbers
- space and direction
- color
- naming systems
- social classes
- religion and ritual
- law
- ecology
- technology
- food
- material culture

The language should define the domains that matter to it.

## Historical Development

Where relevant, document or link to:

- proto-language relationships
- reconstructed forms
- sound changes
- semantic changes
- grammaticalization
- borrowing
- language contact
- dialect development
- daughter languages
- historical stages

Reconstructed and attested forms should be distinguishable.

## Lexicon

Link to or describe the lexicon.

The profile should not require the lexicon itself to live inside the profile.

The Workbench should support concise searchable glosses while allowing richer multi-sense dictionary entries.

## Examples and Texts

Examples and connected texts are evidence for the language.

A profile should be able to link to:

- individual example sentences
- interlinear glossed examples
- dialogues
- narratives
- ritual texts
- inscriptions
- letters
- songs
- other connected discourse

Texts may reveal gaps in grammar or lexicon and are therefore part of language development as well as presentation.

## Glossing Conventions

Document abbreviations and conventions used in examples.

The Leipzig Glossing Rules may be supported as a useful default, but language-specific analytical choices and abbreviations must be permitted.

Literal or morpheme-by-morpheme glossing must remain distinct from free translation.

## Documentation Notes

Use this area for:

- unresolved questions
- competing analyses
- provisional decisions
- known gaps
- deliberate exceptions
- research notes
- future work

## Language Profile vs Plugin Settings

The Language Profile stores information **about the language**.

Plugin settings store information **about how Conlang Workbench behaves**.

Examples:

| Language Profile | Plugin Settings |
| --- | --- |
| phonology | hover enabled |
| orthography | active language |
| productive morphology | primary language |
| grammatical categories | UI display preferences |
| glossing conventions | highlight style |
| historical relationships | temporary tool behavior |

Some inherited features may initially remain in settings for backward compatibility. That does not imply they belong there permanently.

## Completeness

A Language Profile is not complete because every recommended heading exists.

It is complete enough for a purpose when the relevant features of the language are documented well enough for that purpose.

A feature explicitly marked absent or not applicable is not a documentation gap.

## Design Test

For each proposed profile field or section, ask:

> Does this help describe a language that actually uses this feature without implying that every language must use it?

If not, the feature should be optional, moved into a language-specific schema, or represented in a more general way.
