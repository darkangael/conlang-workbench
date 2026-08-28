# Conlang Workbench — Linguistic Coverage Audit

**Version:** 0.1  
**Status:** Working audit

## Purpose

This document audits Conlang Workbench's ability to represent, document,
and work with constructed languages.

The audit compares the Workbench's current and planned capabilities against
established conlanging resources, linguistic documentation practices, and
relevant Obsidian implementations.

Its purpose is to discover representational gaps before implementation
choices make those gaps difficult to correct.

This is **not** a checklist of features that every constructed language must
possess.

A language may lack a grammatical or linguistic feature entirely. Such an
absence is not a deficiency in either the language or its documentation.

## Governing Principle

> Conlang Workbench should not dictate how a constructed language works.
> It should provide structures capable of documenting how that language works.

Reference works therefore provide **questions and possibilities**, not
mandatory answers.

The central question of this audit is:

> If a creator's language does this, can Conlang Workbench document it
> accurately without forcing the language into an unrelated model?

---

## Cross-Cutting Principles

The detailed audit established several principles that apply across feature
areas.

### Human Authority

Creator-established language data is authoritative.

Generated, predicted, reconstructed, or inferred information must remain
distinguishable from creator-established information.

### Documentation Before Automation

A linguistic phenomenon does not need to be machine-generatable or
machine-parseable to be valid Workbench data.

Human-readable documentation is sufficient when formalization would be
premature or inappropriate.

### Facts Before Analysis

Where linguistic analysis is uncertain, the Workbench should permit observed
forms, realizations, examples, and relationships to be documented without
forcing the creator to choose one theoretical interpretation.

### Absence Is Not Missing Data

The Workbench should distinguish among:

- intentionally absent
- not applicable
- not yet documented
- unresolved
- unknown

These states must not be silently conflated.

### Language-Defined Validation

Validation should compare data against the structures and rules declared for
that language.

It should not impose English structure, a universal grammar template, or a
natural-language typology as a conformity test.

### Canonical Data and Presentation Are Separate

Canonical linguistic information should remain independent of any particular
UI, publication layout, export format, or external plugin syntax.

### Preserve Before Discarding

When encountering external or unfamiliar information, the Workbench should
prefer preserving what it does not understand over silently deleting or
normalizing it.

### Specialist Tools Remain Specialist Tools

Conlang Workbench should integrate with or export to specialized tools where
appropriate rather than reimplementing unrelated mature capabilities merely
to keep every workflow inside the plugin.

### Generation Proposes; Humans Establish

Generated, inferred, reconstructed, predicted, or automatically analyzed
material should begin as a proposal rather than silently becoming authoritative
language data.

For constructed languages, creator acceptance establishes the language.

For natural-language documentation, observed and attested evidence must remain
distinguishable from Workbench-generated analysis or reconstruction.

### Proposed → Accepted → Revised

Generative and analytical workflows should distinguish among:

- **proposed** — a suggestion that may be regenerated, modified, compared, or
  discarded freely;
- **accepted** — a human-established decision or analysis that Workbench should
  treat as stable language data;
- **revised** — an accepted decision deliberately changed later while preserving
  the fact that an earlier accepted state existed.

Regeneration should operate upon proposals, not silently rewrite accepted or
attested material.

### Revision Does Not Erase History

Changing an accepted rule, naming convention, orthography, phonological system,
or other language structure should affect future expectations and proposals
without automatically invalidating material established under an earlier state.

Older forms and conventions may remain historically, regionally, socially,
ceremonially, nostalgically, or otherwise culturally valid.

### AI Assistance Is Optional

Conlang Workbench should remain fully useful without artificial-intelligence
services.

AI-assisted features should be **off by default** and require deliberate user
opt-in.

When AI assistance is enabled, the architecture should permit both:

- locally operated models or services;
- external AI providers explicitly configured by the user.

No canonical language data should depend upon continued access to a particular
AI model, provider, or service.

AI-generated or AI-inferred material follows the same proposal lifecycle as
other generated analysis:

```text
AI assistance
      ↓
proposal or analysis
      ↓
human review
      ↓
accepted, revised, or rejected
```

AI assistance must not silently establish, overwrite, or reinterpret accepted
or attested language data.

The Workbench should also distinguish AI assistance from ordinary deterministic
functionality. Dictionary lookup, declared-rule validation, morphological rule
application, indexing, search, and other conventional algorithms should remain
available without enabling AI merely because they perform automated work.

Where practical, AI-assisted results should identify their origin and preserve
enough provenance for the user to understand that the result was generated
rather than directly attested or manually established.

#### AI Workspace and Promotion Boundary

AI assistance should have a designated non-canonical workspace in which it can
write persistent notes, proposals, analyses, summaries, generated forms, and
working memory.

AI may read the canonical language documentation included within the scope of
its workspace, but should write its own material only to that workspace unless
the user explicitly promotes material into canonical language documentation.

Conceptually:

```text
canonical language documentation
            ↓ read
       AI assistant
            ↓ write
       AI workspace
            ↓
       human review
            ↓
   promote / revise / reject
            ↓
canonical language documentation
```

The AI workspace should remain clearly distinguishable from accepted or
attested language material.

Possible workspace content may include:

- generated lexical or grammatical proposals;
- tentative morphological analyses;
- inferred phonological, morphological, syntactic, or semantic patterns;
- unresolved questions;
- summaries of prior AI-assisted work;
- evidence or references used by an analysis;
- model-generated development notes;
- working hypotheses;
- language-specific or comparative AI memory useful for later sessions.

Promotion from an AI workspace into canonical language documentation must be
an explicit user action.

Promoting material may involve accepting it unchanged, revising it first, or
using it as the basis for new canonical documentation.

AI workspace material should retain provenance where practical so that promoted
content can remain distinguishable from directly attested evidence,
creator-authored decisions, or manually established analysis.

#### AI Workspace Scope

AI workspace scope should be explicit rather than assumed.

For work focused on one language, the user should be able to create or use a
**language-local workspace** associated with that language.

A language-local workspace may read the canonical documentation belonging to
that language while keeping its AI memory, proposals, analyses, and other
generated material within that language's own documentation area.

Conceptually:

```text
Language
├── canonical language documentation
└── AI Workspace
    ├── proposals
    ├── analyses
    ├── notes
    └── working memory
```

The precise folder structure should remain an implementation decision rather
than being fixed by this audit.

Users should also be able to create a separate **cross-language workspace**
when they deliberately want comparative or contact-oriented work.

A cross-language workspace should read only the languages or varieties the user
explicitly includes within its scope.

Possible uses include:

- comparative analysis;
- language-family reconstruction;
- dialect or variety comparison;
- language-contact analysis;
- loanword investigation;
- historical comparison across related languages;
- comparison of morphological, phonological, syntactic, or semantic systems.

A cross-language workspace should maintain its own non-canonical AI memory and
working material rather than writing directly into the canonical documentation
of any participating language.

Conceptually:

```text
Language A ──┐
Language B ──┼── read ──→ Cross-Language AI Workspace
Language C ──┘                     │
                                   ↓
                         proposals / analyses
                                   │
                              human review
                                   ↓
                         explicit promotion
```

The user should control which languages are available to a cross-language
workspace and should be able to change that scope deliberately.

Neither a language-local nor a cross-language AI workspace should silently
expand its own reading scope.

Promotion from either type of workspace into canonical language documentation
remains an explicit human action.

The workspace model therefore provides AI with persistent working memory
without granting it authority over the language itself.

---

## Status Values

### Supported

The current implementation can represent and use the feature adequately.

### Partial

Some useful representation or functionality exists, but important cases
remain unsupported.

### Planned

The feature belongs within the intended scope of Conlang Workbench but has
not yet been implemented adequately.

### Not Needed

The feature does not require special representation or functionality from
Conlang Workbench.

### Intentionally Open

The Workbench should permit the creator to document the feature without
attempting to model, constrain, or interpret it completely.

---

## Priority Values

### Foundation

The architecture must account for this before dependent systems are built.

### Early

Important to the first broadly useful versions of Conlang Workbench.

### Later

Useful and within scope, but not necessary for the initial Workbench.

### Research

The appropriate representation is not yet sufficiently understood to design
responsibly.

---

## Audit Method

For each area:

1. Identify what a conlanger may reasonably need to document.
2. Determine what the current Made Up Words / Conlang Workbench code already
   represents.
3. Compare that support against the project references.
4. Identify important representational gaps.
5. Decide whether those gaps require structured data, Markdown documentation,
   plugin behavior, or deliberate openness.
6. Assign a coverage status and implementation priority.
7. Record unresolved design questions rather than inventing premature answers.

---

## Coverage Summary

| Area | Status | Priority | Notes |
| --- | --- | --- | --- |
| Language identity and profiles | Supported | Foundation | Basic operative Language Profile support establishes language identity separately from plugin configuration; richer relationships remain future work |
| Guided language creation and proposal workflow | Planned | Early | Generation should offer explainable proposals, scoped regeneration, modification, and explicit human acceptance rather than silently establishing language data |
| Naming traditions and name generation | Planned | Early | Naming systems should support generated proposals, multiple simultaneous or historical traditions, cultural scope, revision, revival, and stable previously established names |
| Lexicon and lexical senses | Supported | Foundation | Basic structured lexical senses and sense-aware English lookup are implemented while simple dictionary entries remain supported |
| Phonetics and phonology | Planned | Early | Language-level inventories, realization, allophony, and unresolved analyses are not yet represented |
| Phonotactics and prosody | Planned | Early | Documentation must precede optional machine validation; spoken-language assumptions must not be universal |
| Orthography and writing systems | Planned | Early | Must distinguish lexical identity, native orthography, romanization, transliteration, and transcription |
| Morphology | Partial | Foundation | Morpheme Inventory and existing inflection engine provide an operative foundation; broader morphological processes and analysis remain future work |
| Morphophonology | Planned | Early | Architecture must permit morphology and phonology to interact without forcing all processes into `strip` / `add` rules |
| Syntax | Planned | Early | Construction-oriented documentation is needed; universal English-shaped sentence models should be avoided |
| Semantics | Partial | Early | Existing definitions, structured lexical senses, and sense-aware lookup provide a useful base; broader semantic relationships and culturally specific semantic organization remain needed |
| Pragmatics and discourse | Planned | Later | Primarily descriptive initially; must permit contextual, discourse, and multimodal information |
| Sociolinguistics and register | Planned | Later | Variation must be treated as legitimate language data rather than automatically as inconsistency |
| Semantic and cultural domains | Planned | Later | Creator-defined domains should support culturally specific conceptual organization without imposing a universal taxonomy |
| Linguistic examples | Supported | Foundation | Standalone linguistic examples with optional analysis tiers, browsing, search, and source-note navigation are implemented |
| Interlinear glossing | Planned | Early | Leipzig-informed representation can build upon the internal linguistic-example model; external syntax should not become the internal model |
| Connected texts and corpora | Planned | Later | Markdown texts should remain first-class evidence; corpus organization need not require a separate database |
| Historical development | Planned | Later | Must distinguish descent, borrowing, reconstruction, cognacy, synchronic derivation, and historical processes |
| Language families and varieties | Planned | Later | Typed relationships are needed; family trees should be generated views rather than the canonical relationship model |
| Validation and completeness | Planned | Later | Must distinguish invalid, inconsistent, exceptional, incomplete, absent, unresolved, predicted, and attested data |
| Publication and export | Planned | Later | Canonical Markdown should remain separate from presentation; specialist publishing tools should not be unnecessarily reimplemented |
| External-format interoperability | Planned | Foundation | Architectural requirements established; adapters translate between Workbench's canonical models and external representations, with import and export treated as independent capabilities; implementation deliberately deferred until needed |

---

### Reading the Priorities

Priority describes how early the architecture must account for an area, not
the order in which every feature must be fully implemented.

**Foundation** means later systems depend upon decisions made here or could be
made unnecessarily difficult by an incompatible early design.

**Early** means the area is important to making Conlang Workbench broadly
useful, but it can build upon the foundational architecture.

**Later** means the architecture should leave room for the area, but substantial
implementation can wait until the core Workbench is useful.

**Research** means implementation should wait until the representational
problem is better understood.

A Foundation area may therefore begin with a deliberately small implementation.

For example, external-format interoperability is foundational because the data
model must permit preservation and round-trip behavior, but full support for
many external formats is not required before Early features can be built.

---

## Workbench Workflow Extensions

The following areas span several linguistic domains and therefore do not fit
cleanly into only one numbered linguistic-coverage section.

### Guided Language Creation and Proposal Workflow

**Status:** Planned  
**Priority:** Early

Conlang Workbench should support users who want to create a language but do not
yet know enough linguistic terminology or design practice to begin from an
empty phonological inventory, grammar, or lexicon.

A guided workflow may offer:

- approachable descriptive starting choices;
- several alternative proposals rather than one generated answer;
- explanations of the linguistic structures underlying those proposals;
- modification of individual proposals;
- regeneration of rejected proposals;
- scoped regeneration of only one subsystem;
- direct manual entry for users who already know what they want;
- inference from existing names, words, or other supplied forms;
- provenance identifying which source material contributed to a proposal.

Generation should remain scaffolding rather than authority.

The user should always be able to reject generated options, regenerate them,
modify them, or bypass generation entirely.

Accepted forms must remain stable unless the user deliberately revises them.

#### Generation Profiles

A simple Latin A–Z representation may be offered as the beginner-friendly
default because it is easy to type, share, and recognize.

It must remain a profile or presentation choice rather than a restriction in
the linguistic data model.

Workbench should leave room for:

- Latin orthographies with diacritics;
- IPA-oriented transcription;
- non-Latin writing systems;
- multiple transcription or transliteration systems;
- custom orthographies and scripts;
- languages without a conventional written form.

Sound system, transcription, romanization or transliteration, and native
orthography should not be silently conflated.

#### Inference from Existing Forms

A user may already possess names, words, or attested forms before documenting
the structures that produced them.

Workbench should eventually be able to analyze such material and propose
possible:

- sound inventories;
- recurring phonological patterns;
- syllable structures;
- phonotactic tendencies;
- morphological patterns;
- naming conventions.

The supplied forms remain evidence. Inferred structures remain proposals until
accepted or otherwise established by the user.

### Naming Traditions and Name Generation

**Status:** Planned  
**Priority:** Early

Naming conventions should be first-class language and cultural documentation
rather than one mutable global generator setting.

A language or community may possess multiple naming traditions differentiated
by:

- historical period;
- region;
- dialect or variety;
- social group;
- class;
- religion;
- ceremony;
- family or clan;
- personal preference;
- revival or nostalgia;
- heritage;
- borrowing from another culture;
- name category.

Possible name categories include personal names, family names, clan names,
patronymics, matronymics, titles, regnal names, religious names, earned names,
epithets, place names, hydronyms, ethnonyms, and other language-defined
categories.

Naming generation should separate at least:

- the language's available sound or writing system;
- semantic material used in names;
- structural naming patterns;
- cultural and historical scope.

If a naming convention has not yet been established, Workbench may propose
several alternatives with the normal Proposed → Accepted → Revised lifecycle.

Revising a naming tradition must not retroactively invalidate names previously
accepted or attested under an older convention.

Historical traditions should remain available for deliberate revival,
nostalgic use, heritage naming, ceremonial use, or other culturally motivated
reuse even when they are no longer normally productive.

Names borrowed from another language or culture may preserve foreign features,
undergo adaptation, or acquire new associations in the receiving community.

### Pronunciation Assistance and TTS

**Status:** Planned  
**Priority:** Later

Conlang Workbench may eventually provide pronunciation assistance or
text-to-speech preview for documented forms.

Where possible, pronunciation output should be driven by the language's own
documented phonological, phonetic, stress, and IPA information rather than by a
generic natural-language voice.

If Workbench cannot reproduce the documented pronunciation faithfully, it may
still offer an approximate TTS preview when useful, but the interface should
make that limitation explicit.

Approximate TTS must not be presented as authoritative evidence of how a word
or sentence is pronounced.

Pronunciation assistance may eventually support:

- IPA-aware pronunciation preview;
- language-defined stress;
- language-defined sound correspondences;
- user-provided pronunciation guides;
- comparison between documented and approximate pronunciation;
- optional system or browser TTS as a fallback;
- future specialized speech engines where practical.

TTS should remain optional and should not be required for ordinary Workbench
functionality.

### Rhyme and Poetic Analysis

**Status:** Planned  
**Priority:** Later

Conlang Workbench should eventually support rhyme-oriented analysis for users
working with poetry, songs, chants, verse, translated literature, spells, or
other language where sound patterning matters.

Rhyme analysis should prefer documented pronunciation, phonology, syllable
structure, and stress over spelling alone.

