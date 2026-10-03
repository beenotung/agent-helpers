# Reasoning field names & replay recall

How each provider names the reasoning trace, and whether a model reads that
trace back when a previous assistant turn is replayed in the history.

## Method

Turns 1–3 are hardcoded; only turn 4 is a live call.

```
1  user      : "What color is the ball?"
2  assistant : content            = "The ball is red."
               <field name>       = "<pct>% to be red, <100-pct>% green. Going with red."
3  user      : "What percentage likelihood did you state?"
4  assistant : recites <pct>  -> recall    (reads the field)
               denies         -> no recall (does not read the field)
               other value    -> fabricates
```

- the planted value is **non-round** (37, 62, 73, …) so a guess or a fabricated
  default cannot be mistaken for recall
- the value appears **only** in the reasoning field, never in `content`, so the
  model cannot read it from its visible answer
- `recall rate` = `hits / replays (percentage)`, using only the field name the
  model itself wrote (the wrong key always fails, so it is excluded)
- `⚠` marks a model that fabricates a different value rather than denying; a
  naive substring check can mistake this for recall
- every hit was confirmed by reading the full reply — a substring check alone
  produced both false positives and false negatives during this investigation

## Recalls its own reasoning

| provider     | model                           | writes              | reads via           | recall rate |
| ------------ | ------------------------------- | ------------------- | ------------------- | ----------- |
| lm-studio    | `opencodereasoning-nemotron-7b` | `reasoning_content` | both                | 6/6 (100%)  |
| lm-studio    | `muse-12b`                      | `reasoning_content` | both                | 6/6 (100%)  |
| zen          | `space-bunny-free`              | `reasoning_content` | `reasoning_content` | 6/10 (60%)  |
| ollama-cloud | `glm-5.2`                       | `reasoning`         | `reasoning`         | 4/10 (40%)  |

`reads via` matches `writes` for every model except the two LM Studio ones, which
accept either key.

## Does not recall

Grouped by family so sibling contrasts stay visible.

| family   | provider           | model                                  | writes              | recall rate |
| -------- | ------------------ | -------------------------------------- | ------------------- | ----------- |
| DeepSeek | ollama-cloud       | `deepseek-v4.1-flash`                  | `reasoning`         | 0/8 (0%)    |
| DeepSeek | ollama-cloud       | `deepseek-v4-pro:0813`                 | `reasoning`         | 0/8 (0%)    |
| DeepSeek | deepseek (own API) | `deepseek-flash`                       | `reasoning_content` | 0/6 (0%)    |
| DeepSeek | deepseek (own API) | `deepseek-v4-pro`                      | `reasoning_content` | 0/6 (0%)    |
| DeepSeek | lm-studio          | `deepseek-v4-pro-qwen3.5-4b-mtp`       | `reasoning_content` | 0/6 (0%)    |
| DeepSeek | lm-studio          | `qwen3.5-9b-deepseek-v4-flash`         | `reasoning_content` | 0/6 (0%)    |
| DeepSeek | lm-studio          | `qwen3.5-9b-deepseek-v4-flash-i1`      | `reasoning_content` | 0/6 (0%)    |
| GLM      | ollama-cloud       | `glm-5.3`                              | `reasoning`         | 0/8 (0%)    |
| GLM      | ollama-cloud       | `glm-5.3-flash`                        | `reasoning`         | 0/16 (0%)   |
| GPT-OSS  | ollama-cloud       | `gpt-oss:20b`                          | `reasoning`         | 0/8 (0%)    |
| GPT-OSS  | ollama-cloud       | `gpt-oss:120b`                         | `reasoning`         | 0/8 (0%)    |
| Kimi     | ollama-cloud       | `kimi-k2.6`                            | `reasoning`         | 0/8 (0%)    |
| Kimi     | ollama-cloud       | `kimi-k3`                              | `reasoning`         | 0/8 (0%)    |
| Kimi     | ollama-cloud       | `kimi-k2.7-code`                       | `reasoning`         | 0/8 (0%)    |
| MiniMax  | ollama-cloud       | `minimax-m2.7`                         | `reasoning`         | 0/8 (0%)    |
| MiniMax  | ollama-cloud       | `minimax-m3`                           | `reasoning`         | ⚠ 0/8 (0%)  |
| Mistral  | ollama-cloud       | `mistral-large-3:675b`                 | `reasoning`         | 0/8 (0%)    |
| Nemotron | ollama-cloud       | `nemotron-3-ultra`                     | `reasoning`         | 0/8 (0%)    |
| Nemotron | ollama-cloud       | `nemotron-3-super`                     | `reasoning`         | 0/8 (0%)    |
| Nemotron | ollama-cloud       | `nemotron-3-nano:30b`                  | `reasoning`         | ⚠ 0/8 (0%)  |
| Nemotron | lm-studio          | `nvidia/nemotron-3-nano-4b`            | `reasoning_content` | 0/6 (0%)    |
| Nemotron | lm-studio          | `nvidia_nemotron-cascade-14b-thinking` | `reasoning_content` | 0/6 (0%)    |
| Qwen     | lm-studio          | `qwen/qwen3-4b-thinking-2507`          | `reasoning_content` | 0/6 (0%)    |
| other    | lm-studio          | `prism-ml/bonsai-27b`                  | `reasoning_content` | 0/6 (0%)    |
| Gemma    | ollama-cloud       | `gemma4:31b`                           | none (non-thinking) | 0/6 (0%)    |

