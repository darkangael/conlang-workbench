# H10 Supplementary Unicode Runtime Test

This note is a permanent Conlang Workbench regression fixture for
supplementary-plane Unicode letters.

The unusual character below is:

- U+10400 DESERET CAPITAL LETTER LONG I
- Unicode category: Letter
- UTF-16 representation: two code units

It is deliberately difficult to type manually. Preserve these test strings
exactly rather than replacing or normalizing them.

## Cursor-under-word tests

Place the cursor on or immediately around the unusual character in each word,
then run:

**Look up word (all senses)**

### Initial supplementary-plane letter

𐐀aru

### Medial supplementary-plane letter

var𐐀u

### Final supplementary-plane letter

aru𐐀

## Expected lexical boundaries

Workbench must interpret the complete strings as:

- `𐐀aru`
- `var𐐀u`
- `aru𐐀`

It must not split them into fragments such as:

- `aru`
- `var`
- `u`

## Positive dictionary lookup

The Test Language lexicon contains a permanent regression entry for:

var𐐀u

Cursor lookup on that complete word should resolve the Test Language entry.

## Hover test

In Reading View, hover over:

var𐐀u

Workbench should recognize the complete lexical word and resolve the same
Test Language dictionary entry.

## Preservation rule

The supplementary-plane character is creator-authored lexical content.

Workbench may interpret complete Unicode code points for lexical matching, but
must not rewrite, delete, split, or replace the source spelling.