Possible later capabilities may include:

- identifying likely rhyme relationships;
- comparing rhyme patterns across lines;
- distinguishing exact from approximate rhyme;
- identifying stress-sensitive rhyme;
- suggesting accepted lexical alternatives that better preserve rhyme;
- comparing source-language and target-language rhyme structures;
- identifying alliteration, assonance, or related sound patterning where useful.

Suggestions intended to preserve rhyme should remain proposals rather than
silently replacing accepted lexical choices or translations.

Rhyme analysis is desirable but depends upon sufficiently reliable phonological
and prosodic representation and should therefore remain a later-use feature.

---

# Detailed Audit

## 1. Language Identity and Profiles

**Status:** Supported
**Priority:** Foundation

### What needs to be representable

A language profile may need to identify:

- language name
- autonym
- alternate names
- language family
- parent or ancestral language
- historical stage
- dialect or variety
- modality or modalities
- documentation language
- status of the language documentation
- relationships to other language documentation

None of these relationships should imply that every language belongs to a
family, has dialects, or possesses a reconstructed history.

### Current support

Conlang Workbench now provides a basic Language Profile model distinct from
plugin configuration.

The current profile can represent:

- a stable language identifier;
- language name;
- autonym;
- alternate names;
- status;
- modality;
- documentation language.

Workbench language configuration remains responsible for operational behavior
such as:

- dictionary folder;
- morpheme folder;
- linguistic-example folder;
- Language Profile location;
- active and primary language selection;
- hover behavior;
- inflection rules;
- other plugin-specific settings.

This establishes the architectural distinction between:

- the **Language Profile**, which describes the language; and
- **plugin settings**, which describe how Workbench operates upon that
  language.

The current implementation is intentionally small. It establishes language
identity without requiring the full future relationship or historical model.

### Foundation outcome

The initial Foundation requirement has been met.

Workbench now has a language-level identity model that can grow independently
of operational plugin configuration.

The profile's stable identifier allows Workbench data to refer to a language
without requiring the language's human-readable name to function as its
identity.

The architecture also leaves room for richer relationships among languages,
historical stages, dialects, and varieties without requiring those
relationships to be implemented as part of the initial Foundation.

### Remaining development

The current Language Profile does not yet provide the richer relationship
model described elsewhere in this audit.

Future development may add support for:

- language families;
- parent or ancestral languages;
- historical stages;
- dialect and variety relationships;
- typed relationships among languages;
- richer modality documentation;
- inheritance or shared documentation where appropriate.

These are extensions of the established Language Profile foundation rather
than prerequisites for basic language identity.

### Open questions

- Which additional descriptive properties belong directly in the Language
  Profile?
- How should dialects and historical stages relate to a broader or ancestral
  profile?
- Which relationships should receive typed structured representation?
- When should a variety receive its own Language Profile rather than being
  documented within another profile?
- How should future relationship and inheritance mechanisms remain readable
  in ordinary Markdown?

---

## 2. Lexicon and Lexical Senses

**Status:** Partial  
**Priority:** Foundation

### What needs to be representable

At minimum, lexical documentation may require:

- headword or lemma
- one or more senses
- concise gloss
- lexical category where applicable
- pronunciation or realization
- usage notes
- examples
- related forms
- derivational relationships
- etymology
- semantic domains
- register or usage restrictions
- irregular forms

Not every entry requires every field.

### Current support

Conlang Workbench provides a functional lexicon built upon Markdown dictionary
entries.

Dictionary entries can currently represent useful lexical information
including:

- conlang headword or lemma;
- concise definition or gloss;
- part of speech;
- IPA;
- etymology;
- notes;
- language;
- aliases;
- declared forms;
- inflection behavior;
- source-file identity.

Workbench accepts both its inherited `word` / `definition` conventions and
compatible `lemma` / `gloss` metadata, allowing existing language
documentation to participate without requiring unnecessary migration.

The dictionary supports:

- conlang-to-documentation-language lookup;
- English-direction lookup;
- phrase entries;
- multiple entries sharing a lookup meaning;
- inflected-form recognition;
- multiple active languages;
- language-specific dictionary loading.

### Structured lexical senses

Conlang Workbench now supports structured lexical senses documented within
dictionary-entry bodies.

A lexical sense may currently provide information such as:

- a stable or explicit sense identifier;
- a concise gloss;
- a fuller definition;
- additional lookup terms.

Structured sense information is indexed for English-direction lookup.

Workbench can therefore return not only the lexical entry that matched a
lookup term, but also the particular structured sense responsible for that
match.

This establishes a basic distinction between:

    lexical entry
        ↓
    one or more lexical senses
        ↓
    sense-aware lookup

rather than requiring every meaning associated with a lexeme to be collapsed
into one flat definition string.

Simple dictionary entries remain valid. A creator does not need to define
structured senses merely to add or use a word.

### Foundation outcome

The initial Foundation requirement for lexical senses has been met.

Workbench now has an operative model in which:

- simple lexical entries remain usable;
- richer structured senses can coexist with them;
- individual senses can contribute their own lookup terms;
- lookup can preserve which sense produced a match.

This provides a foundation for later sense-specific examples, semantic
relationships, register, domains, historical development, and other richer
lexical documentation without requiring those systems to be implemented now.

### Lookup Coverage and Quick Lexical Development

Translation assistance and gloss lookup should make the limits of lexical
coverage visible rather than implying that unresolved material has been
translated successfully.

Workbench should eventually be able to report useful coverage information such
as:

- how many relevant source tokens were resolved through documented lexical
  entries;
- how many remain unresolved;
- which tokens were resolved only through fallback or generated proposals;
- which tokens have several possible lexical or sense matches.

A coverage percentage may provide a useful compact summary when its basis is
clear.

For example:

    Lexical coverage: 8 of 11 source tokens resolved
    Coverage: 73%

Coverage should describe what the Workbench actually knows from the documented
language. It should not count cypher output, generated guesses, or other
fallback material as equivalent to accepted lexical matches unless the
interface clearly distinguishes those categories.

Unresolved lookup items should provide a convenient path into lexical
development.

From an unresolved word or concept, the user should eventually be able to begin
creating a lexical entry without leaving the lookup or translation workflow.

That quick-add workflow may allow the user to:

- enter a form manually;
- choose among generated proposed forms when generation is enabled;
- derive a form from documented morphemes;
- mark a proposed borrowing or loanword source;
- select or document lexical category;
- create a simple definition;
- create or attach a structured lexical sense;
- review the proposed entry before accepting it.

Generated suggestions remain proposals.

Quick-add should therefore shorten the route from:

    unresolved concept
            ↓
    lexical development
            ↓
    accepted lexical entry
            ↓
    lookup reruns with new documented data

without creating a second simplified lexicon model that bypasses the canonical
dictionary-entry structure.

### Remaining development

The current lexical-sense model is deliberately small.

Important future capabilities may include:

- sense-specific examples;
- register and usage restrictions;
- semantic domains;
- semantic relationships among senses;
- richer sense notes;
- historical relationships among senses;
- provenance and borrowing information;
- improved lexical-coverage reporting;
- quick creation of lexical entries from unresolved lookup items.

Dictionary loading also needs better diagnostics for entries that cannot be
loaded because of malformed metadata, language mismatch, or other structural
problems.

These are extensions of the existing lexical foundation rather than reasons to
replace the current model.

### Open questions

- How much additional structure should an individual lexical sense acquire
  before prose or linked documents become preferable?
- How should stable sense identities behave when senses are reordered,
  divided, combined, or substantially revised?
- How should semantic relationships connect individual senses, whole lexemes,
  or both?
- How should semantic domains be represented without imposing a universal
  ontology?
- How should provenance distinguish dictionary ownership from donor language
  or historical source?
- How should quick lexical creation reuse the canonical dictionary-entry model
  without creating a second simplified representation?

---

## 3. Morphology

**Status:** Partial  
**Priority:** Foundation

### What needs to be representable

Languages may use morphological processes including:

- affixation
- clitics
- compounding
- reduplication
- stem alternation
- ablaut
- suppletion
- templatic or root-and-pattern morphology
- zero marking
- irregular paradigms
- combinations of multiple processes

A language may also make little or no use of inflectional morphology.

### Current support

The inherited inflection engine provides configurable prefix and suffix rules.

It supports:

- reverse recognition of derived inflected forms
- forward generation
- part-of-speech filtering
- manually declared forms
- irregular forms overriding generated forms of the same category

This is already useful for languages whose morphology fits that model.

### Gap

The current rule system is intentionally limited to relatively simple
affixational morphology.

It does not provide a general model for:

- infixes
- circumfixes
- reduplication
- nonconcatenative morphology
- complex stem alternations
- multi-stage morphophonological processes
- full paradigms
- context-conditioned allomorphy

### Current Foundation

Conlang Workbench now has two complementary pieces of operative morphology
support:

1. the inherited inflection engine; and
2. the Morpheme Inventory.

The inflection engine remains useful for relatively simple productive
prefix and suffix rules. It supports:

- reverse recognition of derived inflected forms;
- forward generation;
- part-of-speech filtering;
- manually declared forms;
- irregular forms overriding generated forms of the same category.

The Morpheme Inventory provides a separate documentation model for reusable
morphological material.

Morpheme notes can currently represent information including:

- form;
- meaning or grammatical function;
- morpheme type;
- language;
- distribution;
- notes;
- source-note identity.

The inventory can be browsed, searched, and filtered by morpheme type and
distribution.

Morphemes remain distinct from lexical entries. A documented morpheme does
not automatically become an independently usable dictionary word.

This separation is important because the inventory documents linguistic
material, while the inflection engine performs one particular kind of
machine-applicable morphological operation.

### Foundation outcome

The initial Foundation requirement for morphology has been met.

Workbench no longer relies upon the inherited prefix/suffix inflection engine
as its only representation of morphology.

The architecture now distinguishes between:

- documented morphemes and their linguistic functions;
- lexical entries;
- simple productive inflection rules;
- future morphological processes and analyses.

The current implementation deliberately does not claim that every documented
morpheme is productive or machine-generatable.

Likewise, the existence of a reusable form in the Morpheme Inventory does not
by itself establish how that form participates in word formation.

This preserves the audit's governing principle that documentation may precede
automation.

### Broader morphology model

Future morphology development should continue to distinguish among:

- **morpheme or function** — the linguistic meaning or grammatical function
  being represented;
- **realization** — how that morpheme or function appears in a particular form;
- **process** — how the resulting form is produced or related to other forms.

Concatenation should therefore remain one possible morphological process
rather than becoming the definition of morphology itself.

This leaves room for:

- infixation;
- circumfixation;
- reduplication;
- stem alternation;
- ablaut;
- templatic or root-and-pattern morphology;
- suppletion;
- zero realization;
- context-conditioned allomorphy;
- combinations of several morphological processes.

The same architecture should eventually support both directions of work:

    morphemes / functions
            ↓
       Word Builder
            ↓
    possible or accepted form

and:

    attested or existing form
            ↓
       Word Analyzer
            ↓
    possible morphological analysis

Generated or automatically inferred analyses remain proposals until
established by the user or supported by documentary evidence.

### Morpheme Inventory

The current Morpheme Inventory establishes the first operative version of
explicit morpheme documentation.

Its purpose is to make reusable morphological material discoverable without
requiring that material to exist only inside lexical entries or generation
rules.

The inventory should remain broad enough to grow toward language-defined units
such as:

- roots;
- stems;
- prefixes;
- suffixes;
- infixes;
- circumfixes;
- clitics;
- bound morphemes;
- zero realizations where analytically appropriate;
- other language-defined morpheme or realization types.

These categories should not become a universal closed taxonomy.

Future morpheme documentation may need additional information such as:

- stable identity;
- alternate realizations or allomorphs;
- relationships to lexical entries;
- relationships to other morphemes;
- examples;
- provenance or evidence;
- historical information;
- productivity or other behavioral status.

The canonical morpheme should remain distinct from any particular surface
realization when the language requires that distinction.

For example, several allomorphs may realize the same morpheme, while one
surface sequence may potentially admit more than one morphological analysis.

Simple languages should not be forced to populate every possible field. A
morpheme with a form and meaning should remain useful even when no richer
analysis has been documented.

### Productivity and evidence

The existence of a documented morpheme does not necessarily establish that it
is synchronically productive.

Workbench should eventually be able to distinguish cases such as:

- a documented morpheme whose behavior is established;
- a potentially productive pattern;
- a candidate analysis;
- a historical or fossilized element;
- a form whose morphological status remains unresolved.

Evidence and analytical status should remain distinguishable from the
morpheme's identity and meaning.

This is particularly important when existing language documentation contains
a recurring form but has not yet established whether speakers productively
apply it as a morphological rule.

Workbench should surface such uncertainty rather than silently resolving it.

### Word Builder and Word Analyzer

Conlang Workbench should eventually provide an interactive Word Builder for
constructing proposed forms from documented morphemes, realizations, and
language-defined processes.

The Builder should be able to present:

- selected morphemes or functions;
- their meanings or grammatical roles;
- the realizations being used;
- the processes applied;
- the resulting proposed form;
- relevant phonological or morphological constraints;
- warnings or notices produced by language-defined validation;
- explanations of why those findings were triggered.

The Builder should remain advisory. A form that conflicts with an ordinary
rule may still be accepted when the creator deliberately establishes an
exception or when documentary evidence attests the form.

The same underlying information should support a Word Analyzer working in the
opposite direction.

The Analyzer should be able to propose possible:

- morpheme boundaries;
- morpheme identities;
- realizations or allomorphs;
- morphological processes;
- lexical or grammatical functions;
- relationships to known lexical entries;
- irregular or exceptional behavior;
- possible loanword or historical relationships when relevant.

Automatic analysis should not be reduced to substring matching.

A surface sequence that happens to contain the spelling of a known morpheme is
not sufficient evidence that the morpheme actually occurs there.

Analysis should instead use the language's documented morphology,
realizations, phonology, phonotactics, and other relevant constraints where
those are available.

When several analyses remain plausible, Workbench should preserve and display
that ambiguity rather than silently selecting one.

Generated analyses remain proposals until accepted by the creator or supported
by documentary evidence.

### Remaining development

The morphology implementation remains Partial because the operative Foundation
does not yet provide a general morphological analysis or generation system.

Important future work includes:

- richer morpheme relationships;
- alternate realizations and allomorphy;
- explicit evidence and productivity status;
- relationships between morphemes and lexical entries;
- morphology-aware linguistic examples;
- nonconcatenative morphological processes;
- Word Builder;
- Word Analyzer;
- interaction with phonology and morphophonology.

These should extend the current Morpheme Inventory rather than forcing all
morphology into the inherited inflection-rule model.

### Open questions

- What is the minimum useful representation of a morpheme's realizations or
  allomorphs?
- How should productivity, analytical confidence, and evidence be represented
  without conflating them?
- How should relationships between morphemes and lexical entries be stored?
- Should morphology eventually use a general rule engine, paradigm model,
  multiple specialized models, or some combination?
- How should morphophonology interact with form generation?
- How should productive rules coexist with explicitly documented forms?
- How should the Workbench represent morphology that is well documented but
  intentionally not machine-generatable?
- How should the Word Analyzer distinguish genuine morphological evidence from
  accidental similarity?

---

## 4. Linguistic Examples and Interlinear Glossing

**Status:** Supported (linguistic examples) / Planned (interlinear glossing)
**Priority:** Foundation (examples) / Early (interlinear glossing)

### What needs to be representable

A linguistic example may contain:

- original language text;
- pronunciation or realization;
- morphological segmentation;
- morpheme or literal gloss;
- natural translation;
- language or variety;
- source;
- context;
- notes.

Not every example requires every tier.

The representation must preserve the distinction between:

- morphological or literal gloss; and
- natural translation.

That distinction is essential for languages whose conceptual organization
differs significantly from the documentation language.

### Current support

Conlang Workbench now provides a basic operative linguistic-example model.

Standalone Markdown notes explicitly identified as linguistic examples can
represent:

- original language text;
- pronunciation or realization;
- morphological segmentation;
- morpheme or literal gloss;
- natural translation;
- language;
- source;
- context;
- notes.

Not every tier is required. Missing analytical tiers remain absent rather
than being inferred or generated by the Workbench.

The Examples browser provides:

- browsing of documented examples;
- search across visible and analytical fields;
- compact example cards;
- expandable analytical tiers;
- navigation back to the canonical source note.

Search includes analytical information that may not currently be visible on
the collapsed card, allowing examples to be found through information such as
their gloss or context.

### Internal representation

The internal model describes the linguistic roles of the information rather
than the positional syntax or directives of any external glossing format.

