# compute-quote-null

**Calculate it, quote it, or say you don't know.**

An AI answer that is wrong and sure of itself costs more than one that says "not found". This skill gives your
coding or research agent one rule for every factual claim: it is a **COMPUTE** (arithmetic you can redo), a
**QUOTE** (exact words from a source you can open), or a **NULL** (not found, and where it looked). Prose may
dress a fact; it never fathers one.

```
The free-shipping threshold is 50 EUR [Q: terms.md:3 "Shipping is free above 50 EUR."]. Your cart of two items at
30 EUR comes to [C: 2 * 30 = 60] EUR, so it ships free. The return window for opened items is not stated
[N: searched terms.md, faq.md].
```

Then a checker proves the markers hold, with no model and no dependencies:

```
$ node check.mjs answer.md --root docs
compute-quote-null: 3 marked claim(s): 1 compute, 1 quote, 1 null. 2 hold, 1 failed, 0 not checked.
FAIL  line 1  [Q: terms.md:3 "Shipping is free above 40 EUR."]
      these words are not in terms.md
UNMARKED: 1 line(s) state numbers outside any marker (leads: mark them or say why they need none):
  line 1  50  · The free-shipping threshold is 50 EUR [Q: terms.md:3 "Shipping is free above 40 EUR."]. ...
```

(The quote was misremembered, and the 50 in the prose no longer has anything behind it.)

- **QUOTE:** the words must be in the file (or page, with `--fetch`), at the cited line if one is given.
  Whitespace, curly quotes and dashes are normalised; wording and case are not.
- **COMPUTE:** recomputed by a small arithmetic parser (it never runs code) and compared at the precision you wrote.
- **NULL:** must say where it looked.
- **UNMARKED:** numbers stated outside any marker are listed as leads (`--strict` makes them fail).

## Install

As a Claude Code skill:

```sh
git clone https://github.com/PowerpBoxCaptain/compute-quote-null ~/.claude/skills/compute-quote-null
```

Or run the checker on any answer (Node 18+):

```sh
node check.mjs [answer.md] [--root <dir>] [--fetch] [--strict] [--json]     # no file: reads stdin
```

Exit codes: `0` every claim holds · `1` a claim failed · `2` nothing failed, but something was not checked ·
`3` the check broke.

## What it does not prove

A passing check means the quotes are real and the sums are right. It does not mean the source is true, that the
quote is used in its proper context, or that the answer left nothing out. PDFs and Word files need converting to
text first. A quote cannot contain `]`.

## Tests

`node test.mjs` runs 27 cases: quotes present, across line breaks, at the right and the wrong line, curly against
straight quotes, case kept, missing file, URL without `--fetch`; computes right, wrong, at precision, with
percent and thousands separators, division by zero, and code that must never run; nulls with and without a
place; unmarked numbers, numbers backed by a marker on the same line, and `--strict`.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