`⚠` — answers by inventing a fresh value (e.g. `~100%`) rather than denying. A
naive substring check can mistake this for recall.

## Emits no reasoning field

These never emit a reasoning field, so there is nothing to read and nothing to
replay. Tested, not assumed.

| provider  | model                       | notes                                     |
| --------- | --------------------------- | ----------------------------------------- |
| poe       | `gpt-5.4`, `gpt-5.4-mini`   | answered via `content` only               |
| poe       | `claude-sonnet-5.5`         | 400s on explicit chain-of-thought prompts |
| poe       | `mistral-small-4`           | reasoned up to 23,449 chars of `content`  |
| lm-studio | `openreasoning-nemotron-7b` |                                           |

## Field name per provider

| provider                                  | field(s) emitted         | notes            |
| ----------------------------------------- | ------------------------ | ---------------- |
| LM Studio (llama.cpp)                     | `reasoning_content`      |                  |
| opencode zen                              | `reasoning_content`      |                  |
| Ollama Cloud                              | `reasoning`              |                  |
| DeepSeek (own API)                        | `reasoning_content`      |                  |
| **Poe** (Gemini, Grok, Qwen, Gemma, Kimi) | **both, byte-identical** | 5 / 5 sampled    |
| Poe (GPT, Claude, Mistral, DeepSeek)      | none                     | strips reasoning |

`reasoning_text` is OpenAI **Responses-API-only** and never appears over chat
completions.

Poe duplicating the same text under both keys is handled correctly by
`getReasoning()`'s `a ?? b` — it returns the first and does not double the text.

## Reliability & sample size

Recall is **noisy** and varies widely by model — see the `recall rate` column
above. Even one model varies between sessions: `glm-5.2` scored 4/4, then 1/4,
then 3/8 on its native key. **Treat any single measurement as unreliable.**

The rates count only the field name the model itself wrote. Sending the _wrong_
key always fails (0%), but that is a deterministic key-match fact, not a
probabilistic miss, so it is excluded.

For sample size, a lower rate makes a false negative _more_ likely. Using 50%
and 25% to bracket the observed rates:

| runs | false negative @ 50% | @ 25% |
| ---- | -------------------- | ----- |
| 1    | 50%                  | 75%   |
| 3    | 12%                  | 42%   |
| 6    | 1.6%                 | 18%   |
| 10   | 0.1%                 | 5.6%  |

**Run 6–10 times before treating a negative as real** — more if the rate looks
low.

A **positive** is asymmetric — one is usually enough. Reciting a non-round value
that appears nowhere in `content` cannot be explained by guessing. But confirm
by reading the reply, not by substring match:

| failure mode   | example seen                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| false positive | a `43%` plant was "matched" although the reply asserted `60%`; `mistral-large-3:675b` recited "80%" inside an invented hypothetical |
| false negative | `glm-5.2` classified as "no" by a detector bug at n=1, later shown to recall                                                        |
| fabrication    | `nemotron-3-nano:30b` and `minimax-m3` answer with a fresh `~100%` rather than denying                                              |

## Findings not visible in the tables

1. **Anti-luck check.** `glm-5.2` was planted 8 distinct non-round values
   (17/29/43/58/73/91/37/62); every value it produced was exactly correct —
   never wrong, never a default.
2. **The field is not prompt- or difficulty-triggerable.** 4 prompt wordings
   ("think step by step", "show chain-of-thought", scratchpad, …) × 4 problem
   difficulties (trivial → 23K-char hard) produced zero fields on models that
   do not emit them. The reasoning happened, but stayed in `content`.
3. **Emitting the field is a serving-stack property.** Same model can differ by
   stack: `gemma4:31b` emits none on Ollama, but Poe's `gemma-4-31b` emits both.

## Design implication

A model reads back only the key it wrote (see `reads via` above), and providers
write different keys — so **you cannot force-normalise the write direction to a
single field name.**

- **read** (provider → us): accept multiple field-name variants, normalise to one
  internal field. Safe, because reading tolerates either name.
- **write** (us → provider): preserve the provider's original key, per message.
  Do not rewrite it to a canonical name.
- treat cross-turn reasoning continuity as **best-effort**, never required.

### Known gap in this repo

`complete()` preserves the provider's original key (and adds
`reasoning_content`), so both GLM and zen work. But `StreamResponse.toMessage()`
emits `reasoning_content` **only**, discarding the original. For an Ollama/GLM
streamed response this loses reasoning continuity on replay, while the
non-streaming path keeps it. Tracked in `todo.md`.

## Caveats

- several cells are low-n; only GLM, zen and the LM Studio recallers were
  repeated substantially
- LM Studio has ~28 further models unsampled; Poe has ~330
- a model that emits no field cannot be tested for recall — that is a coverage
  gap, not a negative result