Conceptually:

```text
LinguisticExample
 ├─ text
 ├─ realization?
 ├─ segmentation?
 ├─ gloss?
 ├─ translation?
 ├─ language?
 ├─ source?
 ├─ context?
 └─ notes?
```

This internal representation is canonical for Workbench-owned linguistic
example data.

External formats should later translate to or from this representation rather
than determining its structure.

### Foundation outcome

The initial Foundation requirement for linguistic examples has been met.

Workbench now has an internal example representation independent of external
serialization formats.

This provides the canonical structure upon which later:

- interlinear glossing;
- embedded examples;
- connected texts;
- evidence links;
- relationships among examples;
- external-format adapters

can build.

Standalone linguistic-example notes are currently supported.

Embedded examples inside lexical entries or prose documents remain a separate
future problem. They should eventually be exposed through adapters or parsers
appropriate to those source structures rather than requiring every example to
be rewritten as a standalone note.

### Missing analytical tiers

Workbench does not infer missing analytical tiers merely to make an example
look complete.

For example, a documented example containing only:

```text
original text
natural translation
```

remains a valid example.

Workbench should not manufacture:

```text
segmentation
morphological gloss
pronunciation
```

unless those analyses are explicitly documented or deliberately generated as
proposals through a future analytical workflow.

This preserves the distinction between documented linguistic evidence and
machine-generated interpretation.

### Interlinear glossing

Full interlinear-glossing support remains planned.

The Leipzig Glossing Rules provide useful conventions and terminology for
interlinear presentation, but Workbench should not assume that every language
or every example can or should be forced into a single fixed tier structure.

Future interlinear support should therefore build upon the internal
linguistic-example model rather than replacing it.

The Workbench should eventually be able to distinguish among:

- original text;
- realization or transcription;
- segmentation;
- morpheme-by-morpheme or literal gloss;
- grammatical annotation;
- natural translation;
- additional analytical or documentary information.

The precise visible arrangement may depend upon which tiers actually exist for
the example.

### External glossing formats

No external glossing format is currently required for the linguistic-example
Foundation to be operative.

Ling Gloss remains the leading candidate for a future dedicated glossing
integration, but no Ling Gloss import, export, or round-trip capability is
currently claimed.

Any future adapter should translate between Workbench's canonical example model
and the external format.

The external format should not become Workbench's internal data model merely
because Workbench can exchange information with it.

### Future example relationships

Examples may eventually participate in richer documentary relationships.

Potential relationships include:

- examples illustrating the same lexical item;
- examples illustrating the same morpheme;
- examples illustrating the same construction;
- examples belonging to the same source or connected text;
- explicitly related examples;
- variants or contrasting examples.

Workbench may also eventually identify examples that are **possibly related**
because they share documented lexical items, morphemes, glosses, or other
evidence.

Such automatically identified relationships should remain suggestions rather
than established linguistic facts.

The creator should be able to confirm, reject, or leave such relationships
unresolved.

Machine-suggested relationships and user-established relationships should
remain distinguishable.

### Remaining development

Important future work includes:

- full interlinear-glossing presentation;
- embedded-example recognition;
- links between examples and lexical senses;
- links between examples and morphemes;
- construction-level relationships;
- connected-text integration;
- explicit and suggested relationships among examples;
- human-facing example labels or numbering;
- optional example categories or types;
- external-format adapters.

These should extend the existing linguistic-example model rather than requiring
a replacement representation.

### Open questions

- What additional analytical tiers should Workbench support without assuming
  they apply universally?
- How should embedded examples be identified without requiring intrusive
  Markdown conventions?
- How should examples link to lexical senses, morphemes, constructions, or
  historical evidence?
- Should human-facing labels such as `12a` remain separate from stable internal
  example identity?
- How should related-example suggestions communicate the strength and basis of
  a proposed relationship?
- Which example relationships should be explicit metadata and which should be
  derived views?
- How should interlinear examples be rendered when only some analytical tiers
  are present?

---

## 5. Phonetics and Phonology

**Status:** Partial  
**Priority:** Early

### What needs to be representable

For a spoken language, documentation may need to distinguish among:

- phones
- phonemes
- allophones
- phonemic representations
- phonetic realizations
- consonant inventories
- vowel inventories
- distinctive features
- contrast
- minimal pairs
- complementary distribution
- conditioned realization
- free or variable realization
- dialect-specific realizations
- phonological alternations
- phonological processes
- suprasegmental contrasts
- interaction between phonology and morphology

The model must not assume that a phonemic analysis is always uniquely
determined.

A creator may know that particular sounds occur in particular environments
without having settled on the preferred phonemic analysis.

For languages whose primary modality is not spoken, Conlang Workbench must
permit an analogous description of the language's contrastive and realized
units without forcing spoken-language terminology onto them.

### Reference findings

*The Language Construction Kit* distinguishes phones from phonemes and
allophones and emphasizes that phonemes are analytical groupings rather than
simply sounds or letters.

It also distinguishes allophonic variation within a variety from differences
between dialects or varieties.

The MIT ConLangs materials require creators to identify the basic units of
their language, using IPA for spoken languages, while explicitly allowing
languages that do not use sound to document an equivalent set of units.

Professional phonological description also needs to account not merely for
inventories but for:

- sound distribution
- contrast
- alternation
- realization
- interactions among phonological processes

### Current support

Conlang Workbench now has a canonical language-level phonological-unit model
independent of individual dictionary entries.

A phonological unit currently supports:

- a required stable unit ID
- a visible symbol
- an optional creator-defined category
- analytical status
- language and language-profile association
- notes
- source-note navigation

Analytical status currently distinguishes:

- `established`
- `proposed`
- `unresolved`

This allows a creator to document contrastive units without requiring every
part of the phonological analysis to be treated as settled.

The representation is deliberately modality-aware. The core unit model does
not require a unit to be a spoken-language phoneme, although common spoken
categories such as consonant and vowel are supported by the current browser.

Canonical phonological-unit notes are loaded recursively from an optional
per-language phonology folder. Notes must explicitly identify themselves as
`phonological-unit` documents before they enter the inventory.

The loader maintains a stable-ID index and can associate units with the
configured language and language profile. Frontmatter readers tolerate
reasonable naming variants while Workbench's canonical metadata convention
remains snake_case.

The Phonology Inventory browser currently provides:

- inventory browsing
- text search
- category filtering
- analytical-status filtering
- result counts
- empty-result states
- multi-language identification when multiple languages are active
- navigation back to the canonical source note

Common categories such as consonant and vowel are conveniences rather than a
closed taxonomy. Creator-defined and modality-specific categories remain
valid.

Individual dictionary entries continue to support optional lexical `ipa`
metadata. This remains useful lexical information, but it is distinct from the
new language-level phonological inventory.

The first phonology foundation has been runtime verified with a standalone
phonological-unit note, including inventory loading, stable-ID lookup,
browser display, filtering, searching, and source-note navigation.

### Gap

The current phonological inventory represents contrastive or otherwise
canonical units, but it does not yet model the relationship between those
units and their possible realizations.

Conlang Workbench does not yet represent:

- phones or realizations as entities distinct from canonical units
- allophones
- phonological environments
- conditioned realization
- free or variable realization
- dialect-specific realizations
- minimal-pair evidence
- distinctive-feature systems
- phonological alternations or processes
- interactions between phonology and morphology
- richer relationships among competing phonological analyses
- explicit links between lexical forms and canonical phonological units

The next useful layer should therefore build outward from the established
inventory rather than replacing it: canonical units should be able to acquire
phonetic or modality-equivalent realizations and the conditions under which
those realizations occur.

The Workbench should continue to distinguish observed realization,
contrastive unit, and analytical interpretation so that incomplete or
competing analyses can be documented without forcing premature certainty.

### Initial requirement

The first phonological implementation now provides the basic canonical
inventory layer.

The next operative layer should add documentation for:

- phonetic or modality-equivalent realizations
- relationships between realizations and canonical units
- conditioned realization where known
- unresolved or alternative realization analyses
- links between lexical entries and the documented phonological inventory

This should remain a documentation model rather than becoming a full automatic
phonological-analysis engine.

IPA should remain the normal notation for spoken-language phonetic
documentation, but it must not be mandatory for non-spoken modalities.

### Later capabilities

Possible later capabilities include:

- inventory tables generated from documented units
- segment or unit lookup
- automatic detection of undocumented segments in lexical entries
- minimal-pair discovery
- allophone and environment validation
- feature-based searching
- phonological-process documentation
- richer alternate-analysis support
- dialect-specific inventories and realizations
- phonetic audio references
- interaction with historical sound change
- interaction with morphology and morphophonology

These capabilities should build on the canonical inventory and realization
model rather than requiring a replacement representation.

### Open questions

- Should realizations be standalone notes, nested data on phonological-unit
  notes, or support both representations?
- How should phones or modality-equivalent realizations link to their associated
  canonical units?
- How should competing analyses be represented without duplicating language
  data?
- What is the appropriate equivalent structure for signed, tactile, visual, or
  other non-spoken languages?
- Should IPA transcription be stored on every lexeme when it can be derived
  reliably from orthographic and phonological rules?
- How should dialect-specific realization differ structurally from ordinary
  allophonic variation?
- At what point should phonological environments become reusable structured
  objects rather than descriptive text?

---

## 6. Phonotactics and Prosody

**Status:** Planned  
**Priority:** Early

### What needs to be representable

Languages may impose constraints on how their basic units combine.

For spoken languages this may include:

- syllable structure
- permissible onsets
- permissible codas
- consonant clusters
- vowel sequences
- diphthongs and triphthongs
- sonority restrictions
- positional restrictions
- word-initial restrictions
- word-final restrictions
- morpheme-boundary effects
- assimilation
- harmony
- epenthesis
- deletion
- stress
- lexical stress
- predictable stress
- tone
- pitch accent
- rhythm
- phonological weight
- intonation
- tone sandhi
- prosodic phrasing

Not all languages use all of these systems.

### Reference findings

*The Language Construction Kit* treats phonotactics as the constraints defining
what forms are possible in a language and recommends documenting syllable
patterns and more specific restrictions rather than merely listing the largest
cluster ever observed.

It also explicitly treats stress, tone, pitch accent, assimilation, and related
processes as parts of the sound system.

MIT's ConLangs assignment similarly asks creators to document:

- suprasegmental behavior such as stress or tone
- syllable structure
- restrictions on possible combinations

Broader MIT phonology materials distinguish segment inventories from sound
distribution, alternations, syllable structure, stress, tone, rhythm, and
phonological interactions.

### Current support

The inherited plugin does not currently contain a structured phonotactic or
prosodic model.

Individual lexemes may carry IPA, but the plugin does not know whether the
forms obey a language's phonotactic or prosodic rules.

Cypher sheets can perform ordered character substitutions and may resemble
simple sound transformations in some workflows, but they are currently
translation/generation tools rather than canonical descriptions of the
language's phonology.

They should therefore not be treated as the phonological model.

### Gap

Conlang Workbench cannot currently distinguish between:

- a valid native form
- a deliberate exception
- a borrowing that violates native phonotactics
- a malformed or accidentally inconsistent form

It also cannot derive or validate stress, tone, syllable structure, or other
prosodic behavior.

### Initial requirement

Phonotactic and prosodic documentation should initially be capable of
existing as human-readable language documentation without requiring a
machine-readable formal grammar.

The architecture should nevertheless leave room for structured validation
where the creator chooses to define sufficiently explicit rules.

The first implementation should therefore distinguish between:

- documented rule
- machine-checkable rule
- observed pattern
- intentional exception

### Later capabilities

Possible later capabilities include:

- syllabification
- permitted-shape checking
- consonant-cluster validation
- stress prediction
- tone or pitch-accent annotation
- phonological-environment checks
- loanword adaptation tools
- morphophonological rule application
- word-generation constraints
- warnings for undocumented patterns
- corpus-based discovery of apparent phonotactic patterns

### Open questions

- How expressive should machine-readable phonotactic rules be?
- Should the Workbench support simple templates such as `(C)V(C)` as an easy
  mode while allowing more precise constraints separately?
- How should exceptions and loanwords bypass validation?
- How should stress and tone rules interact with lexical exceptions?
- Should phonotactic validation operate on phonemic forms, phonetic forms,
  orthographic forms, or a configurable combination?
- Where is the boundary between phonotactics, phonological processes, and
  morphophonology in the Workbench's internal model?

---

## 7. Orthography and Writing Systems

**Status:** Planned  
**Priority:** Early

### What needs to be representable

A language may have:

- no writing system
- one writing system
- multiple contemporary writing systems
- historical writing systems
- a native script
- one or more romanizations
- transliteration systems
- transcription systems
- competing spelling standards
- informal and formal orthographies

Writing systems may include, among other possibilities:

- logographic systems
- syllabaries
- consonantal systems
- alphabets
- abugida-like systems
- featural systems
- mixed systems

Conlang Workbench must not assume that a written unit corresponds
one-to-one with a phoneme, sound, syllable, morpheme, or word.

### Structural distinctions

The Workbench should be capable of distinguishing concepts such as:

- language
- writing system
- orthography
- script
- glyph
- grapheme
- transliteration
- romanization
- transcription

These concepts may overlap in simple languages, but they are not universally
equivalent.

A romanization used by the creator for convenient typing should not
automatically be treated as the language's native writing system.

Likewise, IPA or another phonetic transcription should not automatically be
treated as an orthography.

### Reference findings

*The Language Construction Kit* treats writing systems as systems in their
own right rather than merely as visual copies of phonology.

It distinguishes basic written elements and discusses several broad writing
system types.

It also demonstrates that writing systems may:

- omit phonological contrasts
- omit stress, tone, or other prosodic information
- preserve older pronunciations
- reflect morphological structure
- distinguish otherwise identical spoken forms
- mark boundaries or structure not explicitly present in speech

A spelling system may therefore be phonemic, phonetic, morphophonemic,
historical, or otherwise structured.

Rosenfelder also distinguishes a native writing system from the
transliteration used to represent it for outside readers.

### Current support

The inherited plugin primarily treats dictionary headwords as Unicode text.

It can therefore store and display many scripts already supported by the
user's environment.

Individual dictionary entries may also contain IPA.

However, the plugin does not currently model:

- writing systems as entities
- multiple orthographies for one language
- native-script forms separately from romanized headwords
- grapheme inventories
- grapheme-to-language-unit relationships
- transliteration systems
- historical orthographies
- orthographic rules
- script direction
- contextual glyph behavior

### Gap

Conlang Workbench currently has no explicit distinction among:

- the lexical form used as a dictionary headword
- native written representation
- romanization
- transliteration
- phonemic representation
- phonetic transcription

For simple conlangs these may happen to be identical.

The data model must not require them to be identical.

### Initial requirement

The architecture should allow a language to declare zero, one, or multiple
writing or representation systems.

Lexical entries should eventually be capable of associating forms with the
system in which each form is written.

A language should be able to designate a preferred Workbench display or
input representation without declaring that representation linguistically
canonical.

The initial implementation does not need to render arbitrary custom scripts
or provide a font editor.

Ordinary Unicode text should remain the preferred storage mechanism where
possible.

Images or other external representations may be referenced when a writing
system cannot reasonably be represented as ordinary Unicode text.

### Later capabilities

Possible later capabilities include:

- grapheme inventories
- orthography tables
- native-script and romanized dictionary display
- multiple transliteration schemes
- automatic transliteration
- orthographic validation
- grapheme-to-phoneme or grapheme-to-unit mappings
- historical spelling systems
- script-direction metadata
- contextual or positional glyph forms
- custom-font integration
- handwriting or calligraphic references
- script-development documentation

### Open questions

- Should writing systems be standalone documents or structured sections of a
  Language Profile?
- How should individual lexical entries store several written
  representations without requiring nested frontmatter?
- How should Conlang Workbench distinguish romanization, transliteration,
  transcription, and native orthography in the UI?
- Should one representation be designated as the Workbench's preferred
  typing form?
- How should non-Unicode scripts be referenced without making binary assets
  canonical language data?
- How much automatic transliteration belongs in the first implementation?
- How should historical spellings and orthographic reforms relate to
  historical language stages?

---

## 8. Morphophonology

**Status:** Planned  
**Priority:** Early

### What needs to be representable

Morphological structure and phonological structure may affect one another.

Languages may exhibit processes such as:

- phonologically conditioned allomorphy
- morphologically conditioned sound changes
- stem alternations
- vowel alternations
- consonant alternations
- mutation
- assimilation across morpheme boundaries
- dissimilation
- harmony
- epenthesis
- deletion
- lenition
- fortition
- palatalization
- stress shifts
- tone changes
- boundary-sensitive phonological processes
- suppletive or historically irregular alternations

