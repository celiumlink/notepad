# Develop prompts by comparing real outputs

Treat a prompt change like a small experiment: preserve the failing input,
change one hypothesis, run the real model, and retain the outputs—including
regressions. Unit tests alone cannot establish that a model follows an instruction.

## Repeatable procedure

1. Capture the exact draft before/after the cursor, references, writing direction,
   model, and serialized request. The sidebar's **Under the hood** section exposes
   these. Use synthetic text in committed examples rather than private writing.
2. State the desired behavior before changing the prompt. Here: continue in the
   language near the cursor, despite references or instructions in other languages;
   output only insertable text, without translating or repeating the draft.
3. Preserve the baseline prompt. Run it against the same cases as each candidate.
   Hold model, sampling, token budget, and stop sequences fixed. Disable request
   caching or request fresh generation, so a cached answer cannot hide a change.
4. Review complete outputs, not just their first words. Check language, insertability,
   repetition, reference use, suffix fit, explanations, and truncation independently.
   Empty output is a failure, even when it contains no wrong-language text.
5. Add deterministic tests for the prompt contract and host integration. Keep live
   model evaluation separate: it requires model weights and can vary across model
   versions, quantizations, and hardware even with temperature zero.
6. Keep the simplest prompt supported by the evidence. Preserve rejected variants
   and their actual outputs so future work does not repeat the same mistakes.
7. Rebuild the artifact after changing the shared kernel. The extension packages a
   copy of `src`; editing `src` does not update an already installed VSIX.

## This experiment

The local model was `qwen-local`, Qwen2-family, approximately 3.1B parameters,
Q4_K_M quantization. Runs used raw generation, temperature 0, 32 output tokens,
top-p 0.9, and a 4,096-token context. Exact requests, settings, outputs, timestamps,
and model details are in [language-results.json](language-results.json) and
[language-final-results.json](language-final-results.json).

The initial prompt used English examples and ended in `Missing text:` or
`Next thought:`. That supplied English continuation cues even for other languages.
We tried removing the examples and adding an explicit language instruction, then
tried appending the draft after those answer labels. Those changes were **not
consistently better**:

| Input and reference | Original examples | Language instruction only | Draft appended after labels |
|---|---|---|---|
| `Heute möchte ich mehr Zeit für` + suffix ` finden.`; reference `Make room for what matters.` | ` mich` | ` "Heute möchte ich mehr Zeit für mich selbst finden."` (repeats the draft) | A single space (no useful insertion) |
| `Je voudrais prendre plus de temps pour`; direction `Keep it brief.` | ` réfléchir.` | ` Je voudrais prendre plus de temps pour` (repeats the draft) | Empty output |
| `Quiero pasar más tiempo con`; reference `Friends and family.` | ` mi familia y mis amigos` | ` with my friends and family.` followed by English assistant boilerplate | ` mis amigos y familiares.` |
| `今日はもっと`; reference `Make room for friends and family.` | ` よく眠れる日だった。` | ` 今日、もっとゆっくり歩くようにしましょう。` | A newline then `今日、私は友達と家族のためにスペースを確保する必要があります。` |
| Hint for `Ich möchte meinen Alltag ruhiger gestalten.`; reference `Less stress and more time for friends.` | ` Wie könnte ich meine Arbeit einfacher machen?` | ` I want to make my daily life more peaceful.` followed by English assistant boilerplate | `To simplify my daily routine and have more time for friends.` |

This is evidence against treating “add a stronger instruction” as an automatic fix.
The original examples sometimes worked better. A language-correct output can still
be unusable because it repeats the input, ignores the suffix, or changes the task.

We next shortened the contextual prompt and put the actual draft at the end,
without English examples or an answer label:

```text
[reference text and optional writing direction]
Continue the draft in its own language. Output only the insertion,
without explanations or translations.

Existing text after the cursor:
[suffix, when present]

Draft:
[prefix]
```

An exploratory version using `Make room for friends and family.` as reference
produced these exact beginnings at temperature 0 with a 32-token budget:

| Draft | Observed continuation |
|---|---|
| `Heute möchte ich mehr Zeit für` | ` meine Freunde und Familie haben. Ich weiß, dass es schwierig sein kann, sich von der Arbeit zu lösen und die richtigen Prioritäten` |
| `Je voudrais prendre plus de temps pour` | ` faire des activités avec mes amis et ma famille. Je pense que c'est important d'avoir un bon équilibre entre le travail et la vie person` |
| `Quiero pasar más tiempo con` | ` mis amigos y mi familia. Me gustaría tener más espacio para ellos en casa. ¿Cómo puedo hacer esto?` |
| `今日はもっと` | `友達と家族を招待したいです。 今日、友達と家族を招待するためのスペースが必要です。` followed by `Please note that I am an AI` |

These observations support anchoring on the draft for language selection, but
do not establish universal correctness. The Japanese output still drifted into
English, and the German insertion did not fit the existing suffix ` finden.`.
The final comparison uses the exact shipped prompt and original case inputs,
recorded separately in `language-final-results.json`.

The final candidate began in German, French, Spanish, and Japanese in this run;
the German hint was also German. It was **not a clean win**: the Spanish output
continued with `I want to spend more time with my friends and my family.`, and the
Japanese output appended an English `Translation:`. The German infill produced
` mich haben und weniger für andere investieren.` and further prose, which does
not fit the existing suffix. Preserve these failures as regression cases; do not
claim that a prompt change guarantees language adherence or correct infill.

There is no German-specific detection or language allowlist. The policy asks the
model to infer the language of the draft. Multilingual competence and compliance
remain properties of the selected model; short text and mixed-language passages
can be ambiguous. Further validation should include additional languages, scripts,
mixed-language drafts, plain continuation, hints, and mid-sentence insertion.

## Reproduce

Run `npm run eval:language` with Ollama running. `OLLAMA_HOST` and `MODEL` select
the service and model. This compares the preserved original prompts with the
current kernel and overwrites `docs/language-final-results.json`; the intermediate
experiment record remains unchanged. Review that diff before accepting a change.

Run `npm test` separately for deterministic tests. Live runs are not part of CI.
Keep all non-prompt parameters fixed when evaluating another prompt candidate.

On Windows, use UTF-8 files for multilingual fixtures. Piping inline PowerShell
text into Node can replace characters with `?` under some shell encodings. Those
corrupted exploratory runs were excluded from the comparison records. Unicode
escape sequences or UTF-8 files prevent the test harness from changing the input.
