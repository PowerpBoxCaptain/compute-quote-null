---
name: compute-quote-null
description: Answer with no made-up facts. Every factual claim is a calculation the reader can redo, an exact quote from a source they can open, or an honest "not found" that says where you looked. Use when the user asks for a grounded or cited answer ("cite your sources", "don't make anything up", "only from the documents"), when the answer rests on figures, contracts, policies, regulations, specs or reports, or when a wrong confident answer would cost someone money, safety or trust.
---

# compute-quote-null

Every factual claim you make is exactly one of three things. Mark it inline.

| Kind | Marker | It means |
|---|---|---|
| **COMPUTE** | `[C: 1,250 * 15% = 187.5]` | arithmetic on numbers you were given or quoted; the reader can redo it |
| **QUOTE** | `[Q: docs/terms.md:42 "refunds are issued within 14 days"]` | the exact words, copied, from a file or URL the reader can open; line number when you know it |
| **NULL** | `[N: searched docs/, README.md, the contract PDF]` | you did not find it; say where you looked |

Prose may connect marked claims and explain them. **Prose may dress a fact; it never fathers one.** If you notice
yourself writing a figure, a date, a name, a limit or a rule that no marker backs, stop: compute it, quote it, or say
null.

## Rules

1. **Copy, never paraphrase, inside a quote.** The words between the quote marks must appear in the source as they
   are (spacing and curly-versus-straight quote marks do not matter; case and wording do). Put your paraphrase
   outside the marker.
2. **Compute only plain arithmetic** on numbers that are themselves quoted or given by the user: `+ - * / × ÷ ^ ( )`
   and a `%` suffix. Units go in the prose, not in the marker. Write the result at the precision you mean.
3. **Null is an answer, not a failure.** A clear "not in these documents" beats a confident guess. Name the places
   you searched so the reader can look further.
4. **No marker for what is not a fact:** advice, a recommendation, a question, or your reasoning about marked facts.
   Label an opinion as yours.
5. **Never invent a source.** Do not cite a file you did not read or a URL you did not open.
6. A quote cannot contain `]`. Quote a shorter run of words instead.

## Check before you answer

When the answer is going to be relied on, save it and run the checker:

```sh
node <skill-dir>/check.mjs answer.md --root <folder the sources are in> [--fetch] [--strict]
```

- Exit `0`: every marked claim holds. `1`: a claim failed: fix it, or turn it into a NULL. `2`: nothing failed,
  but something was not checked (a URL without `--fetch`, a missing file, numbers with no marker): say so or fix it.
- Numbers the checker lists as **UNMARKED** are leads: mark them, or make sure they are not claims of fact
  (a version number, a step number).

Tell the user the checker's result in one line. A passing check proves the quotes are real and the sums are right;
it does not prove the source itself is true.

## Example

> The free-shipping threshold is 50 EUR [Q: terms.md:3 "Shipping is free above 50 EUR."]. Your cart of two items
> at 30 EUR comes to [C: 2 * 30 = 60] EUR, so it ships free. The return window for opened items is not stated
> [N: searched terms.md, faq.md].