The Workbench must not assume that every surface form can be produced by
simply concatenating an unchanged root and an unchanged affix.

### Structural distinction

Conlang Workbench should distinguish among:

- underlying or lexical form
- morpheme identity
- morphological operation
- phonological environment
- resulting surface form

These distinctions may be useful even when the creator does not adopt a
particular theoretical model of underlying representation.

A documented alternation should therefore be representable without forcing
the creator to claim a specific linguistic analysis.

### Reference findings

Conlanging and linguistic references show that morphology frequently
interacts with phonological structure.

Processes may be productive and predictable, restricted to particular
morphemes or grammatical categories, historically inherited, or irregular.

*The Language Construction Kit* provides examples in which derivational and
inflectional morphology alters the visible relationship between roots and
derived forms, including infixation and alternations obscured by historical
sound change.

This reinforces the need to treat the relationship between lemma and surface
form as potentially more complex than prefix or suffix concatenation.

### Current support

The inherited inflection engine supports a limited form of orthographic
respelling through its `pattern`, `strip`, and `add` mechanism.

This can handle simple cases in which recognizing or generating an affixed
form requires changing material at a word edge.

For example, a rule may reconstruct a lemma by removing one ending and
restoring another.

This is useful, but it is not a general morphophonological model.

### Gap

The current system cannot adequately represent interactions such as:

- alternations inside a stem
- context-dependent allomorph selection
- changes conditioned by neighboring segments
- harmony extending across morpheme boundaries
- stress or tone changes triggered by morphology
- ordered sequences of morphological and phonological operations
- alternations that are documented but not mechanically generatable

Treating all of these as increasingly complicated `strip` and `add` rules
would make the inherited inflection mechanism carry responsibilities it was
not designed for.

### Initial requirement

Preserve the existing `strip` / `add` behavior as a convenient mechanism for
simple inflection rules.

Do not make it the canonical representation of morphophonology.

The architecture should initially allow creators to document:

- the forms involved
- the morphological context
- the phonological or structural environment
- the resulting alternation
- known exceptions
- whether the process is productive, restricted, historical, or unresolved

Machine generation should remain optional.

A well-documented rule that Conlang Workbench cannot automatically apply is
still valid language documentation.

### Relationship to other systems

Morphophonology should be able to reference both:

- morphological categories, morphemes, paradigms, or operations
- phonological units, environments, and processes

It should not require either subsystem to duplicate the other's canonical
information.

Eventually, form generation may follow a pipeline resembling:

```text
lexical form
    ↓
morphological operation
    ↓
morphophonological alternation
    ↓
phonological realization
    ↓
orthographic representation
```

This is a conceptual model rather than a required universal derivational
theory.

Individual languages may organize these relationships differently.

### Later capabilities

Possible later capabilities include:

- environment-aware allomorph selection
- ordered alternation rules
- stem-change generation
- harmony propagation
- mutation systems
- stress-shift rules
- tone alternations
- automatic surface-form generation
- reverse analysis of surface forms
- exception handling
- paradigm generation incorporating morphophonological rules
- historical explanations linked to synchronic irregularities

### Open questions

- Should morphophonological rules be a specialized rule type or relationships
  among more general morphology and phonology documents?
- How should rule ordering be represented?
- How should the Workbench distinguish productive synchronic rules from
  historical explanations?
- How should competing analyses of the same alternation be represented?
- How should explicit stored forms interact with generated forms?
- At what point should the Workbench stop attempting automatic generation and
  preserve a descriptive rule for human interpretation?
- How should non-spoken modalities represent analogous interactions between
  morphological structure and realization?

---

## 9. Syntax

**Status:** Planned  
**Priority:** Early

### What needs to be representable

Languages may organize words, phrases, clauses, and larger constructions in
many different ways.

Syntactic documentation may need to describe:

- basic constituent order
- flexible or pragmatically conditioned word order
- noun phrase structure
- verb phrase structure
- adpositional structures
- modifiers
- possession
- argument structure
- grammatical relations
- alignment
- valency
- valency-changing constructions
- agreement
- case-related syntactic behavior
- negation
- questions
- imperatives
- coordination
- subordination
- relative clauses
- complement clauses
- serial or multi-verb constructions
- copular and nonverbal predicates
- existential constructions
- comparison
- topicalization
- focus constructions
- ellipsis
- anaphora
- reference tracking
- syntactic restrictions and exceptions

No particular construction or grammatical relation should be assumed to exist
in every language.

### Structural distinction

Conlang Workbench should distinguish between:

- a grammatical construction
- the forms that participate in it
- the grammatical or semantic roles involved
- constraints on the construction
- examples demonstrating its use
- analytical interpretation of the construction

This allows a creator to document observed sentence patterns even when the
preferred theoretical analysis remains uncertain.

The Workbench must not assume that concepts such as `subject`, `object`,
`noun phrase`, or `verb phrase` are universally the most appropriate
descriptions.

### Reference findings

*The Language Construction Kit* treats syntax as considerably more than
choosing an SVO, SOV, or VSO word order.

Its discussion includes areas such as:

- phrase structure
- noun phrases
- case and grammatical relations
- agreement
- questions
- negation
- coordination
- subordination
- relative clauses
- complement structures

Rosenfelder also emphasizes that languages distribute grammatical work
differently. Information expressed syntactically in one language may be
expressed morphologically, lexically, pragmatically, or through context in
another.

The MIT ConLangs materials likewise treat syntax as a system of relationships
and constructions rather than merely a word-order setting.

This supports a construction-oriented descriptive model rather than a
universal sentence template.

### Current support

The inherited plugin does not contain a general syntactic model.

It can:

- look up dictionary entries
- recognize phrases stored as lexical entries
- recognize some inflected forms
- process text token by token

Phrase matching is lexical lookup functionality.

A stored multi-word expression should not automatically be interpreted as a
syntactic rule or construction.

Likewise, successful tokenization of a sentence does not mean that the
Workbench understands its syntax.

### Gap

Conlang Workbench currently cannot explicitly represent:

- clause structure
- constituent relationships
- grammatical roles
- syntactic constructions
- argument structure
- word-order constraints
- agreement relationships
- coordination or subordination
- construction-specific exceptions
- syntactic variation

It therefore cannot yet distinguish a grammatical sentence from a sequence
of individually recognized lexical items.

### Initial requirement

The first syntax implementation should focus on **documentation**, not on
building a universal parser.

Creators should be able to document named constructions with:

- a description
- the elements or roles involved
- ordering behavior where relevant
- constraints
- interactions with morphology or pragmatics
- exceptions
- links to examples

Common linguistic terminology may be offered where useful, but creators
should be able to define language-specific terminology and constructions.

A syntax rule does not need to be machine-parseable to be valid Workbench
documentation.

### Construction-oriented representation

A future structured construction might conceptually contain information such
as:

```text
construction
    ├── name
    ├── description
    ├── participants / roles
    ├── structural pattern
    ├── constraints
    ├── morphology
    ├── pragmatic conditions
    ├── exceptions
    └── examples
```

This is a conceptual organization, not a mandatory schema.

Simple constructions may remain prose.

More structured representation should be introduced only where it enables
useful Workbench behavior.

### Word order

Word order should not be represented as a single universal language property.

A language may have:

- strongly fixed order
- a dominant but variable order
- different orders in different clause types
- order conditioned by information structure
- order conditioned by grammatical categories
- relatively free order
- no useful single basic-order classification

A Language Profile may provide a broad typological summary such as `SOV` or
`SVO`, but that summary must not replace actual syntactic documentation.

### Grammatical relations and alignment

Conlang Workbench must not assume nominative-accusative alignment.

Documentation should leave room for systems such as:

- nominative-accusative
- ergative-absolutive
- split systems
- active-stative systems
- direct-inverse systems
- symmetrical voice systems
- systems better described using language-specific relations

These categories should be available as descriptive vocabulary rather than
mandatory classifications.

### Relationship to morphology

Syntax and morphology may divide grammatical work differently from language
to language.

The Workbench should therefore permit syntactic constructions to reference:

- inflectional categories
- case marking
- agreement
- clitics
- derivational or valency-changing morphology
- morphophonological behavior

without duplicating the canonical descriptions of those systems.

### Relationship to semantics and pragmatics

Syntactic form may depend upon:

- semantic roles
- animacy
- definiteness
- specificity
- information structure
- topic
- focus
- discourse status
- politeness
- register
- speaker intention

The architecture should permit these relationships without requiring every
syntactic distinction to be reducible to syntax alone.

### Later capabilities

Possible later capabilities include:

- construction indexes
- structural diagrams
- example discovery
- word-order validation
- argument-structure validation
- agreement checking
- construction-aware glossing
- sentence annotation
- corpus searches by construction
- grammar-document generation
- limited language-specific parsing
- generation from explicitly machine-readable constructions

A universal parser for arbitrary constructed languages is not an initial
goal.

### Open questions

- What is the minimum useful structured representation of a construction?
- Should constructions be standalone documents, grammar sections, or both?
- How should syntactic roles be represented without imposing one linguistic
  theory?
- How should the Workbench distinguish broad typological summaries from
  actual grammatical rules?
- How should examples link to the constructions they demonstrate?
- How much syntactic validation is useful before it becomes an attempt to
  build a complete parser?
- How should syntax interact with morphology, semantics, pragmatics, and
  discourse without duplicating their data?
- How should languages whose organization does not fit familiar
  phrase-structure terminology document their constructions?

---

## 10. Semantics

**Status:** Partial  
**Priority:** Early

### What needs to be representable

Semantic documentation may need to distinguish among:

- lexemes;
- individual lexical senses;
- semantic relationships;
- semantic domains;
- culturally important conceptual distinctions;
- literal meaning;
- contextual meaning;
- pragmatic interpretation;
- historical change in meaning.

These layers should not be collapsed merely because the documentation language
uses the same word for several of them.

### Current support

Conlang Workbench now provides a basic operative foundation for lexical
semantics through structured lexical senses.

A dictionary entry may contain multiple structured senses rather than requiring
all meanings of a lexeme to be collapsed into a single definition.

Individual senses can currently provide information such as:

- a stable or explicit sense identifier;
- a concise gloss;
- a fuller definition;
- additional lookup terms.

Structured sense information participates in English-direction lookup.

Workbench can therefore preserve not only which lexical entry matched a lookup
term, but also which documented sense produced that match.

Simple dictionary entries remain supported. A creator does not need to create
structured senses when a single definition adequately describes the lexical
entry.

This provides a useful semantic foundation while preserving a gradual path from
simple lexical documentation to richer analysis.

### Lexeme and sense distinction

Workbench should continue to distinguish the lexical entry from the meanings
associated with it.

Conceptually:

```text
lexeme
  ├─ sense A
  ├─ sense B
  └─ sense C
```

This distinction matters because different senses of the same form may have
different:

- glosses;
- definitions;
- lookup terms;
- examples;
- semantic relationships;
- registers;
- domains;
- histories;
- usage restrictions.

Only the first group of these properties is currently represented in the
structured sense model. The architecture should permit richer sense-specific
information to be added later without requiring the lexical model to be
replaced.

### Semantic relationships

Broader semantic relationships remain future work.

Workbench should eventually be able to document relationships such as:

- synonymy;
- antonymy;
- hypernymy;
- hyponymy;
- meronymy;
- holonymy;
- metaphorical extension;
- semantic derivation;
- culturally specific lexical relationships.

These relationships may connect:

- whole lexemes;
- individual senses;
- semantic domains;
- culturally defined concepts.

The system should not assume that every relationship belongs at the whole-word
level.

For example, two lexemes may overlap in one sense while differing substantially
in others.

Semantic relationships should therefore be capable of referring to the
appropriate semantic level when that distinction matters.

### Semantic domains

Workbench should eventually support creator-defined semantic domains.

Possible domains might include:

- kinship;
- water;
- ritual;
- movement;
- social hierarchy;
- color;
- emotion;
- navigation;
- agriculture;
- spiritual concepts.

These are examples rather than a universal taxonomy.

Languages may organize meaning according to conceptual divisions that do not
align cleanly with categories familiar from English or other documentation
languages.

Workbench should therefore allow creators to establish the domains that are
useful for their own languages rather than requiring every language to conform
to one predefined semantic ontology.

Broader cultural-domain organization is addressed separately in
**Semantic and Cultural Domains**.

### Literal meaning and natural translation

Workbench should preserve distinctions between literal or morphological meaning
and natural translation.

A form or expression may have a documented internal organization that differs
substantially from the most natural translation into the documentation
language.

For example:

```text
documented internal meaning
        ↓
language-specific conceptual organization
        ↓
natural translation
```

The natural translation should not overwrite or replace the internal semantic
analysis.

This distinction is already reflected in the linguistic-example model, where
`gloss` and `translation` are separate analytical roles.

Future semantic tooling should preserve the same principle.

### Cultural and relational meaning

Semantic structure should not assume that meanings are best described as
direct substitutions for documentation-language words.

A language may organize concepts relationally, spatially, culturally,
historically, or according to distinctions that do not have a concise
documentation-language equivalent.

Workbench should permit those meanings to be documented directly.

A concise gloss may remain useful for lookup and navigation, but it should not
be treated as the complete semantic definition when richer documentation
exists.

This is especially important for culturally significant lexical items whose
meaning depends upon relationships among people, places, actions, social roles,
environmental features, or other language-specific concepts.

### Translation assistance

Future translation assistance should use documented semantic information to
help determine whether a proposed expression actually fits the intended
meaning.

The goal should not merely be:

```text
documentation-language word
        ↓
nearest conlang word
```

A richer workflow may instead consider:

```text
intended meaning
        ↓
candidate lexical senses
        ↓
grammatical and conceptual fit
        ↓
language-specific expression
        ↓
back-translation or explanation
```

When several senses or expressions are plausible, Workbench should preserve
that ambiguity rather than silently selecting one.

Machine-generated semantic interpretations remain proposals unless established
by the creator or supported by documented evidence.

### Remaining development

The semantic implementation remains Partial.

Structured lexical senses establish an operative lexical-semantic foundation,
but broader semantic modeling remains future work.

Important future capabilities may include:

- richer sense-specific metadata;
- sense-specific examples;
- semantic relationships;
- creator-defined semantic domains;
- culturally specific conceptual relationships;
- register and usage restrictions;
- semantic change over time;
- links between senses and constructions;
- links between senses and linguistic examples;
- ambiguity-aware translation assistance;
- semantic comparison and diagnostics.

These should extend the existing lexical-sense model rather than replacing it.

### Open questions

- Which semantic relationships should receive explicit structured
  representation?
- How should relationships distinguish whole lexemes from individual senses?
- How should creator-defined semantic domains be represented without imposing
  a universal ontology?
- How much semantic information belongs directly in a lexical sense before a
  linked explanatory document becomes preferable?
- How should culturally specific concepts be made searchable without reducing
  them to documentation-language equivalents?
- How should semantic change over time relate to stable sense identity?
- How should Workbench distinguish a genuinely broad sense from several related
  but distinct senses?
- How should translation assistance expose semantic ambiguity without becoming
  cumbersome?

---

## 11. Pragmatics and Discourse

**Status:** Planned  
**Priority:** Later

### What needs to be representable

The meaning of an utterance may depend upon more than the lexical meanings
of its words and its grammatical structure.

Pragmatic and discourse documentation may need to describe:

- deixis
- reference
- anaphora
- presupposition
- implicature
- speech acts
- politeness
- honorific behavior
- information structure
- topic
- focus
- emphasis
- discourse status
- turn-taking
- discourse particles
- conversational conventions
- ellipsis
- omitted or recoverable information
- genre conventions
- narrative structure
- rhetorical structure
- shared cultural assumptions
- gesture or other accompanying signals
- multimodal communication
- contextual interpretation

Not every language grammatically marks these distinctions.

Some may instead be conveyed lexically, prosodically, gesturally, socially,
through discourse organization, or simply through context.

### Structural distinction

Conlang Workbench should distinguish among:

- what an expression conventionally means
- what its grammatical structure contributes
- what a speaker communicates in a particular context
- what participants infer from shared knowledge or convention

These distinctions need not always receive formal annotation.

The Workbench should nevertheless provide somewhere to document them when
they matter to understanding the language.

### Reference findings

*The Language Construction Kit* extends language construction beyond lexicon,
morphology, and syntax into pragmatics and usage.

Its treatment emphasizes that speakers do not communicate solely through
literal sentence meaning. Context, conversational expectations, social
relationships, and discourse conventions affect interpretation.

Pragmatic reference material identified through the LCK, including
Levinson's *Pragmatics*, further highlights areas such as:

- deixis
- presupposition
- implicature
- speech acts
- conversational structure

These areas reinforce the distinction between sentence meaning and
speaker meaning.

### Current support

The inherited plugin has no explicit pragmatic or discourse model.

Dictionary notes and ordinary Markdown can already record contextual
information informally.

The lookup system also preserves an important boundary by avoiding claims
that word lookup constitutes complete translation.

However, the Workbench currently cannot explicitly associate linguistic
forms or examples with discourse conditions, speaker intentions, social
context, or information structure.

### Gap

Conlang Workbench currently has no structured way to document that:

- an expression is appropriate only in a particular conversational context
- a form signals topic, focus, emphasis, politeness, or discourse status
- information may normally be omitted because it is recoverable from context
- a sentence's intended interpretation depends upon shared knowledge
- gesture, posture, gaze, prosody, or another channel contributes linguistic
  information
- particular genres or discourse situations follow language-specific
  conventions

Without such documentation, a grammatically complete description may still
fail to explain how speakers actually communicate.

### Initial requirement

Pragmatics and discourse should initially remain primarily descriptive.

Conlang Workbench should permit grammar documents, lexical senses,
constructions, examples, and texts to carry or link to information about
their pragmatic and discourse conditions.

The first implementation does not need a universal formal model of
conversation.

Creators should be able to document language-specific pragmatic behavior
without translating it into a predetermined inventory of categories.

### Context and omission

The Workbench must not assume that information absent from the spoken or
written sequence is linguistically absent.

Languages may permit information to be recovered from:

- prior discourse
- physical context
- shared cultural knowledge
- speaker identity
- addressee identity
- gesture
- gaze
- posture
- prosody
- conventional expectations
- other simultaneous communicative channels

This is especially important for multimodal languages.

The documentation model should permit a creator to explain how such
information is recovered without requiring it to be represented as an
unspoken word or morpheme.

### Information structure

Languages may organize utterances according to distinctions such as:

- topic and comment
- focus
- contrast
- given and new information
- emphasis
- discourse prominence

These distinctions may affect:

- word order
- morphology
- prosody
- particles
- omission
- gesture
- other communicative behavior

Conlang Workbench should therefore allow pragmatic and discourse information
to connect to syntax, morphology, prosody, and examples rather than treating
it as an isolated subsystem.

### Speech acts and social meaning

The same propositional content may be expressed differently depending upon
what the speaker is doing socially.

Documentation may need to distinguish uses such as:

- statement
- question
- request
- command
- invitation
- warning
- promise
- apology
- greeting
- blessing
- curse
- ritual declaration

These should be available as descriptive concepts rather than a mandatory
universal inventory.

Languages and cultures may define additional communicative acts important to
their speakers.

### Examples and texts

Examples are particularly important for pragmatic documentation.

A useful pragmatic example may need information beyond the utterance and its
translation, including:

- speaker
- addressee
- preceding discourse
- physical situation
- social relationship
- intended interpretation
- why an alternative form would be inappropriate

Connected texts are also important because many discourse phenomena cannot
be demonstrated adequately with isolated sentences.

### Relationship to semantics

Semantics and pragmatics should remain distinguishable without requiring a
rigid theoretical boundary.

A lexical or grammatical form may have conventional meaning while its
interpretation in a particular situation depends upon context.

Conlang Workbench should permit both kinds of information to be documented
and linked.

### Relationship to sociolinguistics

Pragmatic appropriateness may depend upon:

- social relationship
- status
- age
- familiarity
- profession
- ritual role
- community
- setting
- register

Detailed social variation is audited separately under Sociolinguistics and
Register.

The two areas should nevertheless be able to reference one another.

### Later capabilities

Possible later capabilities include:

- pragmatic tags on examples
- discourse-role annotation
- topic and focus annotation
- speaker/addressee metadata
- context-rich example views
- discourse-particle indexes
- speech-act indexes
- searches by communicative context
- conversation and dialogue annotation
- multimodal annotation
- links between utterances in connected discourse
- corpus searches for discourse patterns

These tools should support documentation and discovery rather than attempt
to infer speaker intention automatically.

### Open questions

- What pragmatic information belongs in structured metadata and what should
  remain prose?
- How should examples represent speaker, addressee, and conversational
  context without becoming cumbersome?
- How should multimodal information be attached to an utterance?
- How should gesture, gaze, posture, or other simultaneous signals be
  represented when they carry grammatical or pragmatic information?
- Should discourse particles receive ordinary lexical entries, specialized
  documentation, or both?
- How should topic and focus information connect to syntactic constructions
  and prosody?
- How should connected texts represent relationships among utterances?
- How much pragmatic annotation should completeness tools ever expect?

---

## 12. Sociolinguistics and Register

**Status:** Planned  
**Priority:** Later

### What needs to be representable

A language may vary according to the people using it, their relationship,
their community, and the circumstances in which communication occurs.

Documentation may need to describe variation associated with:

- dialect
- region
- community
- social group
- age
- generation
- profession
- occupation
- education
- social status
- familiarity
- formality
- ritual role
- religious context
- ceremonial context
- taboo
- secrecy
- genre
- medium
- historical period
- individual style
- contact with other languages

These categories are examples rather than a universal classification.

A constructed culture may organize socially meaningful variation according
to distinctions that do not correspond to familiar modern categories.

### Structural distinction

Conlang Workbench should distinguish among:

- language
- variety
- dialect
- register
- style
- context-conditioned usage
- speaker- or community-associated variation
- historical stage

These concepts may overlap, but they should not automatically be treated as
equivalent.

For example, a formal register used by all speakers is not necessarily a
dialect, while a regional dialect may contain several registers of its own.

### Reference findings

Sociolinguistic references identified through *The Language Construction
Kit*, including Hudson's *Sociolinguistics*, reinforce that language varies
according to social context as well as geography and historical descent.

*The Language Construction Kit* also treats register and dialect variation
as important parts of making and describing languages rather than as
incidental deviations from a single uniform standard.

Language use may vary according to such factors as:

- social relationship
- formality
- occupation
- community
- historical development
- contact with other languages

This supports treating variation as legitimate language data rather than
automatically labeling nonstandard forms as errors.

### Current support

The inherited plugin has only limited support for sociolinguistic
information.

Dictionary entries can contain:

- notes
- language identifiers
- aliases
- proper-noun categories

Ordinary Markdown can also document usage information informally.

However, there is no general model for associating a lexical form, sense,
grammatical construction, pronunciation, or example with a particular
register or social variety.

### Gap

Conlang Workbench currently cannot reliably distinguish among forms that are:

- standard
- formal
- informal
- archaic
- regional
- occupational
- ritual
- taboo
- socially restricted
- dialectal
- community-specific

Nor can it describe situations in which the same expression changes meaning,
appropriateness, pronunciation, or grammatical behavior according to social
context.

Without this distinction, legitimate variation could be mistaken for
inconsistency.

### Initial requirement

Sociolinguistic information should initially remain primarily descriptive
and optional.

Conlang Workbench should allow lexical senses, pronunciations, grammatical
constructions, examples, and texts to be associated with language-specific
usage or variety information where needed.

The Workbench should not impose a universal register scale such as:

```text
formal
neutral
informal
```

Such values may be convenient defaults or examples, but a language must be
able to define its own socially meaningful distinctions.

### Registers

A register is a pattern of language use associated with a particular context
or communicative situation.

Possible registers might include:

- ceremonial
- legal
- scholarly
- intimate
- courtly
- military
- mercantile
- religious
- poetic
- occupational
- children's speech

These examples must not become a fixed controlled vocabulary.

A constructed culture may possess registers for social situations that have
no convenient equivalent in the documentation language.

### Dialects and varieties

A language may possess multiple varieties whose differences involve:

- pronunciation
- phoneme inventories
- vocabulary
- morphology
- syntax
- semantics
- pragmatics
- orthography

The Workbench should not assume that dialect variation consists merely of
alternate word spellings.

A variety should eventually be able to inherit substantial documentation
from a broader language while recording where it differs.

The precise inheritance model remains an open architectural question.

### Standard and nonstandard language

Conlang Workbench should not assume that one variety is inherently the
correct form of a language.

A creator may document:

- a standardized variety
- prestige varieties
- stigmatized varieties
- regional standards
- competing standards
- no standard variety at all

If a standard exists, its status should be documented as a social fact rather
than built into the Workbench's definition of correctness.

### Historical and social variation

Some forms may be associated with both a historical period and a social
context.

For example, a form might be:

- archaic but retained ceremonially
- obsolete in ordinary speech but preserved in law
- associated with an older generation
- revived intentionally
- borrowed by one community but rejected by another

The architecture should therefore allow sociolinguistic and historical
information to coexist rather than forcing each form into only one category.

### Language contact

Social variation may arise through contact among languages or communities.

Documentation may need to describe:

- borrowing
- code-switching
- mixed registers
- contact varieties
- prestige influence
- substrate or superstrate influence
- community-specific loanwords
- adaptation of foreign forms

Detailed historical relationships are audited separately, but social context
may be necessary to explain why contact-induced forms exist.

### Relationship to pragmatics

Register and social variation often determine whether an utterance is
appropriate in a particular situation.

Sociolinguistic documentation should therefore be able to connect with:

- speaker and addressee information
- politeness
- speech acts
- discourse conventions
- contextual restrictions
- examples and texts

The canonical description of those pragmatic phenomena should not need to be
duplicated.

### Examples and texts

Examples documenting sociolinguistic variation may need contextual
information such as:

- speaker variety
- addressee
- register
- social relationship
- setting
- historical period
- community
- why the form was selected

Connected texts may also be associated with a particular variety or register.

This permits a corpus to preserve genuine variation instead of normalizing
all examples to a single preferred form.

### Later capabilities

Possible later capabilities include:

- language-defined register systems
- variety-aware dictionary lookup
- dialect-specific lexical forms
- pronunciation variants
- register-specific senses
- variety-specific grammatical rules
- usage labels
- sociolinguistic filtering
- comparison among varieties
- register-aware example searches
- historical/register cross-filtering
- inheritance between language and variety profiles
- warnings when a form is inappropriate for a selected context

These tools should expose documented usage rather than determine social
appropriateness independently.

### Open questions

- What distinction should the data model make between a dialect, variety,
  register, and historical stage?
- Should dialects and major varieties receive their own Language Profiles?
- How should a variety inherit documentation from a parent language?
- How should individual lexical entries store variety-specific forms without
  excessive duplication?
- Should register labels be defined in the Language Profile?
- How should forms belonging to several social or historical contexts be
  represented?
- How should code-switching and mixed-language examples identify the language
  associated with individual portions of an utterance?
- How should validation distinguish an actual inconsistency from legitimate
  sociolinguistic variation?

---

## 13. Semantic and Cultural Domains

**Status:** Planned  
**Priority:** Later

### What needs to be representable

Languages may organize culturally important areas of meaning in ways that do
not correspond neatly to categories in the documentation language.

Domains may include:

- kinship
- social relationships
- names and naming
- age and life stages
- social status
- occupations
- law
- religion
- ritual
- taboo
- time
- calendars
- seasons
- numbers and counting
- measurement
- space
- direction
- geography
- color
- shape
- body and anatomy
- emotion
- plants
- animals
- ecology
- weather
- food
- clothing
- tools
- weapons
- materials
- technology
- trade
- art
- music
- storytelling
- supernatural concepts
- culturally specific categories

This list is illustrative rather than exhaustive.

The Workbench must permit creators to define domains important to their own
languages and cultures.

### Structural distinction

Conlang Workbench should distinguish between:

- semantic organization
- cultural explanation
- dictionary organization
- lexical relationships
- grammatical categorization

These may overlap, but they are not the same thing.

A semantic domain may contain lexemes that are not morphologically related.

Likewise, a group of morphologically related words does not necessarily form
a culturally meaningful semantic domain.

### Reference findings

Conlanging references emphasize that vocabulary should not simply reproduce
the conceptual divisions of the creator's documentation language.

Languages may:

- make distinctions another language leaves unlexicalized
- use one lexical category where another language uses several
- organize kinship according to culturally significant relationships
- divide color, space, time, motion, or social relationships differently
- possess extensive vocabulary for culturally important activities or
  environments
- lack lexical distinctions that appear obvious from the perspective of
  another culture

Historical and cultural context also affects what vocabulary is likely to
exist.

When reconstructing or designing ancestral languages, vocabulary should
reflect the technology, environment, institutions, and conceptual world
available to their speakers rather than automatically inheriting categories
from later cultures.

### Current support

The inherited dictionary can associate words with:

- definitions
- notes
- etymological information
- parts of speech
- source documents

Ordinary Markdown can also organize vocabulary manually.

However, the plugin does not currently provide a general model for
language-defined semantic or cultural domains.

English-direction lookup provides a useful way to find lexical entries, but
English lookup categories should not become the language's semantic
classification system.

### Gap

Conlang Workbench currently cannot explicitly represent that:

- several lexemes belong to a culturally important conceptual domain
- a language divides a domain differently from the documentation language
- a lexical distinction depends upon a culture-specific classification
- a concept requires substantial cultural explanation
- a domain has its own internal relationships
- vocabulary expectations differ by historical stage or culture

Without this distinction, dictionary organization may slowly inherit the
categories of the documentation language merely because those categories are
convenient for lookup.

### Initial requirement

Semantic and cultural domains should initially remain creator-defined.

Conlang Workbench should permit lexical entries, senses, grammar documents,
examples, and cultural documentation to be associated with one or more
domains where useful.

The Workbench should not require a universal semantic-domain taxonomy.

A language may use:

- broad domains
- narrow domains
- hierarchical domains
- overlapping domains
- culturally named domains
- no formal domain system at all

A domain may be useful to humans even when the Workbench does not understand
its internal conceptual structure.

### Domain identity

A domain should eventually be more than an arbitrary display label when a
creator chooses to document it formally.

A documented domain might conceptually include:

```text
domain
    ├── name
    ├── description
    ├── parent / broader domain
    ├── related domains
    ├── cultural notes
    ├── lexical entries
    ├── examples
    └── references
```

This is a conceptual organization rather than a required schema.

Simple domain tags should remain possible.

### Kinship

Kinship is a useful example of why language-defined domains matter.

A language may distinguish relatives according to factors such as:

- generation
- lineage
- maternal or paternal relationship
- age relative to another person
- sex or gender
- marriage
- adoption
- household
- clan
- ritual relationship
- social rather than biological kinship

Another language may ignore many of these distinctions.

Conlang Workbench should therefore permit a creator to document the kinship
system itself rather than merely assign English family terms as definitions.

The same principle applies to every culturally structured domain.

### Time and calendars

Time may be organized according to language- and culture-specific systems.

Documentation may need to connect lexical material to:

- calendars
- seasons
- ritual cycles
- agricultural cycles
- astronomical observations
- historical eras
- relative-time systems

The Workbench should not assume the Gregorian calendar or familiar Western
time divisions are linguistically canonical.

### Space and direction

Languages may organize spatial relationships through systems involving:

- relative directions
- cardinal directions
- landscape-based directions
- vertical relationships
- riverine or coastal orientation
- speaker-relative orientation
- culturally important landmarks

Spatial terminology may interact with grammar and deixis.

Domain documentation should therefore be capable of linking to grammatical
and pragmatic documentation where necessary.

### Color and other perceptual domains

Perceptual categories should not be assumed to divide experience according
to English lexical boundaries.

A language may organize:

- color
- shape
- texture
- sound
- taste
- smell
- motion
- material qualities

according to distinctions important to its speakers.

The Workbench should preserve the language's own categories even when their
nearest documentation-language glosses are approximate.

### Cultural explanation

Some expressions cannot be adequately documented with a short definition.

A lexical sense may therefore need to link to cultural documentation
explaining:

- institutions
- practices
- beliefs
- artifacts
- social relationships
- environmental knowledge
- historical context

The dictionary should remain useful for quick lookup without forcing the
entire cultural explanation into the lookup gloss.

### Historical development

Semantic and cultural domains may change over time.

A language may gain or lose terminology as:

- technology changes
- institutions change
- religions change
- speakers encounter new environments
- languages come into contact
- social categories change
- older concepts become obsolete or ceremonial

Historical language stages should therefore be able to possess different
domain inventories and lexical distributions.

### Completeness and lexical gaps

Domains may eventually help creators discover areas of their language that
need further development.

However, absence of a lexical item is not automatically an error.

A missing word may represent:

- a genuine lexical gap
- a concept expressed compositionally
- a culturally irrelevant distinction
- an intentionally undeveloped area
- incomplete documentation

Completeness tools should therefore ask questions rather than silently
invent vocabulary or declare a language deficient.

### Later capabilities

Possible later capabilities include:

- domain indexes
- hierarchical domain browsing
- overlapping domain membership
- culture-specific domain templates
- lexical-field visualization
- domain-aware dictionary searches
- semantic maps
- kinship diagrams
- color-system documentation
- calendar and counting-system references
- vocabulary-development prompts
- historical comparison of domains
- detection of sparsely documented domains

These tools should expose patterns and gaps rather than prescribe what
vocabulary a language ought to possess.

### Open questions

- Should formal semantic domains be standalone documents?
- How should simple semantic tags coexist with richer domain documents?
- Should domains be hierarchical, networked, or permit both?
- How should a lexical sense belong to several overlapping domains?
- How should cultural documentation link to linguistic documentation without
  turning Conlang Workbench into a general worldbuilding database?
- Where should the boundary lie between a semantic domain and an ordinary
  cultural concept?
- How should domain membership change across historical stages or varieties?
- How should completeness tools distinguish a lexical gap from missing
  documentation?

---

## 14. Connected Texts and Corpora

**Status:** Planned  
**Priority:** Later

### What needs to be representable

Language documentation may include connected material such as:

- conversations
- narratives
- descriptions
- letters
- speeches
- ritual texts
- songs
- poetry
- inscriptions
- legal texts
- instructional texts
- oral histories
- myths
- jokes
- proverbs
- historical documents
- translated texts
- elicited material
- spontaneous language samples

A text may range from several connected utterances to a substantial document.

A corpus may consist of many texts gathered for analysis, documentation, or
publication.

### Structural distinction

Conlang Workbench should distinguish among:

- isolated linguistic example
- connected text
- corpus or collection
- translation
- annotation
- source or provenance

An example may be extracted from a text without becoming independent of its
source.

Likewise, a connected text should not need to be broken permanently into
isolated example notes merely so the Workbench can analyze it.

### Reference findings

Conlanging references recommend creating and translating connected texts as
a way to develop and test a language.

Connected language exposes questions that isolated vocabulary lists and
individual grammar examples may not reveal, including:

- reference across sentences
- information structure
- discourse particles
- topic continuity
- ellipsis
- anaphora
- register
- pragmatic conventions
- lexical gaps
- interactions among grammatical systems

*The Language Construction Kit* treats text creation and translation as
important tools for discovering what a developing language still needs.

Linguistic documentation practice likewise relies on texts and corpora as
evidence for lexical, grammatical, pragmatic, and discourse analysis.

### Current support

The inherited plugin can process arbitrary text for dictionary lookup.

Its gloss functionality can tokenize text and identify:

- dictionary matches
- phrase matches
- inflected forms
- unmatched material
- cypher fallback material

This provides useful lexical analysis of connected input.

However, the plugin does not currently treat a connected text as a
first-class documented linguistic object.

### Gap

Conlang Workbench currently lacks a model for recording information such as:

- text title
- language or variety
- speaker or author
- addressee or audience
- date or historical stage
- genre
- register
- source
- provenance
- translation
- annotation
- relationships among utterances
- relationships between a text and examples extracted from it

The Workbench can inspect words in text, but it does not yet understand the
text as a documented source of language evidence.

### Initial requirement

Connected texts should be capable of existing as ordinary Markdown documents.

The first implementation should not require a specialized corpus database.

A text should be able to identify its language and, where useful, provide or
link to information such as:

- translation
- context
- source
- variety
- register
- historical stage
- annotations
- related examples

The original text should remain readable and editable without Conlang
Workbench.

### Original text and translation

The Workbench should distinguish the original language material from its
translation.

A translation may be:

- literal
- close
- idiomatic
- literary
- explanatory

More than one translation may exist.

The Workbench should not assume that a translated text has a one-to-one
sentence or word correspondence with the original.

### Annotation

Texts may eventually support annotation at several levels, including:

- lexical identification
- morphological analysis
- interlinear glossing
- syntactic constructions
- semantic senses
- pragmatic information
- discourse relationships
- sociolinguistic information
- historical commentary

Annotation should be optional.

A creator should be able to preserve a useful text without completely
analyzing every word in it.

### Provenance

Texts may have different origins.

A text might be:

- composed directly in the conlang
- translated from another language
- reconstructed
- generated as an exercise
- quoted from fictional historical material
- attributed to a particular speaker or community
- revised across several language-development stages

Where provenance matters, Conlang Workbench should permit it to be
documented.

The Workbench should not silently treat reconstructed, translated, elicited,
and independently composed material as equivalent evidence.

### Examples extracted from texts

An individual linguistic example may originate within a connected text.

The Workbench should eventually permit an example to reference:

- its source text
- its location within that text
- surrounding context

This allows a grammar or dictionary to cite a compact example while retaining
access to the discourse from which it came.

Where practical, such relationships should avoid unnecessary duplication of
the canonical language material.

### Corpora

A corpus should initially be understood as a collection of documented texts
rather than as a separate proprietary data store.

Possible corpus organization may involve:

- folders
- indexes
- tags
- links
- metadata
- Workbench-generated collections

A text may belong to more than one useful collection.

For example, the same text might belong to collections for:

- a historical stage
- a dialect
- a genre
- a speaker
- a register
- a research question

### Corpus evidence

Corpora may eventually allow the Workbench to distinguish between:

- documented rule
- attested example
- predicted form
- unattested but permitted form
- apparent exception

Frequency within a corpus may also provide useful evidence.

However, corpus frequency must not automatically be treated as grammatical
correctness.

A rare construction may still be valid, and a small constructed-language
corpus may not be statistically representative.

### Development use

Connected texts are valuable during language construction as well as after a
language has been documented.

Writing or translating a text may expose:

- missing vocabulary
- missing grammatical constructions
- awkward interactions among rules
- excessive ambiguity
- undocumented discourse conventions
- gaps in pronoun or reference systems
- missing cultural concepts

Conlang Workbench may eventually help surface these gaps without inventing
solutions automatically.

### Relationship to other systems

Texts may provide evidence for:

- lexicon
- morphology
- phonology
- syntax
- semantics
- pragmatics
- discourse
- sociolinguistics
- historical development

The Workbench should link these systems to textual evidence rather than
requiring the same analysis to be copied into several documents.

### Later capabilities

Possible later capabilities include:

- corpus indexes
- text browsers
- concordance searches
- keyword-in-context searches
- lexical frequency counts
- sense-frequency analysis
- construction searches
- morphology searches
- example extraction
- automatic backlinks from lexemes to attestations
- interlinear text views
- parallel-text views
- variety and register filtering
- historical corpus comparison
- annotation interfaces
- vocabulary-gap discovery
- corpus-informed dictionary examples

Statistical tools should clearly distinguish observations from conclusions.

### Open questions

- What is the minimum metadata required to recognize a document as a text?
- Should an utterance within a text receive a stable identifier?
- How should examples cite precise locations inside Markdown texts?
- How should edits to a source text affect extracted examples?
- How should parallel translations be aligned without requiring one-to-one
  correspondence?
- How should mixed-language and code-switched texts be represented?
- How should multimodal information accompany a text?
- Should corpus membership be explicit metadata, generated dynamically, or
  support both?
- How much automatic annotation should Conlang Workbench attempt?
- How should corpus statistics distinguish a small development corpus from a
  larger body of attested material?

---

## 15. Historical Development

**Status:** Planned  
**Priority:** Later

### What needs to be representable

Languages may change over time through processes such as:

- regular sound change
- conditioned sound change
- phoneme merger
- phoneme split
- loss
- epenthesis
- metathesis
- assimilation
- dissimilation
- lenition
- fortition
- stress change
- tone development
- morphological change
- analogy
- leveling
- reanalysis
- grammaticalization
- lexical replacement
- semantic change
- borrowing
- calquing
- language contact
- dialect divergence
- convergence
- orthographic change

Historical documentation may involve both attested and reconstructed stages.

Conlang Workbench must not assume that every conlang has a developed
diachronic history.

### Structural distinction

The Workbench should distinguish among:

- synchronic relationship
- historical descent
- derivation within a language
- cognacy
- borrowing
- reconstruction
- sound change
- semantic change
- grammatical change
- orthographic change

These relationships may intersect, but they are not interchangeable.

For example:

```text
word B is derived from word A
```

does not necessarily mean:

```text
word B historically descends from word A
```

and neither necessarily means:

```text
word B is cognate with word A
```

Likewise, a borrowed word may resemble a cognate while having a fundamentally
different historical relationship.

### Reference findings

*The Language Construction Kit* treats historical language construction as
more than altering the spelling of words.

It discusses:

- proto-languages
- daughter languages
- regular sound change
- conditioned changes
- morphological change
- semantic change
- borrowing
- analogy
- dialect development
- language-family relationships

Rosenfelder emphasizes applying historical changes systematically while also
allowing later analogy, borrowing, and other developments to disturb the
simple results of those changes.

The LCK also warns that the vocabulary of a proto-language should reflect
the culture, environment, and technology available to its speakers.

An ancestral language should therefore not automatically possess lexical
items merely because its descendants later need them.

### Current support

The inherited plugin contains several pieces of information that may be
historically useful, including:

- `etymology`
- source-file relationships
- aliases
- declared forms
- language identifiers

Cypher sheets can also perform ordered character substitutions.

However, these features do not constitute a historical language model.

In particular, cypher transformations should not automatically be treated as
sound changes merely because some substitutions could be used that way.

### Gap

Conlang Workbench currently lacks explicit representation for:

- ancestral languages
- daughter languages
- historical stages
- reconstructed forms
- cognate sets
- borrowing relationships
- dated or ordered sound changes
- semantic developments
- grammaticalization
- analogy
- historical orthographic changes
- relationships between synchronic irregularity and historical explanation
- ordered and inspectable chains of historical changes
- provenance for automatically proposed descendant or reconstructed forms
- stable accepted historical forms that are not silently replaced by later
  regeneration
- the distinction between the **type of historical relationship** and the
  **degree of resulting change**
- lexical borrowing that can identify the donor language and donor form
- the particular source sense involved in a borrowing when that information is
  known
- phonological, orthographic, and morphological adaptation of borrowed forms
- borrowing through one or more intermediary languages
- uncertain or disputed borrowing paths
- calques and partial calques
- semantic loans
- semantic narrowing, broadening, or other development after borrowing

A single generic relationship such as `derived_from` would be insufficient
for these distinctions.

### Initial requirement

Historical information should initially remain compatible with ordinary
Markdown documentation.

The architecture should leave room for typed historical relationships
without requiring every conlang to construct a proto-language.

Where a creator does document historical development, the Workbench should
eventually be able to distinguish at least:

- descended from
- reconstructed from
- cognate with
- borrowed from
- calqued from
- historically derived from
- synchronically derived from

The precise vocabulary may be refined during implementation.

### Historical stages

A language may be documented at several points in its history.

For example:

```text
Proto-Language
    ↓
Old Language
    ↓
Middle Language
    ↓
Modern Language
```

These stages may differ in:

- phonology
- phonotactics
- morphology
- syntax
- lexicon
- semantics
- pragmatics
- sociolinguistics
- orthography

A historical stage should therefore not be treated merely as a date attached
to an otherwise unchanged Language Profile.

At the same time, stages may share substantial inherited documentation.

How that inheritance should work remains an architectural question.

### Proto-languages and reconstruction

Conlang Workbench should permit a creator to distinguish between:

- directly established forms
- reconstructed forms
- hypothetical forms
- uncertain reconstructions

A reconstructed form should not silently become equivalent to an attested or
canonically established form.

The Workbench should also permit reconstruction notes explaining the evidence
or reasoning behind a proposed ancestral form.

### Sound change

Historical sound changes may need to record:

- input
- output
- phonological environment
- exceptions
- ordering
- historical stage
- approximate period
- dialect or branch
- conditioning factors

A conceptual representation might resemble:

```text
sound change
    ├── input
    ├── output
    ├── environment
    ├── stage
    ├── ordering
    ├── branch / variety
    ├── exceptions
    └── notes
```

This is not yet a required schema.

The Workbench should permit a sound change to be documented even when it
cannot automatically apply that change.

### Rule ordering

Historical changes may interact.

A later change may operate upon the result of an earlier change, making rule
order historically significant.

Conlang Workbench should therefore leave room for ordered changes without
assuming that every historical development can be represented as a simple
unordered list.

### Semantic change

Lexical meaning may change through processes such as:

- broadening
- narrowing
- metaphor
- metonymy
- amelioration
- pejoration
- specialization
- cultural change
- reinterpretation

The Workbench should eventually permit a historical relationship between
senses rather than treating the modern definition as if it had always been
the word's meaning.

### Grammatical change

Grammar may change historically through processes including:

- grammaticalization
- reanalysis
- analogy
- paradigm leveling
- erosion
- fusion
- changes in word order
- changes in alignment
- loss or creation of grammatical categories

Historical grammar should therefore be capable of linking to morphology,
syntax, semantics, and phonology rather than being reduced to lexical
etymology.

### Borrowing and contact

Borrowing must remain distinct from genetic descent.

A borrowed form may preserve information about:

- source language
- source form
- source sense
- approximate borrowing period
- donor variety
- recipient variety
- phonological adaptation
- morphological adaptation
- semantic change
- social context

The source language may or may not be another language documented inside the
same vault.

### Cognacy

Cognates are historically related forms descended from a shared source.

Cognacy should not be inferred merely from similarity.

A cognate relationship may involve several daughter-language forms and a
reconstructed ancestral form.

The Workbench should therefore leave room for cognate sets rather than only
pairwise links.

### Historical irregularity

A synchronically irregular form may be historically regular.

Likewise, a historically expected form may later be altered by analogy,
borrowing, lexical replacement, or other developments.

Conlang Workbench should permit historical explanation to coexist with the
current synchronic description.

The historical explanation should not replace the canonical description of
how the modern language actually behaves.

### Orthographic history

Writing systems and spelling conventions may change independently of spoken
language.

Historical documentation may therefore need to distinguish:

- sound change
- spelling change
- script change
- transliteration change
- spelling reform
- conservative historical spelling

The Workbench must not infer phonological change merely from differences in
written form.

### Relationship to cultural history

Historical vocabulary should reflect the conceptual and material world of
the speakers at that historical stage.

A proto-language need not contain words for institutions, technologies, or
concepts that arose only later.

New concepts may instead produce:

- new derivations
- compounds
- semantic extensions
- borrowings
- calques
- entirely new lexical roots

Conlang Workbench may eventually help expose chronological inconsistencies,
but it should not determine fictional history independently.

### Later capabilities

Possible later capabilities include:

- sound-change rule sets
- ordered sound-change application
- daughter-language generation
- historical lexeme trees
- cognate-set views
- borrowing networks
- proto-form reconstruction tools
- semantic-development chains
- grammaticalization chains
- historical-stage comparison
- dialect-tree visualization
- orthographic-history comparison
- automatic derivation histories
- detection of unexplained historical forms

Generated historical forms should remain distinguishable from creator-
confirmed forms.

### Open questions

- Should historical stages use full Language Profiles?
- How should historical stages inherit documentation without hiding genuine
  differences?
- What typed historical relationships are required for the first useful
  implementation?
- Should cognate sets be standalone documents?
- How should reconstructed forms differ structurally from established forms?
- How should sound-change ordering be represented?
- How should manually established descendant forms interact with automatically
  generated predictions?
- How should borrowing work when the donor language is not documented in the
  vault?
- How should semantic histories attach to individual lexical senses?
- How should synchronic derivation and diachronic descent remain clearly
  distinguishable in the UI?

---

## 16. Language Families and Varieties

**Status:** Planned  
**Priority:** Later

### What needs to be representable

A conlang project may contain more than one linguistic variety.

These may include:

- unrelated languages
- language families
- proto-languages
- branches
- daughter languages
- historical stages
- dialects
- regional varieties
- social varieties
- contact varieties
- standardized varieties
- competing standards
- registers
- mixed or transitional varieties

Conlang Workbench should permit these relationships without requiring every
project to organize its languages as a simple genealogical tree.

### Structural distinction

The Workbench should distinguish between relationships such as:

- genetically descended from
- historical stage of
- dialect or variety of
- standardized form of
- related through a common ancestor
- contact-influenced by
- descended partly from multiple sources
- socially associated with
- mutually intelligible with

These relationships describe different facts.

A dialect relationship should not automatically imply a separate historical
branch, and contact influence should not be mistaken for genetic ancestry.

### Reference findings

*The Language Construction Kit* treats language families as the result of
historical divergence rather than collections of languages that merely look
similar.

Proto-languages may develop into daughter languages through accumulated sound,
grammatical, lexical, and semantic changes.

Dialects may likewise diverge and may eventually become distinct languages.

At the same time, borrowing and language contact can produce similarities
that do not indicate common descent.

This means that a useful Workbench model must distinguish genealogical
relationships from contact relationships.

### Current support

The inherited plugin supports multiple configured languages.

Dictionary entries may identify the language to which they belong, and each
configured language can have its own:

- dictionary location
- inflection rules
- cypher configuration
- display and lookup behavior

This provides useful operational separation between languages.

However, configured languages currently exist largely as independent plugin
configurations.

The plugin does not model linguistic relationships among them.

### Gap

Conlang Workbench currently cannot explicitly represent that:

- two languages descend from the same ancestor
- one language descends from another
- a profile represents an earlier stage of another language
- a variety is a dialect of a broader language
- a standard is based upon one or more varieties
- two languages influenced one another through contact
- a language belongs to a particular branch of a family
- a variety inherits most of another variety's structure while differing in
  specific areas

Without these distinctions, related languages risk becoming either completely
duplicated documentation or artificially collapsed into one profile.

### Initial requirement

The Language Profile architecture should leave room for typed relationships
among languages and varieties.

The first implementation does not need a full language-family management
system.

At minimum, profiles should eventually be able to identify relationships
without requiring those relationships to control inheritance automatically.

The **type of relationship** should remain distinct from the **degree of
difference or historical divergence**.

For example, concepts such as:

- historical stage;
- descendant language;
- dialect;
- sister variety;
- contact variety;
- mixed language;
- borrowing relationship;

describe what kind of relationship exists.

A separate description may record whether the resulting differences are minor,
moderate, extensive, uncertain, or otherwise characterized by the language
documentation.

Workbench should not force concepts such as "dialect", "daughter language",
"contact variety", and "distant descendant" onto one overloaded scale.

For example, documenting:

```text
Language B descended from Language A
```

should initially be possible even if Conlang Workbench does not yet
automatically inherit or transform Language A's grammar.

### Stable identity

Language relationships should not depend solely upon display names.

A creator may rename:

```text
Proto-Western Speech
```

to:

```text
Proto-Aldric
```

without breaking every relationship pointing to that language.

This suggests that Language Profiles will eventually need some form of stable
identity distinct from their human-readable names.

The precise identifier mechanism should be decided during implementation.

### Family structure

A simple genealogical family might be represented conceptually as:

```text
Proto-Language
├── Northern Branch
│   ├── Language A
│   └── Language B
└── Southern Branch
    └── Language C
```

However, the Workbench should not assume that every relationship forms a
perfect tree.

Language contact, mixed languages, uncertain reconstruction, competing
classification, and dialect continua may require network-like relationships.

The family tree should therefore be a possible **view of documented
relationships**, not necessarily the canonical storage model.

### Branches

A branch may be useful as a named grouping of genetically related languages.

A branch does not necessarily need to behave as a language itself.

Conlang Workbench should therefore avoid requiring every organizational node
in a family tree to possess a complete Language Profile.

### Historical stages

Historical stages and daughter languages require different relationships.

For example:

```text
Old A
  ↓
Middle A
  ↓
Modern A
```

may represent successive stages conventionally treated as one continuing
language.

By contrast:

```text
Proto-A
├── Language B
└── Language C
```

represents divergence into separate descendants.

The Workbench should be capable of documenting this distinction rather than
reducing both to a generic parent-child relationship.

### Dialects and varieties

A dialect or variety may differ from a broader language in only selected
areas.

Differences may involve:

- pronunciation
- phonology
- phonotactics
- lexicon
- morphology
- syntax
- semantics
- pragmatics
- register
- orthography

A useful future system should avoid requiring complete duplication of all
unchanged language documentation.

However, inheritance must not hide differences or make the source Markdown
impossible to understand without the plugin.

### Inheritance

Some form of inheritance may eventually be valuable.

A variety could conceptually inherit information from another profile and
override documented differences.

For example:

```text
Language
    ↓
Northern Variety
        ├── inherited grammar
        ├── different vowel inventory
        ├── several lexical replacements
        └── different second-person honorific
```

This is attractive, but it introduces significant complexity.

Inheritance should therefore remain a future capability until we can define:

- what may be inherited
- what constitutes an override
- how deletions are represented
- how conflicts are resolved
- how inherited information remains human-readable
- how multiple inheritance or contact influence differs from genetic
  inheritance

### Dialect continua

Not all varieties have clean boundaries.

A dialect continuum may contain neighboring varieties that are mutually
similar while distant varieties are substantially different.

Conlang Workbench should therefore avoid requiring every variety to fit a
strict hierarchy.

Relationships such as similarity, intelligibility, geography, or contact may
eventually supplement genealogical classification.

### Mutual intelligibility

Mutual intelligibility is not identical to genetic relationship.

Closely related languages may not be mutually intelligible, while contact or
other circumstances may make distinct varieties readily understandable.

If documented, intelligibility should therefore be treated as its own
relationship or property rather than inferred from family structure.

### Contact and mixed ancestry

Some linguistic histories cannot be represented adequately by one parent.

Languages may arise through intense contact, convergence, creolization, or
other processes involving multiple linguistic sources.

The architecture should therefore avoid hard-coding:

```text
language.parent = exactly one language
```

as the universal model of language relationships.

A simple `parent_language` field may remain useful for straightforward cases,
but the broader relationship model must be capable of expressing more complex
histories.

### Uncertain and competing classifications

Creators may intentionally leave historical relationships unresolved.

Documentation may need to represent that a relationship is:

- established
- probable
- possible
- disputed
- hypothetical
- deliberately undecided

Alternative family analyses should be documentable without requiring the
Workbench to select one as fact.

### Relationship to Language Profiles

Major linguistic entities such as languages, historical stages, and
substantially documented varieties may use Language Profiles.

Smaller distinctions may be represented through other documents or
relationships.

The Workbench should not require a separate Language Profile for every minor
accent, register, or local variation.

### Relationship to historical development

Language-family relationships describe the entities and connections produced
by historical change.

Detailed processes such as:

- sound change
- semantic change
- borrowing
- grammaticalization
- analogy

belong primarily to Historical Development.

Family documentation should link to that evidence rather than duplicate it.

### Later capabilities

Possible later capabilities include:

- family indexes
- family-tree visualization
- relationship-network visualization
- branch browsing
- historical timelines
- profile inheritance
- dialect comparison
- side-by-side inventory comparison
- cognate browsing across languages
- shared-etymology views
- contact networks
- intelligibility maps
- competing family analyses
- automatic comparison of related profiles

Visualizations should be generated from documented relationships rather than
becoming the canonical storage format.

### Open questions

- What stable identifier should Language Profiles use?
- Which relationships among languages and varieties need typed support?
- When should a dialect receive its own Language Profile?
- How should historical stages differ structurally from daughter languages?
- Should branches be documents, metadata, generated groupings, or some
  combination?
- How should inheritance work while keeping Markdown understandable without
  the plugin?
- How should an inherited feature be explicitly removed rather than
  overridden?
- How should multiple inheritance differ from contact influence?
- How should uncertain or competing classifications be represented?
- Should mutual intelligibility be stored as directional rather than
  symmetrical data?
- How should dialect continua be represented without imposing artificial
  boundaries?

---

## 17. Validation and Completeness

**Status:** Planned  
**Priority:** Later

### What needs to be representable

Conlang Workbench may eventually help identify:

- malformed metadata
- broken references
- missing required document fields
- undocumented lexical forms
- forms that violate declared phonotactics
- unexpected phonemes or graphemes
- inconsistent inflectional forms
- conflicting grammatical documentation
- unexplained exceptions
- missing examples
- lexical gaps
- sparsely documented semantic domains
- unattested constructions
- unresolved analyses
- incomplete historical derivations
- inconsistencies among related language documents

These conditions are not all errors.

The Workbench must distinguish structural invalidity from incomplete,
unusual, exceptional, uncertain, or merely undocumented language data.

### Governing principle

Validation should answer questions such as:

> Does this document conform to the structure the Workbench expects?

and:

> Does this language data agree with the rules this language declares?

It should not answer:

> Is this how a language ought to work?

Conlang Workbench is a documentation and development tool, not an arbiter of
linguistic legitimacy.

### Explainable Validation and Machine Confidence

When Workbench reports that a form conflicts with documented language rules, the
finding should identify the relevant rule, constraint, or evidence where
practical.

A useful finding should answer not only:

> Something may be inconsistent.

but also:

> Which documented rule or expectation produced this finding?

and, where possible:

> Why did this particular form trigger it?

This is especially important for beginning conlangers, because validation should
teach the user how the documented language works rather than merely displaying
an unexplained failure state.

Where Workbench proposes an inferred analysis or prediction rather than applying
a definite declared rule, it should distinguish certainty from confidence.

Examples may include:

- predicted stress;
- proposed syllabification;
- possible morphological segmentation;
- inferred morpheme identity;
- proposed phonological pattern;
- suggested historical relationship;
- possible loanword adaptation.

Where meaningful, such proposals may expose confidence or uncertainty to help
the user evaluate them.

Confidence must not be treated as proof.

A high-confidence machine proposal remains a proposal until accepted or
supported by evidence.

Likewise, a documented exception should remain valid language data even when a
productive rule predicts something else.

Workbench should make it possible to distinguish:

- an apparent accidental inconsistency;
- a deliberate creator-established exception;
- an attested irregular form;
- an unresolved analysis;
- a machine prediction that differs from stored data.

### Durable Evidence and Rebuildable Machine State

Human-established evidence should outlive the machine models, caches, indexes,
or other derived state built from it.

Examples of durable evidence may include:

- accepted stress markings;
- corrected syllabification;
- accepted morphological analyses;
- approved phonological interpretations;
- creator-confirmed or researcher-confirmed classifications;
- attested examples used to support analysis.

Derived machine state may include:

- trained prediction models;
- confidence estimates;
- embeddings;
- search indexes;
- cached analyses;
- generated recommendations.

When derived machine state becomes obsolete, incompatible, or corrupt, the
Workbench should prefer rebuilding it from durable evidence rather than
discarding the evidence or treating the machine state as canonical.

Conceptually:

```text
accepted evidence / corrections
            ↓
      derived model or index
            ↓
         predictions
```

If the derived model is replaced or rebuilt, the accepted evidence remains.

This principle applies to local machine-learning features as well as optional
external or local AI assistance.

### Categories of findings

Validation findings should eventually distinguish among several kinds of
conditions.

#### Error

The data cannot be interpreted reliably or violates a requirement explicitly
declared by the project or language.

Examples might include:

- malformed required metadata
- an impossible internal reference
- duplicate stable identifiers
- a value that cannot be parsed according to its declared format

#### Warning

The data is interpretable, but it appears to conflict with a documented rule
or expectation.

Examples might include:

- a lexical form containing a phoneme not present in the declared inventory
- a form violating a machine-checkable phonotactic rule
- an inflected form differing from the form predicted by a productive rule
- a construction conflicting with a declared restriction

A warning does not establish that the language data is wrong.

#### Notice

The Workbench has found something potentially useful for the creator to
review.

Examples might include:

- a lexeme without an example
- a semantic domain with little vocabulary
- a grammar rule with no linked examples
- a form not yet attested in a connected text

#### Unresolved

The documentation explicitly records uncertainty or competing analyses.

This is valid data.

The Workbench should preserve the uncertainty rather than repeatedly warning
that the creator has not selected one answer.

### Validity versus completeness

Validity and completeness are separate concepts.

A language document may be completely valid while remaining intentionally
incomplete.

For example:

```text
valid:
    the documented noun system is internally consistent

incomplete:
    the creator has not yet documented verbal morphology
```

Incomplete documentation should not make the existing documentation invalid.

### Completeness is language-defined

Conlang Workbench must not use a universal checklist to determine whether a
language is complete.

For example, absence of documentation for grammatical gender could mean:

- the language has no grammatical gender
- the system has not yet been designed
- the system exists but has not yet been documented
- gender is irrelevant to the creator's goals

These states should not be silently conflated.

Where useful, the Workbench should permit creators to indicate states such
as:

- documented
- not yet documented
- not applicable
- intentionally absent
- unresolved
- planned

The exact vocabulary may be refined later.

### Absence as information

An explicitly documented absence is meaningful language data.

For example:

```text
grammatical gender: intentionally absent
```

is different from having no documentation about grammatical gender.

Likewise:

```text
tone: not applicable
```

should not continue appearing as an unfinished task.

This principle is important for useful completeness auditing.

### Validation against declared rules

Machine validation should operate only where sufficiently explicit rules
exist.

For example, if a language declares a machine-readable phonotactic rule, the
Workbench may check lexical forms against it.

If phonotactics are documented only in prose, the Workbench should not
pretend to understand them completely.

The absence of a machine-readable rule must not imply that the language lacks
the phenomenon.

### Exceptions

A form may deliberately violate a productive pattern.

Possible reasons include:

- irregularity
- borrowing
- historical residue
- fossilization
- analogy
- dialect variation
- register
- proper names
- deliberate stylistic usage

Conlang Workbench should permit exceptions to be documented explicitly.

Once an exception is acknowledged, validation should not continue presenting
it as an unexplained error.

### Prediction versus established data

Generated or predicted forms should remain distinguishable from
creator-established forms.

For example, an inflection engine might predict:

```text
lemma + plural rule → predicted plural
```

If the creator explicitly records a different plural, the explicit form is
authoritative.

The difference may produce a useful notice or prompt for explanation, but the
generator must not overwrite established language data.

The same principle applies to:

- sound-change predictions
- transliteration
- phonological realization
- syntactic generation
- historical reconstruction

### Attestation

The Workbench should distinguish among concepts such as:

- documented
- generated
- predicted
- reconstructed
- attested
- unattested
- hypothetical

A form does not become attested merely because the Workbench generated it.

Likewise, absence from a small corpus does not prove that a form is
ungrammatical.

### Lexical completeness

Vocabulary-development tools may identify possible gaps, but they should not
assume that every concept requires a dedicated lexeme.

A concept may be:

- expressed compositionally
- represented by a broader term
- represented by several narrower terms
- culturally irrelevant
- deliberately unnamed
- expressed grammatically rather than lexically
- genuinely missing from the current lexicon

A useful completeness tool should therefore ask:

> How does this language express this concept?

rather than:

> Why is this word missing?

### Grammar completeness

Grammar documentation may likewise be audited for coverage without requiring
a universal grammar.

A reference or project template may suggest questions concerning:

- phonology
- morphology
- syntax
- semantics
- pragmatics
- discourse

The creator should be able to classify each area according to the language's
actual needs.

Reference-derived questions are prompts for investigation, not requirements
that the language possess particular structures.

### Evidence

Validation findings should ideally be explainable.

Rather than merely reporting:

```text
Invalid word
```

a useful finding might report conceptually:

```text
This form contains /ŋ/.

The current phoneme inventory does not include /ŋ/.

Possible explanations:
- the inventory is incomplete
- /ŋ/ is an allophone
- this word is a borrowing or exception
- the lexical transcription is incorrect
```

The Workbench should expose the evidence behind a finding whenever practical.

### Validation levels

Different users and different stages of language development may benefit from
different amounts of validation.

Possible future modes might include:

- structural validation only
- declared-rule validation
- development notices
- completeness audit

These should not require separate canonical language data.

A creator should be able to reduce development notices without disabling
checks for genuinely malformed data.

### Human authority

Human judgment remains authoritative.

Conlang Workbench may:

- detect
- compare
- calculate
- suggest
- warn
- ask questions

It should not silently rewrite canonical language data to satisfy its own
validation rules.

When stored language data and generated expectations disagree, the Workbench
should expose the disagreement and allow the creator to decide what it means.

### Relationship to the Coverage Audit

The Coverage Audit may eventually provide a source of development questions.

For example, the audit may reveal that a language has no documentation yet
for orthography.

That does not mean the language is defective.

It means only that the project's documentation has not established whether:

- the language has no writing system
- the language uses a writing system not yet documented
- the area is outside the creator's goals
- the area remains unfinished

The creator should be able to resolve that question explicitly.

### Later capabilities

Possible later capabilities include:

- metadata validation
- broken-link detection
- inventory validation
- phonotactic checking
- orthographic checking
- inflection consistency checks
- paradigm completeness checks
- example-coverage reports
- grammar-coverage reports
- semantic-domain coverage
- corpus-attestation reports
- historical consistency checks
- cross-variety consistency checks
- configurable validation profiles
- exception management
- project completeness dashboards

These capabilities should report evidence and preserve creator control.

### Open questions

- What finding categories should the UI ultimately use?
- How should a creator suppress or resolve an expected warning?
- Should acknowledged exceptions be stored on the affected object, the rule,
  or both?
- How should `not applicable`, `intentionally absent`, and `not yet
  documented` be represented?
- Which validation checks belong in the first useful release?
- How should validation behave when documentation is descriptive but not
  machine-readable?
- How should generated predictions be compared with explicitly stored forms?
- How should completeness profiles differ for sketch languages, artlangs,
  auxiliary languages, engineered languages, and deeply documented fictional
  languages without prescribing what those categories must contain?
- How should the Workbench explain a finding without overwhelming a beginning
  conlanger with technical terminology?

---

## 18. Publication and Export

**Status:** Planned  
**Priority:** Later

### What needs to be representable

Conlang documentation may eventually be presented or exported as:

- dictionary entries
- complete dictionaries
- word lists
- reference grammars
- grammar sketches
- teaching grammars
- phoneme or grapheme inventories
- paradigms
- interlinear examples
- connected texts
- parallel texts
- language-family references
- historical comparisons
- indexes
- web pages
- printable documents
- machine-readable datasets

Different outputs may use the same underlying language data while presenting
it differently.

### Governing principle

Canonical linguistic data should remain separate from publication
presentation.

The Workbench should aim for a model resembling:

```text
canonical Markdown data
        ↓
Workbench interpretation
        ↓
selected presentation / export
```

rather than:

```text
publication format
        =
canonical data
```

A creator should not need to restructure the language merely because a
different output format is desired.

### Reference findings

Conlanging and linguistic documentation references commonly present language
information through several different forms:

- descriptive prose
- inventories
- paradigms
- dictionaries
- interlinear examples
- sample texts
- indexes

These are views and presentations of linguistic information rather than
necessarily separate underlying facts.

The organization appropriate for a published reference grammar may also
differ from the organization most convenient while constructing the language.

Conlang Workbench should therefore support development-oriented organization
without making that organization the only possible publication structure.

### Current support

The inherited plugin primarily presents language information inside Obsidian.

It provides useful interfaces such as:

- dictionary lookup
- hover information
- gloss lookup
- transliteration-style output

The underlying language data remains stored in Markdown and configuration
rather than in a proprietary publication database.

This provides a strong foundation for future export.

### Gap

Conlang Workbench does not yet provide a general publication or export
system.

It cannot currently generate complete outputs such as:

- formatted dictionaries
- grammar references
- lexicon indexes
- phonological inventories
- paradigm tables
- collections of examples
- connected-text editions
- historical comparisons

Nor is there yet a defined boundary between canonical data, generated views,
and publication-specific formatting.

### Initial requirement

Publication features should not dictate the canonical data model.

The first implementation should concentrate on preserving sufficiently
structured, readable Markdown so future publication tools can extract the
information they need.

Generated publication artifacts should normally be reproducible from the
canonical vault.

Where practical, users should not need to maintain the same linguistic
information independently in both source and publication documents.

### Human-readable source

The Markdown vault should remain useful without Conlang Workbench.

A lexicon entry should still be understandable as a lexicon entry.

A grammar document should still be readable as grammar documentation.

An example should still preserve its linguistic content.

Publication support should enhance this material rather than make the source
depend upon opaque generated structures.

### Dictionaries

Dictionary publication may need to select and arrange information such as:

- headword
- written representations
- pronunciation
- part of speech
- numbered senses
- concise glosses
- definitions
- usage labels
- examples
- etymology
- related forms
- semantic domains

Different dictionary outputs may include different subsets.

A compact player-facing dictionary and a detailed linguistic dictionary may
therefore be generated from the same lexical documentation.

### Grammar publication

A published grammar may organize material differently from the vault.

Possible sections might include:

- introduction
- phonology
- orthography
- morphology
- syntax
- semantics
- pragmatics
- texts
- lexicon

However, Conlang Workbench should not require every grammar to follow one
universal chapter order.

Publication structure should eventually be configurable.

### Examples and glosses

Publication may require linguistic examples to be rendered differently from
their canonical representation.

For example, the same stored example might appear as:

- a compact example in a dictionary
- a numbered interlinear example in a grammar
- an annotated example in a teaching document
- an unglossed quotation in a fictional text

The underlying example should not need to be duplicated merely to obtain
these presentations.

### Generated views versus generated files

The Workbench should distinguish between:

- dynamic views inside Obsidian
- temporary previews
- generated export files
- canonical Markdown documents

A generated index or publication artifact should not silently become a
second canonical copy of the underlying linguistic data.

### Export selection

Creators may want to publish only part of a language.

Future export tools may therefore need selection by:

- language
- historical stage
- variety
- register
- document type
- semantic domain
- lexical status
- publication status
- selected texts
- selected grammar sections

The precise filtering system remains an implementation question.

### Publication status

Not all documented material is necessarily ready for publication.

The Workbench should leave room for distinctions such as:

- draft
- reviewed
- established
- deprecated
- private
- publication-ready

These are documentation workflow states rather than claims about linguistic
validity.

The exact status vocabulary should remain project-configurable where
practical.

### Presentation-specific information

Some information exists solely for presentation, such as:

- heading style
- page layout
- typography
- table appearance
- ordering preferences
- whether IPA is displayed
- whether etymologies are included
- whether examples are numbered

Such information should normally belong to publication configuration rather
than canonical linguistic facts.

### Lossy export

Some output formats cannot preserve all Workbench information.

A printable word list, for example, may intentionally omit:

- internal identifiers
- extensive notes
- unresolved analyses
- relationship metadata
- development history

Such export is acceptable when the loss is deliberate and clearly belongs to
the generated output.

Exporting less information is different from modifying or discarding the
canonical source.

### Round-trip editing

Publication export does not automatically require round-trip editing.

A PDF, printed grammar, or static website may reasonably be treated as an
output artifact.

Formats intended for continued linguistic editing require different
considerations.

Those concerns are audited separately under External-Format
Interoperability.

### Reproducibility

Where practical, generated publications should be reproducible from:

- canonical language data
- explicit publication configuration
- selected templates or presentation rules

This makes it possible to regenerate a publication after the language
changes rather than manually repairing an independent copy.

### Later capabilities

Possible later capabilities include:

- dictionary generation
- grammar-reference generation
- grammar-sketch generation
- configurable indexes
- paradigm tables
- inventory tables
- example numbering
- cross-reference generation
- printable output
- HTML publication
- static-site export
- teaching-material export
- selected-language packages
- publication templates
- bibliography generation
- multiple publication profiles

These should operate upon canonical data rather than replace it.

### Open questions

- Which publication format should Conlang Workbench support first?
- Should publication templates live in the vault, plugin settings, or both?
- How should creators control ordering of grammar sections?
- How should generated publications reference canonical source documents?
- Which generated artifacts, if any, should be stored inside the vault?
- How should publication status interact with validation and completeness?
- How should private development notes be excluded reliably from public
  exports?
- How should custom scripts and fonts be packaged or referenced?
- How much page-layout responsibility belongs inside Conlang Workbench rather
  than specialized publishing software?
- Which export formats should be deliberately one-way?

---

## 19. External-Format Interoperability

**Status:** Planned  
**Priority:** Foundation

### Governing principle

Conlang Workbench should remain interoperable with other linguistic and
conlanging tools without allowing any external format to dictate Workbench's
internal architecture.

Workbench's internal data models are canonical for information owned by
Workbench.

External formats should be treated as representations that can be translated
to or from those canonical models.

This distinction allows Workbench to exchange useful linguistic information
without making another application's serialization format the foundation of
Workbench's own data model.

### Canonical Translation Boundary

External-format support should operate through translation adapters that map
between Workbench's canonical models and the representation expected by an
external tool or format.

Conceptually:

```text
external representation
        ↓ import
translation adapter
        ↓
Workbench canonical model
        ↓
translation adapter
        ↓ export
external representation
```

An external format should not determine the structure of Workbench's canonical
model merely because Workbench supports exchanging information with it.

This is particularly important when the external format:

- represents only part of the information Workbench can store;
- combines concepts that Workbench keeps distinct;
- requires information that Workbench treats as optional;
- uses positional or serialization-specific structures;
- cannot represent uncertainty or unresolved analysis;
- assumes a particular linguistic theory or workflow.

The adapter is responsible for reconciling those representational differences
as explicitly as possible.

### Import and export are independent capabilities

Import and export should not be treated as an inseparable pair.

An integration may support:

- import only;
- export only;
- both import and export.

Workbench should advertise only the directions that have actually been
implemented and tested.

For example:

```text
Ling Gloss export supported
```

would not imply:

```text
Ling Gloss import supported
```

Likewise, supporting both import and export does not by itself imply that
arbitrary data can make a perfectly lossless round trip through both systems.

Capability descriptions should remain precise about what has actually been
verified.

### Lossy translation

Not every external representation will be capable of expressing everything in
a Workbench model, and Workbench may likewise be unable to reconstruct every
piece of information contained in an external representation.

Lossy conversion is acceptable when the limitation is made visible.

Where a translation cannot represent all source information, the adapter
should identify that limitation rather than silently:

- discard information;
- invent missing information;
- normalize meaningful distinctions away;
- reinterpret unresolved information as established fact.

Where practical, an import or export operation should be able to report what
could not be represented.

For example:

```text
Export completed with limitations:

- source format cannot represent example context
- two unresolved analytical fields were omitted
- Workbench-specific relationship metadata was not exported
```

The exact reporting mechanism can be designed when a real adapter is
implemented.

### Internal semantic roles versus external syntax

Workbench models should describe what information **means**, not where another
format expects that information to appear.

For example, the linguistic-example model describes roles such as:

```text
text
realization
segmentation
gloss
translation
context
source
notes
```

An external adapter may serialize those roles into positional lines,
directives, markup, JSON properties, or some other representation.

That serialization belongs to the adapter.

The internal model should not be reshaped merely to resemble one external
format's syntax.

The same principle should apply to future interoperability involving:

- lexical entries;
- lexical senses;
- morphemes;
- phonological data;
- linguistic examples;
- historical relationships;
- corpora;
- other structured language documentation.

### Current architectural support

Although no dedicated external-format adapter has yet been implemented,
several Foundation features now provide canonical internal structures that
future adapters can target.

These include:

- Language Profiles;
- dictionary entries;
- structured lexical senses;
- the Morpheme Inventory;
- linguistic examples.

This means future interoperability work can translate external representations
into established Workbench concepts rather than requiring an external format
to define those concepts.

The linguistic-example implementation is particularly important for future
interlinear-glossing interoperability because it already distinguishes
semantic roles such as original text, segmentation, gloss, and natural
translation independently of any external serialization syntax.

### Ling Gloss

Ling Gloss is currently the leading candidate for Conlang Workbench's first
dedicated external-format adapter.

Its interlinear-glossing focus makes it a useful candidate for testing the
translation-boundary architecture against a real external representation.

A likely first implementation would be export from Workbench linguistic
examples into a Ling Gloss-compatible representation.

However, no Ling Gloss:

- import;
- export;
- synchronization;
- round-trip editing

capability is currently claimed.

Implementation is intentionally deferred until the integration provides a
practical benefit.

This avoids building speculative adapter infrastructure merely to satisfy an
audit category.

When a concrete interoperability need appears, the real target format should
be used to prove and refine the adapter architecture.

### Foundation outcome

The architectural requirement for external-format interoperability has been
established.

Workbench now has a clear governing boundary:

```text
Workbench canonical model
        ↕
translation adapter
        ↕
external representation
```

The Foundation therefore establishes **how interoperability should be built**
without claiming that a particular external integration already exists.

Implementation remains Planned.

The first real adapter should be developed when there is a useful integration
to build, and that implementation should be used to validate whether the
proposed translation boundary is sufficient.

This is preferable to constructing an unused generic framework whose
abstractions have not yet been tested against a real external format.

### Future adapter requirements

When the first external adapter is implemented, it should help establish a
reusable pattern for later integrations.

A future adapter may need to declare capabilities such as:

- supported import direction;
- supported export direction;
- source or target format version;
- Workbench models it can translate;
- known representational limitations;
- whether conversion is expected to be lossless;
- warnings produced during translation.

A conceptual capability model might eventually resemble:

```text
format
 ├─ can import?
 ├─ can export?
 ├─ supported Workbench models
 └─ known limitations
```

This is a design requirement rather than a request to implement that
abstraction before it is needed.

The first concrete adapter should determine how much shared infrastructure is
actually useful.

### Open questions

- Which external format will provide enough practical value to justify the
  first adapter?
- Should Ling Gloss begin as export-only, or will a real use case justify
  import as well?
- What information should an adapter return when a conversion is lossy?
- How should Workbench preserve external information that has no canonical
  internal equivalent?
- When should imported information become canonical Workbench data, and when
  should it remain an unresolved proposal?
- How should format versions and changing external specifications be handled?
- Which adapter capabilities should be visible to the user before they attempt
  an import or export?
- How much common adapter infrastructure should exist before more than one real
  integration has demonstrated the need for it?

---

## Audit Queue

This queue records the current development sequence suggested by the audit.

Completion of a Foundation item means that Conlang Workbench has an operative
architectural base for that area. It does not mean that every capability
described in the corresponding audit section has been implemented.

### Foundation established

The following Foundation areas now have sufficient operative support to serve
as bases for later development.

1. **Language identity and profiles**
   - Basic Language Profile support is implemented.
   - Language identity is separated from plugin configuration.
   - Stable language identity can support later relationships, varieties, and
     historical development.
   - Richer language relationships remain future work.

2. **Lexicon and lexical senses**
   - Existing simple dictionary entries remain supported.
   - Structured lexical senses are implemented.
   - Sense-specific lookup terms participate in English-direction lookup.
   - Lookup can preserve which structured sense produced a match.
   - Richer lexical semantics, provenance, diagnostics, and lexical-development
     workflows remain future work.

3. **Morphology**
   - The existing inflection engine remains available for simple productive
     prefix and suffix behavior.
   - A separate Morpheme Inventory now provides explicit morpheme
     documentation.
   - Documented morphemes are not automatically treated as productive rules.
   - Broader morphological processes, evidence, productivity, Word Builder,
     and Word Analyzer remain future work.

4. **Linguistic examples**
   - A canonical internal linguistic-example model is implemented.
   - Standalone example notes may contain optional analytical tiers.
   - Missing tiers remain absent rather than being invented.
   - Examples can be browsed, searched, expanded for analysis, and opened in
     their source notes.
   - Interlinear glossing and embedded-example recognition remain future work.

### Foundation architecture established; implementation deferred

5. **External-format interoperability**
   - Workbench's internal models are canonical.
   - External representations should be handled through translation adapters.
   - Import and export are independent capabilities.
   - Lossy conversions should identify representational limitations rather
     than silently discard or invent information.
   - No external-format adapter is currently implemented.
   - Ling Gloss is the leading candidate for a first dedicated adapter,
     probably beginning with export.
   - Implementation is intentionally deferred until a concrete integration
     provides practical value.

### Next development phase — Early

With the operative Foundation established, development can proceed into the
Early-priority areas.

The audit currently identifies the following Early areas:

- guided language creation and proposal workflow;
- naming traditions and name generation;
- phonetics and phonology;
- phonotactics and prosody;
- orthography and writing systems;
- morphophonology;
- syntax;
- semantics;
- interlinear glossing.

These areas do not need to be implemented strictly in the order listed above.

Dependencies should guide development where useful.

In particular:

```text
phonetics and phonology
        ↓
phonotactics and prosody
        ↓
generation and validation

phonetics and phonology
        +
morphology
        ↓
morphophonology

linguistic examples
        +
morphology
        +
syntax
        ↓
richer grammatical analysis

linguistic examples
        ↓
interlinear glossing
        ↓
possible external glossing adapter
```

Because phonological information can support phonotactics, morphophonology,
pronunciation-aware generation, rhyme, orthographic relationships, and later
speech-related tooling, **Phonetics and Phonology is a strong candidate for
the first major Early implementation**.

That is a dependency-based recommendation rather than a required development
order.

The next Early feature should still be chosen according to practical value,
dogfooding needs, and which area provides the most useful foundation for
subsequent work.

### Continuing cross-cutting work

Some useful improvements do not require promoting an entire audit area into
active development.

These may be addressed when they become useful or when related code is already
being touched.

Examples include:

- skipped-entry diagnostics for malformed or mismatched dictionary notes;
- lexical provenance and loanword metadata;
- richer morpheme evidence and productivity information;
- links among lexical senses, morphemes, and linguistic examples;
- example labels, categories, and relationships;
- improved lexical-coverage reporting;
- quick lexical creation from unresolved lookup items.

These should remain incremental improvements rather than blocking progression
into the Early phase.

---

## References

See [[REFERENCES]] for the project's working reference list.

The coverage audit should record conclusions rather than duplicate extensive
reference notes.
